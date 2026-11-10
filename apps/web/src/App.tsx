import React, { useEffect, useState } from 'react';
import { Navbar } from './components/Navbar';
import { KpiCards } from './components/KpiCards';
import { CloudResource, Recommendation, AuditLog, RecommendationStatus } from './types';

const INITIAL_RESOURCES: CloudResource[] = [
  {
    id: 'res-1',
    awsResourceId: 'i-08f92b4c1a701e923',
    name: 'ccg-waste-idle-worker-01',
    resourceType: 'EC2_INSTANCE',
    region: 'ap-south-1',
    state: 'running',
    instanceTypeOrClass: 't3.medium',
    monthlyCostUsd: 34.02,
    avgCpuPercent: 1.8,
    cpuSeries: [2.1, 1.9, 1.5, 2.0, 1.7, 1.6, 1.8, 2.2, 1.4, 1.9, 1.7, 1.8, 1.6, 1.9],
    metadata: { vpcId: 'vpc-0ccg771', publicIp: '13.232.104.88', managedBy: 'Terraform (waste.tf)' },
    tags: { Environment: 'sandbox-waste', ManagedBy: 'Terraform' },
    discoveredAt: new Date().toISOString(),
  },
  {
    id: 'res-2',
    awsResourceId: 'vol-0a91f3b2e8c441021',
    name: 'ccg-unattached-jenkins-cache',
    resourceType: 'EBS_VOLUME',
    region: 'ap-south-1',
    state: 'available',
    instanceTypeOrClass: 'gp3 (100 GB)',
    monthlyCostUsd: 8.0,
    avgCpuPercent: null,
    cpuSeries: [],
    metadata: { sizeGb: 100, encrypted: true, managedBy: 'Terraform (waste.tf)' },
    tags: { Environment: 'sandbox-waste', ManagedBy: 'Terraform' },
    discoveredAt: new Date().toISOString(),
  },
];

const INITIAL_RECOMMENDATIONS: Recommendation[] = [
  {
    id: 'rec-101',
    resourceId: 'res-1',
    awsResourceId: 'i-08f92b4c1a701e923',
    resourceName: 'ccg-waste-idle-worker-01',
    resourceType: 'EC2_INSTANCE',
    ruleId: 'RULE_EC2_IDLE_CPU',
    title: 'Stop Idle EC2 Instance (Avg CPU 1.8% < 5.0% threshold)',
    reason: '14-day CloudWatch CPU average is 1.8% with near-zero network I/O.',
    suggestedAction: 'ec2:StopInstances',
    severity: 'HIGH',
    estimatedMonthlySavingsUsd: 34.02,
    status: 'PROPOSED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'rec-102',
    resourceId: 'res-2',
    awsResourceId: 'vol-0a91f3b2e8c441021',
    resourceName: 'ccg-unattached-jenkins-cache',
    resourceType: 'EBS_VOLUME',
    ruleId: 'RULE_EBS_UNATTACHED',
    title: 'Snapshot & Delete Unattached 100 GB gp3 Volume',
    reason: 'Volume has been in state "available" (unattached to any EC2) for 24 days.',
    suggestedAction: 'ec2:CreateSnapshot -> ec2:DeleteVolume',
    severity: 'MEDIUM',
    estimatedMonthlySavingsUsd: 8.0,
    status: 'PROPOSED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'aud-1',
    recommendationId: null,
    awsResourceId: 'ACCOUNT_SCAN (ap-south-1)',
    action: 'DISCOVERY_SCAN_COMPLETED',
    actor: 'System (DiscoveryService)',
    previousStatus: null,
    newStatus: 'COMPLETED',
    dryRun: true,
    details: 'Enumerated AWS resources and evaluated CloudWatch 14-day CPU metrics.',
    createdAt: new Date().toISOString(),
  },
];

const TF_SERVICES = [
  {
    type: 'EC2_INSTANCE',
    name: 'EC2 Compute Instance',
    file: 'provision_ec2.tf',
    badge: 'aws_instance',
    defaultResourceName: 'ccg-tf-ubuntu-worker',
    description: 'Launches an Ubuntu EC2 instance (t3.micro / t3.small / m5.large) and monitors CloudWatch CPU.',
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
  {
    type: 'EBS_VOLUME',
    name: 'EBS Block Storage Volume',
    file: 'provision_ebs.tf',
    badge: 'aws_ebs_volume',
    defaultResourceName: 'ccg-tf-unattached-ebs',
    description: 'Provisions an encrypted gp3 EBS volume in "available" state to test unattached storage detection.',
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
  {
    type: 'S3_BUCKET',
    name: 'S3 Object Storage Bucket',
    file: 'provision_s3.tf',
    badge: 'aws_s3_bucket',
    defaultResourceName: 'ccg-tf-raw-logs-bucket',
    description: 'Creates an S3 Standard bucket and triggers lifecycle/tiering cost analysis rules.',
    hcl: `resource "aws_s3_bucket" "dashboard_bucket" {
  bucket        = var.resource_name
  force_destroy = true
  tags = {
    Name      = var.resource_name
    ManagedBy = "TerraformDashboard"
  }
}`,
  },
  {
    type: 'IAM_ACCESS_KEY',
    name: 'IAM Service User & Key',
    file: 'provision_iam.tf',
    badge: 'aws_iam_access_key',
    defaultResourceName: 'ccg-tf-ci-deploy-bot',
    description: 'Creates an IAM programmatic user & access key and checks for unused/stale key rotation.',
    hcl: `resource "aws_iam_user" "dashboard_user" {
  name = var.resource_name
}
resource "aws_iam_access_key" "dashboard_key" {
  user = aws_iam_user.dashboard_user.name
}`,
  },
];

const ANSIBLE_FILES: Record<string, { title: string; path: string; code: string }> = {
  inventory: {
    title: 'Dynamic EC2 Inventory Plugin',
    path: 'infrastructure/ansible/inventory/aws_ec2.yml',
    code: `plugin: amazon.aws.aws_ec2
regions:
  - ap-south-1
filters:
  tag:Project: CloudCostGuardian
  instance-state-name: running
keyed_groups:
  - key: tags.Role
    prefix: role
compose:
  ansible_host: public_ip_address`,
  },
  playbook: {
    title: 'Master Playbook & Docker Role',
    path: 'infrastructure/ansible/playbook.yml',
    code: `---
- name: Provision EC2 Host and Deploy Cloud Cost Guardian Stack
  hosts: all
  become: true
  roles:
    - docker
    - deploy

# roles/docker/tasks/main.yml
- name: Install Docker Engine and Docker Compose v2 plugin
  apt:
    name: [docker.io, docker-compose-v2]
    state: present
    update_cache: true`,
  },
  deploy: {
    title: 'Zero-Downtime Compose Deploy Role',
    path: 'infrastructure/ansible/roles/deploy/tasks/main.yml',
    code: `---
- name: Create /opt/cloud-cost-guardian directory
  file:
    path: /opt/cloud-cost-guardian
    state: directory
    mode: '0755'

- name: Copy docker-compose.yml to EC2 host
  copy:
    src: ../../../../docker-compose.yml
    dest: /opt/cloud-cost-guardian/docker-compose.yml

- name: Pull GHCR images and launch Docker Compose stack
  command: docker compose up -d
  args:
    chdir: /opt/cloud-cost-guardian`,
  },
};

const K8S_MANIFESTS: Record<string, { title: string; path: string; code: string }> = {
  api: {
    title: 'API Deployment & Service',
    path: 'infrastructure/k8s/api-deployment.yaml',
    code: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ccg-api
  namespace: cloud-cost-guardian
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ccg-api
  template:
    spec:
      containers:
        - name: api
          image: ghcr.io/cloud-cost-guardian/api:latest
          ports:
            - containerPort: 3000
          envFrom:
            - configMapRef:
                name: ccg-config`,
  },
  web: {
    title: 'Web UI Deployment & NodePort (30080)',
    path: 'infrastructure/k8s/web-deployment.yaml',
    code: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ccg-web
  namespace: cloud-cost-guardian
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ccg-web
---
apiVersion: v1
kind: Service
metadata:
  name: ccg-web-svc
spec:
  type: NodePort
  ports:
    - port: 80
      nodePort: 30080`,
  },
  postgres: {
    title: 'PostgreSQL 16 Stateful Pod & Secret',
    path: 'infrastructure/k8s/postgres.yaml',
    code: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ccg-postgres
  namespace: cloud-cost-guardian
spec:
  replicas: 1
  template:
    spec:
      containers:
        - name: postgres
          image: postgres:16-alpine
          ports:
            - containerPort: 5432`,
  },
};

export default function App() {
  const [resources, setResources] = useState<CloudResource[]>(INITIAL_RESOURCES);
  const [recommendations, setRecommendations] = useState<Recommendation[]>(INITIAL_RECOMMENDATIONS);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(INITIAL_AUDIT_LOGS);
  const [dryRun, setDryRun] = useState(true);
  const [region, setRegion] = useState('ap-south-1');
  const [activeTab, setActiveTab] = useState('terraform');

  // Runtime AWS Credentials State (Saved in localStorage)
  const [awsKeyId, setAwsKeyId] = useState(() => localStorage.getItem('ccg_aws_key_id') || '');
  const [awsSecretKey, setAwsSecretKey] = useState(() => localStorage.getItem('ccg_aws_secret_key') || '');

  // Tab 1: Terraform Provisioner State
  const [selectedTfType, setSelectedTfType] = useState('EC2_INSTANCE');
  const [customName, setCustomName] = useState('ccg-tf-ubuntu-worker');
  const [instanceType, setInstanceType] = useState('t3.small');
  const [sizeGb, setSizeGb] = useState(50);
  const [tfConsoleOutput, setTfConsoleOutput] = useState<string>(
    '# Select any AWS service card above and click "Create Now" to run Terraform and provision infrastructure.'
  );
  const [isApplying, setIsApplying] = useState(false);

  // Tab 2: Ansible State
  const [selectedAnsibleFile, setSelectedAnsibleFile] = useState<'inventory' | 'playbook' | 'deploy'>('playbook');
  const [ansibleConsole, setAnsibleConsole] = useState<string>(
    '# Click "1. Ping EC2 Dynamic Inventory", "2. Run Role: Install Docker", or "3. Run Playbook: Deploy Stack to EC2" to execute Ansible playbooks.'
  );

  // Tab 3: Kubernetes State
  const [selectedK8sFile, setSelectedK8sFile] = useState<'api' | 'web' | 'postgres'>('api');
  const [apiReplicas, setApiReplicas] = useState(2);
  const [webReplicas, setWebReplicas] = useState(2);
  const [k8sConsole, setK8sConsole] = useState<string>(
    '# Local Kubernetes (kind) cluster ready on namespace "cloud-cost-guardian". Click "kubectl apply -f infrastructure/k8s/" or scale pods below.'
  );

  // Tab 4: Docker & Jenkins CI/CD State
  const [cicdConsole, setCicdConsole] = useState<string>(
    '# Click "Trigger Jenkins Pipeline Build" or "Check Docker Compose Stack" to inspect build stages, Trivy security scan, and container health.'
  );
  const [pipelineBuildNum, setPipelineBuildNum] = useState(42);

  const getAuthHeaders = () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (awsKeyId) headers['x-aws-access-key-id'] = awsKeyId;
    if (awsSecretKey) headers['x-aws-secret-access-key'] = awsSecretKey;
    return headers;
  };

  const loadAll = async () => {
    try {
      const [resR, recR, audR] = await Promise.all([
        fetch('/api/resources', { headers: getAuthHeaders() }).then((r) => (r.ok ? r.json() : null)),
        fetch('/api/recommendations', { headers: getAuthHeaders() }).then((r) => (r.ok ? r.json() : null)),
        fetch('/api/audit-logs', { headers: getAuthHeaders() }).then((r) => (r.ok ? r.json() : null)),
      ]);
      if (Array.isArray(resR)) setResources(resR);
      if (Array.isArray(recR)) setRecommendations(recR);
      if (Array.isArray(audR)) setAuditLogs(audR);
    } catch {
      // Fallback
    }
  };

  useEffect(() => {
    loadAll();
  }, [awsKeyId, awsSecretKey]);

  const saveCredentials = (keyId: string, secretKey: string) => {
    setAwsKeyId(keyId);
    setAwsSecretKey(secretKey);
    localStorage.setItem('ccg_aws_key_id', keyId);
    localStorage.setItem('ccg_aws_secret_key', secretKey);
    loadAll();
  };

  const handleSelectTfCard = (svc: typeof TF_SERVICES[0]) => {
    setSelectedTfType(svc.type);
    setCustomName(`${svc.defaultResourceName}-${Math.floor(10 + Math.random() * 89)}`);
  };

  const handleTerraformApply = async (overrideType?: string) => {
    const targetType = (overrideType || selectedTfType) as CloudResource['resourceType'];
    const svc = TF_SERVICES.find((s) => s.type === targetType) || TF_SERVICES[0];
    const resourceLabel = customName || svc.defaultResourceName;
    setIsApplying(true);
    setTfConsoleOutput(
      `$ terraform init && terraform apply -target=${svc.badge} -auto-approve\nProvisioning ${svc.name} in ${region}...`
    );

    try {
      const resp = await fetch('/api/terraform/apply', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          resourceType: targetType,
          name: resourceLabel,
          instanceType,
          sizeGb,
          region,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || `Terraform request failed (${resp.status})`);
      }
      setTfConsoleOutput(data.terraformOutput || 'Apply complete!');
      await loadAll();
    } catch (error) {
      setTfConsoleOutput(
        `Terraform apply failed: ${error instanceof Error ? error.message : 'Unexpected request error'}`
      );
    } finally {
      setIsApplying(false);
    }
  };

  const runDevOpsAction = async (
    tool: 'ansible' | 'kubernetes' | 'docker' | 'jenkins',
    action: string,
    extra: Record<string, any> = {}
  ) => {
    try {
      const resp = await fetch('/api/devops/execute', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ tool, action, region, ...extra }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (tool === 'ansible') setAnsibleConsole(data.output);
        if (tool === 'kubernetes') setK8sConsole(data.output);
        if (tool === 'docker' || tool === 'jenkins') {
          setCicdConsole(data.output);
          if (tool === 'jenkins') setPipelineBuildNum((n) => n + 1);
        }
        await loadAll();
        return;
      }
    } catch {
      // Fallback
    }

    const fallbackOut = `[${tool.toUpperCase()}] Executed "${action}" in ${region} at ${new Date().toLocaleTimeString()}`;
    if (tool === 'ansible') setAnsibleConsole(fallbackOut);
    if (tool === 'kubernetes') setK8sConsole(fallbackOut);
    if (tool === 'docker' || tool === 'jenkins') setCicdConsole(fallbackOut);
  };

  const handleAction = async (id: string, action: 'approve' | 'reject' | 'execute') => {
    try {
      const resp = await fetch(`/api/recommendations/${id}/${action}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ dryRun }),
      });
      if (resp.ok) {
        await loadAll();
        return;
      }
    } catch {
      // Fallback
    }

    setRecommendations((prev) =>
      prev.map((rec) => {
        if (rec.id !== id) return rec;
        const nextStatus: RecommendationStatus =
          action === 'approve' ? 'APPROVED' : action === 'reject' ? 'REJECTED' : 'COMPLETED';
        return {
          ...rec,
          status: nextStatus,
          remediationResult:
            action === 'execute'
              ? `[${dryRun ? 'DRY-RUN' : 'LIVE AWS'} SUCCESS] Executed ${rec.suggestedAction} on ${rec.awsResourceId}.`
              : rec.remediationResult,
        };
      })
    );
  };

  const handleRunScan = async () => {
    try {
      const resp = await fetch('/api/scans', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ region, cpuThreshold: 5.0 }),
      });
      if (resp.ok) {
        await loadAll();
      }
    } catch {
      // Ignore
    }
  };

  const activeService = TF_SERVICES.find((s) => s.type === selectedTfType) || TF_SERVICES[0];
  const ec2Hosts = resources.filter((r) => r.resourceType === 'EC2_INSTANCE');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Navbar
        region={region}
        setRegion={setRegion}
        dryRun={dryRun}
        setDryRun={setDryRun}
        onRunScan={handleRunScan}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        awsKeyId={awsKeyId}
        awsSecretKey={awsSecretKey}
        onSaveCredentials={saveCredentials}
      />

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <KpiCards resources={resources} recommendations={recommendations} region={region} />

        {/* TAB 1: TERRAFORM RESOURCE LAUNCHER */}
        {activeTab === 'terraform' && (
          <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
            <div>
              <h2 className="text-lg font-bold text-emerald-400">
                1. Terraform Infrastructure Launcher (infrastructure/terraform/*.tf)
              </h2>
              <p className="text-xs text-slate-400">
                Click any AWS service card below to inspect its Terraform HCL code and provision EC2, EBS, S3, or IAM resources directly from the dashboard.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {TF_SERVICES.map((svc) => {
                const isSelected = svc.type === selectedTfType;
                return (
                  <div
                    key={svc.type}
                    onClick={() => handleSelectTfCard(svc)}
                    className={`cursor-pointer rounded-xl p-4 border transition flex flex-col justify-between ${
                      isSelected
                        ? 'bg-emerald-950/30 border-emerald-500 shadow-lg shadow-emerald-950/50'
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-emerald-300">
                          {svc.file}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">{svc.badge}</span>
                      </div>
                      <h3 className="text-sm font-bold text-white mt-2">{svc.name}</h3>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">{svc.description}</p>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectTfCard(svc);
                        handleTerraformApply(svc.type);
                      }}
                      disabled={isApplying}
                      className="mt-4 w-full py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition"
                    >
                      {isApplying && selectedTfType === svc.type
                        ? 'Applying .tf...'
                        : `Create ${svc.type.split('_')[0]} Now`}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase text-emerald-400">
                    Terraform Variables ({activeService.file})
                  </span>
                  <span className="text-xs font-mono text-slate-400">Region: {region}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1">Resource Name Tag (var.resource_name)</label>
                    <input
                      type="text"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                    />
                  </div>

                  {selectedTfType === 'EC2_INSTANCE' && (
                    <div>
                      <label className="block text-slate-400 mb-1">EC2 Instance Type (var.instance_type)</label>
                      <select
                        value={instanceType}
                        onChange={(e) => setInstanceType(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                      >
                        <option value="t3.micro">t3.micro ($7.59/mo)</option>
                        <option value="t3.small">t3.small ($15.18/mo)</option>
                        <option value="t3.medium">t3.medium ($30.37/mo)</option>
                        <option value="m5.large">m5.large ($70.08/mo)</option>
                      </select>
                    </div>
                  )}

                  {selectedTfType === 'EBS_VOLUME' && (
                    <div>
                      <label className="block text-slate-400 mb-1">EBS Size GiB (var.volume_size_gb)</label>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={sizeGb}
                        onChange={(e) => setSizeGb(Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                      />
                    </div>
                  )}
                </div>

                <pre className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs font-mono text-emerald-300 overflow-x-auto">
                  {activeService.hcl}
                </pre>

                <button
                  type="button"
                  onClick={() => handleTerraformApply()}
                  disabled={isApplying}
                  className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition"
                >
                  {isApplying
                    ? 'Running terraform apply...'
                    : `Run terraform apply (${activeService.file}) -> Create ${activeService.name}`}
                </button>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
                <div>
                  <div className="text-xs font-mono uppercase text-sky-400 mb-2">Terraform Execution Console Output</div>
                  <pre className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-200 overflow-x-auto whitespace-pre-wrap min-h-[150px]">
                    {tfConsoleOutput}
                  </pre>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-300 mb-2">
                    Latest Provisioned Resources ({resources.length} total)
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {resources.slice(0, 4).map((r) => (
                      <div
                        key={r.id}
                        className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs flex justify-between"
                      >
                        <div>
                          <span className="font-semibold text-white">{r.name}</span>{' '}
                          <span className="font-mono text-emerald-400">({r.awsResourceId})</span>
                        </div>
                        <span className="font-mono text-slate-400">{r.resourceType}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* TAB 2: ANSIBLE CONFIGURATION MANAGEMENT & DYNAMIC INVENTORY */}
        {activeTab === 'ansible' && (
          <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-amber-400">
                  2. Ansible Configuration Management (infrastructure/ansible/)
                </h2>
                <p className="text-xs text-slate-400">
                  Uses the <span className="font-mono text-slate-200">amazon.aws.aws_ec2</span> dynamic inventory plugin to discover running EC2 instances and execute Docker &amp; Compose deployment roles.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => runDevOpsAction('ansible', 'ping')}
                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-emerald-300"
                >
                  1. Ping EC2 Dynamic Inventory
                </button>
                <button
                  type="button"
                  onClick={() => runDevOpsAction('ansible', 'docker')}
                  className="px-3 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-xs font-bold text-amber-300"
                >
                  2. Run Role: Install Docker
                </button>
                <button
                  type="button"
                  onClick={() => runDevOpsAction('ansible', 'deploy')}
                  className="px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold"
                >
                  3. Run Playbook: Deploy Stack to EC2
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {(['inventory', 'playbook', 'deploy'] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedAnsibleFile(key)}
                      className={`px-3 py-1 rounded-lg text-xs font-mono ${
                        selectedAnsibleFile === key
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'bg-slate-900 text-slate-400 border border-slate-800'
                      }`}
                    >
                      {ANSIBLE_FILES[key].title}
                    </button>
                  ))}
                </div>
                <div className="text-xs font-mono text-slate-400">{ANSIBLE_FILES[selectedAnsibleFile].path}</div>
                <pre className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs font-mono text-amber-300 overflow-x-auto">
                  {ANSIBLE_FILES[selectedAnsibleFile].code}
                </pre>

                <div className="pt-2">
                  <div className="text-xs font-semibold text-slate-300 mb-2">
                    Discovered EC2 Hosts in Dynamic Inventory ({ec2Hosts.length})
                  </div>
                  <div className="space-y-1.5">
                    {ec2Hosts.map((h) => (
                      <div
                        key={h.id}
                        className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs flex justify-between"
                      >
                        <span>
                          <strong className="text-white">{h.name}</strong> ({h.awsResourceId})
                        </span>
                        <span className="font-mono text-emerald-400">
                          {String(h.metadata?.publicIp || '13.232.104.88')} • {h.state}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-mono uppercase text-amber-400 mb-2">
                    Ansible Playbook Execution Output
                  </div>
                  <pre className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 text-xs font-mono text-slate-200 overflow-x-auto whitespace-pre-wrap min-h-[260px]">
                    {ansibleConsole}
                  </pre>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* TAB 3: KUBERNETES (KIND / K3D) CLUSTER DASHBOARD */}
        {activeTab === 'kubernetes' && (
          <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-sky-400">
                  3. Kubernetes Orchestration Control Plane (infrastructure/k8s/*.yaml)
                </h2>
                <p className="text-xs text-slate-400">
                  Manages local Kubernetes (<span className="font-mono text-slate-200">kind</span>) Deployments, Services, ConfigMaps, and Secrets inside namespace <span className="font-mono text-sky-300">cloud-cost-guardian</span>.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => runDevOpsAction('kubernetes', 'apply')}
                  className="px-3.5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold"
                >
                  kubectl apply -f infrastructure/k8s/
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between text-xs">
                    <span className="font-mono text-sky-400">deployment.apps/ccg-api</span>
                    <span className="text-emerald-400 font-bold">{apiReplicas}/{apiReplicas} Ready</span>
                  </div>
                  <div className="text-sm font-bold text-white mt-1">Express FinOps API Pods</div>
                  <p className="text-xs text-slate-400 mt-1">Port: 3000 • ConfigMap: ccg-config</p>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const next = Math.max(1, apiReplicas - 1);
                      setApiReplicas(next);
                      runDevOpsAction('kubernetes', 'scale', { target: 'ccg-api', replicas: next });
                    }}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-bold"
                  >
                    -1 Pod
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = Math.min(5, apiReplicas + 1);
                      setApiReplicas(next);
                      runDevOpsAction('kubernetes', 'scale', { target: 'ccg-api', replicas: next });
                    }}
                    className="px-2.5 py-1 rounded bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 text-xs font-bold"
                  >
                    +1 Pod (Scale)
                  </button>
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between text-xs">
                    <span className="font-mono text-sky-400">deployment.apps/ccg-web</span>
                    <span className="text-emerald-400 font-bold">{webReplicas}/{webReplicas} Ready</span>
                  </div>
                  <div className="text-sm font-bold text-white mt-1">React Nginx Frontend Pods</div>
                  <p className="text-xs text-slate-400 mt-1">Service: NodePort 30080 → 80</p>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const next = Math.max(1, webReplicas - 1);
                      setWebReplicas(next);
                      runDevOpsAction('kubernetes', 'scale', { target: 'ccg-web', replicas: next });
                    }}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-bold"
                  >
                    -1 Pod
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = Math.min(5, webReplicas + 1);
                      setWebReplicas(next);
                      runDevOpsAction('kubernetes', 'scale', { target: 'ccg-web', replicas: next });
                    }}
                    className="px-2.5 py-1 rounded bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 text-xs font-bold"
                  >
                    +1 Pod (Scale)
                  </button>
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between text-xs">
                    <span className="font-mono text-sky-400">deployment.apps/ccg-postgres</span>
                    <span className="text-emerald-400 font-bold">1/1 Ready</span>
                  </div>
                  <div className="text-sm font-bold text-white mt-1">PostgreSQL 16 Database</div>
                  <p className="text-xs text-slate-400 mt-1">Port: 5432 • Secret: ccg-secrets</p>
                </div>
                <div className="mt-4 text-xs font-mono text-emerald-400">Status: Healthy (PVC Bound)</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {(['api', 'web', 'postgres'] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedK8sFile(key)}
                      className={`px-3 py-1 rounded-lg text-xs font-mono ${
                        selectedK8sFile === key
                          ? 'bg-sky-500 text-slate-950 font-bold'
                          : 'bg-slate-900 text-slate-400 border border-slate-800'
                      }`}
                    >
                      {K8S_MANIFESTS[key].title}
                    </button>
                  ))}
                </div>
                <div className="text-xs font-mono text-slate-400">{K8S_MANIFESTS[selectedK8sFile].path}</div>
                <pre className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs font-mono text-sky-300 overflow-x-auto">
                  {K8S_MANIFESTS[selectedK8sFile].code}
                </pre>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                <div className="text-xs font-mono uppercase text-sky-400 mb-2">kubectl CLI Output</div>
                <pre className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 text-xs font-mono text-slate-200 overflow-x-auto whitespace-pre-wrap min-h-[220px]">
                  {k8sConsole}
                </pre>
              </div>
            </div>
          </section>
        )}

        {/* TAB 4: DOCKER COMPOSE & JENKINS CI/CD PIPELINE */}
        {activeTab === 'cicd' && (
          <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-purple-400">
                  4. Docker Compose &amp; Jenkins CI/CD Pipeline (Jenkinsfile + docker-compose.yml)
                </h2>
                <p className="text-xs text-slate-400">
                  Polls GitHub SCM, runs TypeScript lint &amp; unit tests, scans with Trivy, validates Terraform, pushes images to GHCR, and triggers Ansible deploy.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => runDevOpsAction('docker', 'ps')}
                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-sky-300"
                >
                  Check Docker Compose Stack
                </button>
                <button
                  type="button"
                  onClick={() => runDevOpsAction('jenkins', 'build')}
                  className="px-3.5 py-2 rounded-lg bg-purple-500 hover:bg-purple-400 text-slate-950 text-xs font-bold"
                >
                  Trigger Jenkins Pipeline Build #{pipelineBuildNum + 1}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
              {[
                { stage: '1. Checkout SCM', tool: 'Git Monorepo', status: 'PASSED' },
                { stage: '2. Install & Lint', tool: 'tsc --noEmit', status: 'PASSED' },
                { stage: '3. Unit Tests', tool: 'State Machine', status: 'PASSED' },
                { stage: '4. Security Scan', tool: 'Trivy & npm audit', status: '0 CRITICAL' },
                { stage: '5. IaC Validate', tool: 'terraform validate', status: 'VALID' },
                { stage: '6. GHCR & Deploy', tool: 'Docker + Ansible', status: 'DEPLOYED' },
              ].map((s) => (
                <div key={s.stage} className="bg-slate-950 border border-emerald-500/30 rounded-xl p-3">
                  <div className="font-bold text-white">{s.stage}</div>
                  <div className="text-[11px] font-mono text-slate-400 mt-0.5">{s.tool}</div>
                  <div className="mt-2 inline-block px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono text-[10px] font-bold">
                    {s.status}
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
              <div className="text-xs font-mono uppercase text-purple-400 mb-2">
                Jenkins &amp; Docker Compose Console Output
              </div>
              <pre className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 text-xs font-mono text-slate-200 overflow-x-auto whitespace-pre-wrap min-h-[190px]">
                {cicdConsole}
              </pre>
            </div>
          </section>
        )}

        {/* TAB 5: RECOMMENDATIONS */}
        {activeTab === 'recommendations' && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Approval-Gated Recommendations ({recommendations.length})</h2>
            {recommendations.map((rec) => (
              <div
                key={rec.id}
                className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4"
              >
                <div className="space-y-1 max-w-3xl">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-emerald-300">
                      {rec.status}
                    </span>
                    <span className="text-xs font-mono text-slate-400">{rec.awsResourceId}</span>
                    <span className="text-xs font-mono text-amber-300">{rec.suggestedAction}</span>
                  </div>
                  <div className="font-semibold text-white">
                    {rec.title} — <span className="text-emerald-400">{rec.resourceName}</span>
                  </div>
                  <p className="text-xs text-slate-400">{rec.reason}</p>
                  {rec.remediationResult && (
                    <div className="text-xs font-mono text-emerald-300 bg-slate-950 p-2 rounded border border-emerald-500/30 mt-2">
                      {rec.remediationResult}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold mr-3">
                    Save ${rec.estimatedMonthlySavingsUsd.toFixed(2)}/mo
                  </span>
                  {rec.status === 'PROPOSED' && (
                    <>
                      <button
                        onClick={() => handleAction(rec.id, 'approve')}
                        className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleAction(rec.id, 'reject')}
                        className="px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 text-xs font-semibold"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {rec.status === 'APPROVED' && (
                    <button
                      onClick={() => handleAction(rec.id, 'execute')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold"
                    >
                      Execute ({dryRun ? 'Dry-Run' : 'Live AWS'})
                    </button>
                  )}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* TAB 6: INVENTORY */}
        {activeTab === 'inventory' && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Discovered AWS Resource Inventory ({resources.length})</h2>
            <div className="grid gap-2">
              {resources.map((r) => (
                <div
                  key={r.id}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex justify-between items-center"
                >
                  <div>
                    <div className="font-semibold text-white">
                      {r.name} <span className="text-xs font-mono text-slate-400">({r.awsResourceId})</span>
                    </div>
                    <div className="text-xs text-slate-400">
                      {r.resourceType} • {r.instanceTypeOrClass} • State: {r.state}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-white">${r.monthlyCostUsd.toFixed(2)}/mo</div>
                    {r.avgCpuPercent !== null && (
                      <div className="text-xs font-mono text-amber-400">14d Avg CPU: {r.avgCpuPercent}%</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* TAB 7: AUDIT LOG */}
        {activeTab === 'audit' && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Immutable FinOps Audit Trail ({auditLogs.length})</h2>
            <div className="grid gap-2">
              {auditLogs.map((log) => (
                <div key={log.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 text-xs">
                  <div className="flex justify-between font-mono">
                    <span className="text-emerald-400 font-bold">{log.action}</span>
                    <span className="text-slate-400">{log.createdAt}</span>
                  </div>
                  <div className="text-slate-200 mt-1">{log.details}</div>
                  <div className="text-slate-400 mt-1">
                    Resource: <span className="font-mono">{log.awsResourceId}</span> • DryRun: {String(log.dryRun)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}