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
