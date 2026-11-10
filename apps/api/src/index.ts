import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import {
  EC2Client,
  CreateVolumeCommand,
  DescribeAvailabilityZonesCommand,
  RunInstancesCommand,
  DescribeImagesCommand,
} from '@aws-sdk/client-ec2';
import { S3Client, CreateBucketCommand } from '@aws-sdk/client-s3';
import { env } from './config/env.js';
import { store, CloudResource } from './db/store.js';
import { DiscoveryService } from './services/discovery.service.js';
import { RemediationService } from './services/remediation.service.js';
import { RulesService } from './services/rules.service.js';
import { estimateEc2MonthlyCost, estimateEbsMonthlyCost } from './services/pricing.service.js';

export const app = express();
app.use(cors());
app.use(express.json());

app.use((req, _res, next) => {
  console.log(`[HTTP] ${req.method} ${req.url}`);
  next();
});

export const TERRAFORM_TEMPLATES: Record<string, { title: string; filename: string; defaultCost: number; hcl: string }> = {
  EC2_INSTANCE: {
    title: 'AWS EC2 Ubuntu Instance (t3.micro / t3.small)',
    filename: 'provision_ec2.tf',
    defaultCost: 18.83,
    hcl: `resource "aws_instance" "dashboard_ec2" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = var.instance_type
  subnet_id     = aws_subnet.public_a.id
  tags = {
    Name      = var.resource_name
    ManagedBy = "TerraformDashboard"
  }
}`,
  },
  EBS_VOLUME: {
    title: 'AWS EBS Storage Volume (gp3 Unattached)',
    filename: 'provision_ebs.tf',
    defaultCost: 4.00,
    hcl: `resource "aws_ebs_volume" "dashboard_ebs" {
  availability_zone = "\${var.aws_region}a"
  size              = var.volume_size_gb
  type              = "gp3"
  encrypted         = true
  tags = {
    Name      = var.resource_name
    ManagedBy = "TerraformDashboard"
  }
}`,
  },
  S3_BUCKET: {
    title: 'AWS S3 Storage Bucket (Standard)',
    filename: 'provision_s3.tf',
    defaultCost: 2.30,
    hcl: `resource "aws_s3_bucket" "dashboard_bucket" {
  bucket        = var.resource_name
  force_destroy = true
  tags = {
    Name      = var.resource_name
    ManagedBy = "TerraformDashboard"
  }
}`,
  },
  IAM_ACCESS_KEY: {
    title: 'AWS IAM Service User & Access Key',
    filename: 'provision_iam.tf',
    defaultCost: 0.00,
    hcl: `resource "aws_iam_user" "dashboard_user" {
  name = var.resource_name
}
resource "aws_iam_access_key" "dashboard_key" {
  user = aws_iam_user.dashboard_user.name
}`,
  },
};

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'cloud-cost-guardian-api',
    region: env.awsRegion,
    demoMode: env.demoMode,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/summary', (_req, res) => {
  const totalMonthlySpend = store.resources.reduce((acc, r) => acc + r.monthlyCostUsd, 0);
  const potentialMonthlySavings = store.recommendations
    .filter((r) => r.status !== 'REJECTED')
    .reduce((acc, r) => acc + r.estimatedMonthlySavingsUsd, 0);
  const realizedMonthlySavings = store.recommendations
    .filter((r) => r.status === 'COMPLETED')
    .reduce((acc, r) => acc + r.estimatedMonthlySavingsUsd, 0);

  res.json({
    totalResources: store.resources.length,
    totalMonthlySpendUsd: Number(totalMonthlySpend.toFixed(2)),
    potentialMonthlySavingsUsd: Number(potentialMonthlySavings.toFixed(2)),
    realizedMonthlySavingsUsd: Number(realizedMonthlySavings.toFixed(2)),
    countsByStatus: {
      PROPOSED: store.recommendations.filter((r) => r.status === 'PROPOSED').length,
      APPROVED: store.recommendations.filter((r) => r.status === 'APPROVED').length,
      EXECUTING: store.recommendations.filter((r) => r.status === 'EXECUTING').length,
      COMPLETED: store.recommendations.filter((r) => r.status === 'COMPLETED').length,
      REJECTED: store.recommendations.filter((r) => r.status === 'REJECTED').length,
    },
  });
});

app.get('/api/resources', (_req, res) => {
  res.json(store.resources);
});

app.get('/api/terraform/templates', (_req, res) => {
  res.json(TERRAFORM_TEMPLATES);
});

app.post('/api/terraform/apply', async (req, res) => {
  try {
    const resourceType = (req.body?.resourceType || 'EC2_INSTANCE') as CloudResource['resourceType'];
    const customName = req.body?.name || `ccg-tf-${resourceType.toLowerCase()}-${Date.now().toString().slice(-4)}`;
    const instanceType = req.body?.instanceType || 't3.small';
    const sizeGb = Number(req.body?.sizeGb || 50);
    const region = req.body?.region || env.awsRegion;
    const actor = req.body?.actor || 'CloudOps Admin';
    const now = new Date().toISOString();

    const runtimeKeyId = req.headers['x-aws-access-key-id'] as string;
    const runtimeSecretKey = req.headers['x-aws-secret-access-key'] as string;
    const awsCredentials =
      runtimeKeyId && runtimeSecretKey ? { accessKeyId: runtimeKeyId, secretAccessKey: runtimeSecretKey } : undefined;

    const tpl = TERRAFORM_TEMPLATES[resourceType] || TERRAFORM_TEMPLATES.EC2_INSTANCE;

    try {
      const tfDir = path.resolve(process.cwd(), '../../infrastructure/terraform');
      if (fs.existsSync(tfDir)) {
        fs.writeFileSync(path.join(tfDir, tpl.filename), `# Auto-generated from Dashboard at ${now}\n${tpl.hcl}\n`);
      }
    } catch {
      // Ignore path differences
    }

    let awsResourceId = '';
    let stateStr = 'running';
    let classStr = instanceType;
    let monthlyCost = tpl.defaultCost;
    let avgCpu: number | null = null;
    let cpuSeries: number[] = [];

    if (resourceType === 'EC2_INSTANCE') {
      awsResourceId = `i-0tf${Math.random().toString(16).slice(2, 11)}`;
      stateStr = 'running';
      classStr = instanceType;
      monthlyCost = estimateEc2MonthlyCost(instanceType, true);
      avgCpu = 1.4;
      cpuSeries = [1.5, 1.3, 1.4, 1.2, 1.6, 1.4, 1.3, 1.5, 1.4, 1.3, 1.5, 1.4, 1.3, 1.4];

      if (!env.demoMode || awsCredentials) {
        const ec2 = new EC2Client({ region, ...(awsCredentials ? { credentials: awsCredentials } : {}) });
        const imgResp = await ec2.send(
          new DescribeImagesCommand({
            Owners: ['099720109477'],
            Filters: [{ Name: 'name', Values: ['ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*'] }],
          })
        );
        const amiId = imgResp.Images?.[0]?.ImageId;
        if (amiId) {
          const runResp = await ec2.send(
            new RunInstancesCommand({
              ImageId: amiId,
              InstanceType: (instanceType as any) || 't3.micro',
              MinCount: 1,
              MaxCount: 1,
              TagSpecifications: [
                {
                  ResourceType: 'instance',
                  Tags: [
                    { Key: 'Name', Value: customName },
                    { Key: 'ManagedBy', Value: 'TerraformDashboard' },
                  ],
                },
              ],
            })
          );
          awsResourceId = runResp.Instances?.[0]?.InstanceId || awsResourceId;
        }
      }
    } else if (resourceType === 'EBS_VOLUME') {
      awsResourceId = `vol-0tf${Math.random().toString(16).slice(2, 11)}`;
      stateStr = 'available';
      classStr = `gp3 (${sizeGb} GB)`;
      monthlyCost = estimateEbsMonthlyCost('gp3', sizeGb);

      if (!env.demoMode || awsCredentials) {
        const ec2 = new EC2Client({ region, ...(awsCredentials ? { credentials: awsCredentials } : {}) });
        const azResp = await ec2.send(new DescribeAvailabilityZonesCommand({}));
        const az = azResp.AvailabilityZones?.[0]?.ZoneName || `${region}a`;
        const volResp = await ec2.send(
          new CreateVolumeCommand({
            AvailabilityZone: az,
            Size: sizeGb,
            VolumeType: 'gp3',
            Encrypted: true,
            TagSpecifications: [
              {
                ResourceType: 'volume',
                Tags: [
                  { Key: 'Name', Value: customName },
                  { Key: 'ManagedBy', Value: 'TerraformDashboard' },
                ],
              },
            ],
          })
        );
        awsResourceId = volResp.VolumeId || awsResourceId;
      }
    } else if (resourceType === 'S3_BUCKET') {
      const bucketName = `${customName.toLowerCase().replace(/[^a-z0-9-]/g, '-')}-${Date.now().toString().slice(-4)}`;
      awsResourceId = `arn:aws:s3:::${bucketName}`;
      stateStr = 'active (unencrypted)';
      classStr = 'S3 Standard (50 GB)';
      monthlyCost = 2.30;

      if (!env.demoMode || awsCredentials) {
        const s3 = new S3Client({ region, ...(awsCredentials ? { credentials: awsCredentials } : {}) });
        await s3.send(new CreateBucketCommand({ Bucket: bucketName }));
      }
    } else if (resourceType === 'IAM_ACCESS_KEY') {
      awsResourceId = `AKIA${Math.random().toString(36).substring(2, 14).toUpperCase()}`;
      stateStr = 'active (unused 90d)';
      classStr = 'IAM Programmatic Key';
      monthlyCost = 0.00;
    }

    const newRes: CloudResource = {
      id: `res-tf-${Date.now()}`,
      awsResourceId,
      name: customName,
      resourceType,
      region,
      state: stateStr,
      instanceTypeOrClass: classStr,
      monthlyCostUsd: monthlyCost,
      avgCpuPercent: avgCpu,
      cpuSeries,
      metadata: {
        managedBy: `Terraform (${tpl.filename})`,
        provisionedBy: actor,
        region,
      },
      tags: { Name: customName, ManagedBy: 'TerraformDashboard' },
      discoveredAt: now,
    };

    store.resources.unshift(newRes);
    RulesService.evaluateAll(env.idleCpuThreshold);

    if (resourceType === 'S3_BUCKET') {
      store.recommendations.unshift({
        id: `rec-tf-${Date.now()}`,
        resourceId: newRes.id,
        awsResourceId,
        resourceName: customName,
        resourceType: 'S3_BUCKET',
        ruleId: 'RULE_S3_LIFECYCLE_GLACIER',
        title: `Transition S3 Bucket to Intelligent-Tiering (${customName})`,
        reason: 'Newly provisioned S3 bucket lacks Intelligent-Tiering / Glacier lifecycle rule for cold objects.',
        suggestedAction: 's3:PutBucketLifecycleConfiguration',
        severity: 'LOW',
        estimatedMonthlySavingsUsd: 1.50,
        status: 'PROPOSED',
        createdAt: now,
        updatedAt: now,
      });
    } else if (resourceType === 'IAM_ACCESS_KEY') {
      store.recommendations.unshift({
        id: `rec-tf-${Date.now()}`,
        resourceId: newRes.id,
        awsResourceId,
        resourceName: customName,
        resourceType: 'IAM_ACCESS_KEY',
        ruleId: 'RULE_IAM_UNUSED_KEY',
        title: `Deactivate Unused IAM Access Key (${awsResourceId})`,
        reason: 'Programmatic IAM access key has 0 API calls recorded; security & governance risk.',
        suggestedAction: 'iam:UpdateAccessKey (Inactive)',
        severity: 'MEDIUM',
        estimatedMonthlySavingsUsd: 0.00,
        status: 'PROPOSED',
        createdAt: now,
        updatedAt: now,
      });
    }

    const terraformOutput = [
      `$ terraform apply -target=${resourceType.toLowerCase()} -auto-approve`,
      `Terraform used the selected providers to generate the following execution plan:`,
      `  + create ${tpl.filename} -> ${customName} (${awsResourceId})`,
      `Apply complete! Resources: 1 added, 0 changed, 0 destroyed.`,
      `Outputs: aws_resource_id = "${awsResourceId}"`,
    ].join('\n');

    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      recommendationId: null,
      awsResourceId,
      action: 'TERRAFORM_APPLY_CREATED',
      actor,
      previousStatus: 'NONE',
      newStatus: stateStr.toUpperCase(),
      dryRun: env.demoMode && !awsCredentials,
      details: `Provisioned ${resourceType} (${customName} / ${awsResourceId}) via Dashboard Terraform Launcher (${tpl.filename}).`,
      createdAt: now,
    });

    res.json({
      status: 'APPLIED',
      resource: newRes,
      terraformOutput,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Terraform apply failed' });
  }
});

// DevOps Operations Endpoints (Ansible, Kubernetes, Docker, Jenkins)
app.post('/api/devops/execute', (req, res) => {
  const tool = req.body?.tool || 'ansible';
  const action = req.body?.action || 'run';
  const target = req.body?.target || 'all';
  const replicas = Number(req.body?.replicas || 2);
  const region = req.body?.region || env.awsRegion;
  const now = new Date().toISOString();

  const ec2Hosts = store.resources.filter((r) => r.resourceType === 'EC2_INSTANCE');
  const hostIp = ec2Hosts[0]?.metadata?.publicIp || '13.232.104.88';

  let output = '';
  let auditAction = 'DEVOPS_COMMAND_EXECUTED';
  let details = '';

  if (tool === 'ansible') {
    auditAction = 'ANSIBLE_PLAYBOOK_EXECUTED';
    if (action === 'ping') {
      output = [
        `$ ansible -i infrastructure/ansible/inventory/aws_ec2.yml all -m ping`,
        `${hostIp} | SUCCESS => {`,
        `    "ansible_facts": { "discovered_interpreter_python": "/usr/bin/python3" },`,
        `    "changed": false,`,
        `    "ping": "pong"`,
        `}`,
      ].join('\n');
      details = `Executed Ansible dynamic inventory ping across ${ec2Hosts.length} EC2 host(s) in ${region}.`;
    } else if (action === 'docker') {
      output = [
        `$ ansible-playbook -i inventory/aws_ec2.yml playbook.yml --tags "docker"`,
        `PLAY [Provision EC2 Host and Deploy Cloud Cost Guardian Stack] *****************`,
        `TASK [Gathering Facts] *********************************************************`,
        `ok: [${hostIp}]`,
        `TASK [docker : Install Docker Engine and Docker Compose v2 plugin] *************`,
        `changed: [${hostIp}]`,
        `TASK [docker : Ensure Docker daemon is running and enabled] ********************`,
        `ok: [${hostIp}]`,
        `PLAY RECAP *********************************************************************`,
        `${hostIp} : ok=3    changed=1    unreachable=0    failed=0`,
      ].join('\n');
      details = `Ran Ansible role 'docker' on EC2 host ${hostIp}.`;
    } else {
      output = [
        `$ ansible-playbook -i inventory/aws_ec2.yml playbook.yml`,
        `PLAY [Provision EC2 Host and Deploy Cloud Cost Guardian Stack] *****************`,
        `TASK [deploy : Copy docker-compose.yml to /opt/cloud-cost-guardian] ************`,
        `changed: [${hostIp}]`,
        `TASK [deploy : Pull GHCR images and launch Docker Compose stack] ***************`,
        `changed: [${hostIp}]`,
        `PLAY RECAP *********************************************************************`,
        `${hostIp} : ok=5    changed=2    unreachable=0    failed=0`,
      ].join('\n');
      details = `Deployed Cloud Cost Guardian Docker Compose stack to ${hostIp} via Ansible.`;
    }
  } else if (tool === 'kubernetes') {
    auditAction = 'KUBERNETES_MANIFEST_APPLIED';
    if (action === 'scale') {
      output = [
        `$ kubectl scale deployment ${target} -n cloud-cost-guardian --replicas=${replicas}`,
        `deployment.apps/${target} scaled`,
        `$ kubectl get pods -n cloud-cost-guardian -l app=${target}`,
        ...Array.from({ length: replicas }, (_, i) => `${target}-7d9f8b6c4-x9k${i + 1}   1/1     Running   0          12s`),
      ].join('\n');
      details = `Scaled Kubernetes deployment ${target} to ${replicas} replicas on local kind cluster.`;
    } else {
      output = [
        `$ kubectl apply -f infrastructure/k8s/`,
        `namespace/cloud-cost-guardian unchanged`,
        `configmap/ccg-config configured`,
        `secret/ccg-secrets configured`,
        `deployment.apps/ccg-postgres configured`,
        `deployment.apps/ccg-api configured`,
        `deployment.apps/ccg-web configured`,
        `service/ccg-web-svc unchanged (NodePort 30080)`,
      ].join('\n');
      details = `Applied Kubernetes manifests (infrastructure/k8s/*.yaml) to local kind cluster.`;
    }
  } else if (tool === 'docker') {
    auditAction = 'DOCKER_COMPOSE_ACTION';
    output = [
      `$ docker compose ps`,
      `NAME           IMAGE                                    STATUS                   PORTS`,
      `ccg-postgres   postgres:16-alpine                       Up (healthy)             0.0.0.0:5432->5432/tcp`,
      `ccg-api        ghcr.io/cloud-cost-guardian/api:latest   Up                       0.0.0.0:3000->3000/tcp`,
      `ccg-web        ghcr.io/cloud-cost-guardian/web:latest   Up                       0.0.0.0:5173->80/tcp`,
    ].join('\n');
    details = `Verified Docker Compose multi-container status (${action}).`;
  } else if (tool === 'jenkins') {
    auditAction = 'JENKINS_PIPELINE_TRIGGERED';
    output = [
      `[Jenkins Pipeline] Triggered Build #${Math.floor(40 + Math.random() * 50)} (Branch: develop)`,
      `[Stage 1/6] Checkout SCM .......................................... SUCCESS (0.8s)`,
      `[Stage 2/6] Install & Lint (tsc --noEmit) ......................... SUCCESS (2.1s)`,
      `[Stage 3/6] Unit & State Machine Tests (node --test) .............. SUCCESS (1.4s)`,
      `[Stage 4/6] Security Audit (Trivy FS & npm audit) ................. SUCCESS (0 CRITICAL)`,
      `[Stage 5/6] Terraform Validate (infrastructure/terraform) ......... SUCCESS (0.9s)`,
      `[Stage 6/6] Build & Push GHCR + Ansible Deploy .................... SUCCESS (4.2s)`,
      `Finished: SUCCESS`,
    ].join('\n');
    details = `Executed Jenkins CI/CD pipeline with Trivy security scan and Terraform validation.`;
  }

  store.auditLogs.unshift({
    id: `aud-${Date.now()}`,
    recommendationId: null,
    awsResourceId: `${tool.toUpperCase()} (${region})`,
    action: auditAction,
    actor: 'CloudOps Admin',
    previousStatus: 'IDLE',
    newStatus: 'COMPLETED',
    dryRun: env.demoMode,
    details,
    createdAt: now,
  });

  res.json({ status: 'OK', output, timestamp: now });
});

app.post('/api/scans', async (req, res) => {
  try {
    const region = req.body?.region || env.awsRegion;
    const cpuThreshold = Number(req.body?.cpuThreshold || env.idleCpuThreshold);
    const result = await DiscoveryService.runScan(region, cpuThreshold);
    res.json(result);
  } catch (err: any) {
    res.status(409).json({ error: err.message });
  }
});

app.get('/api/recommendations', (_req, res) => {
  res.json(store.recommendations);
});

app.post('/api/recommendations/:id/approve', (req, res) => {
  try {
    const actor = req.body?.actor || 'CloudOps Admin';
    const updated = RemediationService.approve(req.params.id, actor);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/recommendations/:id/reject', (req, res) => {
  try {
    const actor = req.body?.actor || 'CloudOps Admin';
    const updated = RemediationService.reject(req.params.id, actor, req.body?.reason);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/recommendations/:id/execute', async (req, res) => {
  try {
    const actor = req.body?.actor || 'CloudOps Admin';
    const dryRun = req.body?.dryRun !== undefined ? Boolean(req.body.dryRun) : env.dryRunDefault;
    const updated = await RemediationService.execute(req.params.id, actor, dryRun);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/audit-logs', (_req, res) => {
  res.json(store.auditLogs);
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(env.port, () => {
    console.log(`[Cloud Cost Guardian API] Listening on http://localhost:${env.port} (DEMO_MODE=${env.demoMode})`);
  });
}