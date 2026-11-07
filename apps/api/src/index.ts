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
    const actor = req.body?.actor || 'Himansu Mallik (RA2311003012367)';
    const now = new Date().toISOString();

    // Extract runtime AWS credentials from request headers sent by frontend
    const runtimeKeyId = req.headers['x-aws-access-key-id'] as string;
    const runtimeSecretKey = req.headers['x-aws-secret-access-key'] as string;
    const awsCredentials = runtimeKeyId && runtimeSecretKey ? { accessKeyId: runtimeKeyId, secretAccessKey: runtimeSecretKey } : undefined;

    const tpl = TERRAFORM_TEMPLATES[resourceType] || TERRAFORM_TEMPLATES.EC2_INSTANCE;

    // Write generated .tf file into infrastructure/terraform/ if directory exists
    try {
      const tfDir = path.resolve(process.cwd(), '../../infrastructure/terraform');
      if (fs.existsSync(tfDir)) {
        fs.writeFileSync(path.join(tfDir, tpl.filename), `# Auto-generated from Dashboard by ${actor} at ${now}\n${tpl.hcl}\n`);
      }
    } catch {
      // Ignore fs path differences
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
    console.error('[TERRAFORM APPLY ERROR]', err.message || err);
    res.status(400).json({ error: err.message || 'Terraform apply failed' });
  }
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

app.post('/api/waste/spawn', (req, res) => {
  store.wasteCounter++;
  const suffix = String(store.wasteCounter).padStart(2, '0');
  const region = req.body?.region || env.awsRegion;
  const instId = `i-0ccg${Math.random().toString(16).slice(2, 11)}`;
  const volId = `vol-0ccg${Math.random().toString(16).slice(2, 11)}`;
  const newEc2Id = `res-waste-ec2-${store.wasteCounter}`;
  const newEbsId = `res-waste-ebs-${store.wasteCounter}`;
  const now = new Date().toISOString();

  store.resources.unshift(
    {
      id: newEc2Id,
      awsResourceId: instId,
      name: `ccg-waste-idle-worker-${suffix}`,
      resourceType: 'EC2_INSTANCE',
      region,
      state: 'running',
      instanceTypeOrClass: 't3.small',
      monthlyCostUsd: 18.83,
      avgCpuPercent: 1.2,
      cpuSeries: [1.4, 1.1, 1.3, 1.0, 1.2, 1.5, 1.1, 1.2, 1.3, 1.1, 1.2, 1.0, 1.3, 1.2],
      metadata: { vpcId: 'vpc-0ccg771', publicIp: '13.232.190.42', launchDaysAgo: 14, managedBy: 'Terraform (waste.tf)' },
      tags: { Environment: 'sandbox-waste', ManagedBy: 'Terraform' },
      discoveredAt: now,
    },
    {
      id: newEbsId,
      awsResourceId: volId,
      name: `ccg-unattached-1gb-waste-${suffix}`,
      resourceType: 'EBS_VOLUME',
      region,
      state: 'available',
      instanceTypeOrClass: 'gp3 (20 GB)',
      monthlyCostUsd: 1.60,
      avgCpuPercent: null,
      cpuSeries: [],
      metadata: { sizeGb: 20, encrypted: true, daysUnattached: 15, managedBy: 'Terraform (waste.tf)' },
      tags: { Environment: 'sandbox-waste', ManagedBy: 'Terraform' },
      discoveredAt: now,
    }
  );

  store.recommendations.unshift(
    {
      id: `rec-waste-ec2-${store.wasteCounter}`,
      resourceId: newEc2Id,
      awsResourceId: instId,
      resourceName: `ccg-waste-idle-worker-${suffix}`,
      resourceType: 'EC2_INSTANCE',
      ruleId: 'RULE_EC2_IDLE_CPU',
      title: 'Stop Idle Terraform Waste Instance (Avg CPU 1.2%)',
      reason: 'Spawned via infrastructure/terraform/waste.tf with 1.2% average CPU utilization.',
      suggestedAction: 'ec2:StopInstances',
      severity: 'HIGH',
      estimatedMonthlySavingsUsd: 18.83,
      status: 'PROPOSED',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `rec-waste-ebs-${store.wasteCounter}`,
      resourceId: newEbsId,
      awsResourceId: volId,
      resourceName: `ccg-unattached-1gb-waste-${suffix}`,
      resourceType: 'EBS_VOLUME',
      ruleId: 'RULE_EBS_UNATTACHED',
      title: 'Snapshot & Delete Unattached Terraform Waste Volume',
      reason: 'Spawned via infrastructure/terraform/waste.tf in "available" (unattached) state.',
      suggestedAction: 'ec2:CreateSnapshot -> ec2:DeleteVolume',
      severity: 'LOW',
      estimatedMonthlySavingsUsd: 1.60,
      status: 'PROPOSED',
      createdAt: now,
      updatedAt: now,
    }
  );

  store.auditLogs.unshift({
    id: `aud-${Date.now()}`,
    recommendationId: null,
    awsResourceId: `${instId}, ${volId}`,
    action: 'TERRAFORM_WASTE_APPLIED',
    actor: req.body?.actor || 'Himansu Mallik (RA2311003012367)',
    previousStatus: null,
    newStatus: 'PROPOSED',
    dryRun: true,
    details: 'Applied infrastructure/terraform/waste.tf and flagged 2 new waste resources.',
    createdAt: now,
  });

  res.json({ status: 'OK', spawned: [instId, volId] });
});

app.get('/api/recommendations', (_req, res) => {
  res.json(store.recommendations);
});

app.post('/api/recommendations/:id/approve', (req, res) => {
  try {
    const actor = req.body?.actor || 'Himansu Mallik (RA2311003012367)';
    const updated = RemediationService.approve(req.params.id, actor);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/recommendations/:id/reject', (req, res) => {
  try {
    const actor = req.body?.actor || 'Aarnov Adhikari (RA2311003012365)';
    const updated = RemediationService.reject(req.params.id, actor, req.body?.reason);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/recommendations/:id/execute', async (req, res) => {
  try {
    const actor = req.body?.actor || 'Utsav Gautam (RA2311003012366)';
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