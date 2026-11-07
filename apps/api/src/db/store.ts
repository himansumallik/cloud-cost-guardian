import { estimateEc2MonthlyCost, estimateEbsMonthlyCost } from '../services/pricing.service.js';

export type RecommendationStatus = 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'EXECUTING' | 'COMPLETED' | 'FAILED';

export interface CloudResource {
  id: string;
  awsResourceId: string;
  name: string;
  resourceType: 'EC2_INSTANCE' | 'EBS_VOLUME' | 'S3_BUCKET' | 'IAM_ACCESS_KEY';
  region: string;
  state: string;
  instanceTypeOrClass: string;
  monthlyCostUsd: number;
  avgCpuPercent: number | null;
  cpuSeries: number[];
  metadata: Record<string, string | number | boolean>;
  tags: Record<string, string>;
  discoveredAt: string;
}

export interface Recommendation {
  id: string;
  resourceId: string;
  awsResourceId: string;
  resourceName: string;
  resourceType: string;
  ruleId: string;
  title: string;
  reason: string;
  suggestedAction: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  estimatedMonthlySavingsUsd: number;
  status: RecommendationStatus;
  approvedBy?: string;
  remediationResult?: string;
  rollbackSnapshotId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  recommendationId: string | null;
  awsResourceId: string;
  action: string;
  actor: string;
  previousStatus: string | null;
  newStatus: string;
  dryRun: boolean;
  details: string;
  createdAt: string;
}

class InMemoryGuardianStore {
  public resources: CloudResource[] = [];
  public recommendations: Recommendation[] = [];
  public auditLogs: AuditLog[] = [];
  public isScanRunning = false;
  public wasteCounter = 1;

  constructor() {
    this.seedInitialDemoData();
  }

  public seedInitialDemoData(region = 'ap-south-1') {
    const now = new Date().toISOString();
    this.resources = [
      {
        id: 'res-1',
        awsResourceId: 'i-08f92b4c1a701e923',
        name: 'ccg-waste-idle-worker-01',
        resourceType: 'EC2_INSTANCE',
        region,
        state: 'running',
        instanceTypeOrClass: 't3.medium',
        monthlyCostUsd: estimateEc2MonthlyCost('t3.medium', true),
        avgCpuPercent: 1.8,
        cpuSeries: [2.1, 1.9, 1.5, 2.0, 1.7, 1.6, 1.8, 2.2, 1.4, 1.9, 1.7, 1.8, 1.6, 1.9],
        metadata: { vpcId: 'vpc-0ccg771', publicIp: '13.232.104.88', launchDaysAgo: 18, managedBy: 'Terraform (waste.tf)' },
        tags: { Environment: 'sandbox-waste', ManagedBy: 'Terraform', Owner: 'himansu' },
        discoveredAt: now,
      },
      {
        id: 'res-2',
        awsResourceId: 'vol-0a91f3b2e8c441021',
        name: 'ccg-unattached-jenkins-cache',
        resourceType: 'EBS_VOLUME',
        region,
        state: 'available',
        instanceTypeOrClass: 'gp3 (100 GB)',
        monthlyCostUsd: estimateEbsMonthlyCost('gp3', 100),
        avgCpuPercent: null,
        cpuSeries: [],
        metadata: { sizeGb: 100, encrypted: true, daysUnattached: 24, managedBy: 'Terraform (waste.tf)' },
        tags: { Environment: 'sandbox-waste', ManagedBy: 'Terraform' },
        discoveredAt: now,
      },
      {
        id: 'res-3',
        awsResourceId: 'i-04d18e3a9f612c110',
        name: 'staging-analytics-node',
        resourceType: 'EC2_INSTANCE',
        region,
        state: 'running',
        instanceTypeOrClass: 'm5.large',
        monthlyCostUsd: estimateEc2MonthlyCost('m5.large', true),
        avgCpuPercent: 3.4,
        cpuSeries: [4.2, 3.8, 3.1, 2.9, 3.5, 3.0, 3.3, 3.9, 3.2, 3.1, 3.6, 3.4, 3.2, 3.4],
        metadata: { vpcId: 'vpc-0ccg771', publicIp: '65.0.192.14', launchDaysAgo: 31, managedBy: 'Ansible' },
        tags: { Environment: 'staging', Team: 'finops-demo' },
        discoveredAt: now,
      },
      {
        id: 'res-4',
        awsResourceId: 'vol-0f12d99a0b338c774',
        name: 'orphaned-postgres-backup-vol',
        resourceType: 'EBS_VOLUME',
        region,
        state: 'available',
        instanceTypeOrClass: 'gp2 (50 GB)',
        monthlyCostUsd: estimateEbsMonthlyCost('gp2', 50),
        avgCpuPercent: null,
        cpuSeries: [],
        metadata: { sizeGb: 50, encrypted: false, daysUnattached: 14, managedBy: 'Manual' },
        tags: { Environment: 'dev', ManagedBy: 'Manual' },
        discoveredAt: now,
      },
      {
        id: 'res-5',
        awsResourceId: 'i-09c44a117b881d505',
        name: 'ccg-prod-api-host',
        resourceType: 'EC2_INSTANCE',
        region,
        state: 'running',
        instanceTypeOrClass: 't3.small',
        monthlyCostUsd: estimateEc2MonthlyCost('t3.small', true),
        avgCpuPercent: 46.5,
        cpuSeries: [42, 48, 51, 44, 49, 45, 47, 52, 43, 46, 48, 44, 45, 47],
        metadata: { vpcId: 'vpc-0ccg771', publicIp: '13.127.44.9', launchDaysAgo: 12, managedBy: 'Terraform (ec2.tf)' },
        tags: { Environment: 'production', ManagedBy: 'Ansible' },
        discoveredAt: now,
      },
      {
        id: 'res-6',
        awsResourceId: 'i-07b31e882c904f219',
        name: 'dev-experiment-runner',
        resourceType: 'EC2_INSTANCE',
        region,
        state: 'running',
        instanceTypeOrClass: 't3.small',
        monthlyCostUsd: 9.80,
        avgCpuPercent: 8.2,
        cpuSeries: [9.1, 8.4, 7.8, 8.0, 8.5, 7.9, 8.3, 8.6, 7.5, 8.1, 8.4, 8.0, 8.2, 8.0],
        metadata: { vpcId: 'vpc-0ccg771', publicIp: '13.233.19.55', launchDaysAgo: 9, managedBy: 'Manual' },
        tags: { Environment: 'dev', ManagedBy: 'Manual' },
        discoveredAt: now,
      }
    ];

    this.recommendations = [
      {
        id: 'rec-101',
        resourceId: 'res-1',
        awsResourceId: 'i-08f92b4c1a701e923',
        resourceName: 'ccg-waste-idle-worker-01',
        resourceType: 'EC2_INSTANCE',
        ruleId: 'RULE_EC2_IDLE_CPU',
        title: 'Stop Idle EC2 Instance (Avg CPU 1.8% < 5.0% threshold)',
        reason: '14-day CloudWatch CPU average is 1.8% with near-zero network I/O. Stopping saves compute and public IPv4 charges.',
        suggestedAction: 'ec2:StopInstances',
        severity: 'HIGH',
        estimatedMonthlySavingsUsd: 34.02,
        status: 'PROPOSED',
        createdAt: now,
        updatedAt: now,
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
        estimatedMonthlySavingsUsd: 8.00,
        status: 'PROPOSED',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'rec-103',
        resourceId: 'res-3',
        awsResourceId: 'i-04d18e3a9f612c110',
        resourceName: 'staging-analytics-node',
        resourceType: 'EC2_INSTANCE',
        ruleId: 'RULE_EC2_IDLE_CPU',
        title: 'Stop Underutilized m5.large Instance (Avg CPU 3.4%)',
        reason: '14-day CloudWatch CPU average is 3.4% (< 5.0% threshold). High-cost m5.large instance left running in staging.',
        suggestedAction: 'ec2:StopInstances',
        severity: 'HIGH',
        estimatedMonthlySavingsUsd: 73.73,
        status: 'APPROVED',
        approvedBy: 'Himansu Mallik (RA2311003012367)',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'rec-104',
        resourceId: 'res-4',
        awsResourceId: 'vol-0f12d99a0b338c774',
        resourceName: 'orphaned-postgres-backup-vol',
        resourceType: 'EBS_VOLUME',
        ruleId: 'RULE_EBS_UNATTACHED',
        title: 'Snapshot & Delete Unattached 50 GB gp2 Volume',
        reason: 'Unencrypted orphaned gp2 volume unattached for 14 days.',
        suggestedAction: 'ec2:CreateSnapshot -> ec2:DeleteVolume',
        severity: 'LOW',
        estimatedMonthlySavingsUsd: 5.00,
        status: 'PROPOSED',
        createdAt: now,
        updatedAt: now,
      }
    ];

    this.auditLogs = [
      {
        id: 'aud-1',
        recommendationId: null,
        awsResourceId: 'ACCOUNT_SCAN',
        action: 'DISCOVERY_SCAN_COMPLETED',
        actor: 'System (DiscoveryService)',
        previousStatus: null,
        newStatus: 'COMPLETED',
        dryRun: true,
        details: 'Enumerated 6 AWS resources in ap-south-1 and evaluated CloudWatch 14-day CPU metrics. Flagged 4 waste recommendations ($120.75/mo potential savings).',
        createdAt: now,
      },
      {
        id: 'aud-2',
        recommendationId: 'rec-103',
        awsResourceId: 'i-04d18e3a9f612c110',
        action: 'RECOMMENDATION_APPROVED',
        actor: 'Himansu Mallik (RA2311003012367)',
        previousStatus: 'PROPOSED',
        newStatus: 'APPROVED',
        dryRun: true,
        details: 'Approved stopping idle m5.large instance staging-analytics-node ($73.73/mo savings). Ready for Remediation Executor.',
        createdAt: now,
      }
    ];
  }
}

export const store = new InMemoryGuardianStore();
