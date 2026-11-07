// Phase 6: Detection Rules Engine (Idle EC2 & Unattached EBS)
import { store } from '../db/store.js';

export class RulesService {
  public static evaluateAll(cpuThreshold: number) {
    const now = new Date().toISOString();

    for (const res of store.resources) {
      const existing = store.recommendations.find((r) => r.resourceId === res.id);

      // Rule 1: Idle EC2 Instance (avg CPU < threshold)
      if (
        res.resourceType === 'EC2_INSTANCE' &&
        res.state === 'running' &&
        res.avgCpuPercent !== null &&
        res.avgCpuPercent < cpuThreshold &&
        !existing
      ) {
        store.recommendations.unshift({
          id: `rec-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          resourceId: res.id,
          awsResourceId: res.awsResourceId,
          resourceName: res.name,
          resourceType: 'EC2_INSTANCE',
          ruleId: 'RULE_EC2_IDLE_CPU',
          title: `Stop Idle EC2 Instance (Avg CPU ${res.avgCpuPercent}% < ${cpuThreshold.toFixed(1)}%)`,
          reason: `14-day CloudWatch CPU average is ${res.avgCpuPercent}% (below ${cpuThreshold.toFixed(1)}% threshold).`,
          suggestedAction: 'ec2:StopInstances',
          severity: res.monthlyCostUsd > 25 ? 'HIGH' : 'MEDIUM',
          estimatedMonthlySavingsUsd: res.monthlyCostUsd,
          status: 'PROPOSED',
          createdAt: now,
          updatedAt: now,
        });
      }

      // Rule 2: Unattached EBS Volume (state === 'available')
      if (res.resourceType === 'EBS_VOLUME' && res.state === 'available' && !existing) {
        store.recommendations.unshift({
          id: `rec-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          resourceId: res.id,
          awsResourceId: res.awsResourceId,
          resourceName: res.name,
          resourceType: 'EBS_VOLUME',
          ruleId: 'RULE_EBS_UNATTACHED',
          title: `Snapshot & Delete Unattached Volume (${res.instanceTypeOrClass})`,
          reason: 'EBS volume is in "available" state and unattached to any running EC2 instance.',
          suggestedAction: 'ec2:CreateSnapshot -> ec2:DeleteVolume',
          severity: 'MEDIUM',
          estimatedMonthlySavingsUsd: res.monthlyCostUsd,
          status: 'PROPOSED',
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }
}
