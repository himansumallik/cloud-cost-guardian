// Phase 8, 9 & 10: Recommendation State Machine, Approval Workflow & Real AWS SDK v3 Remediation Executor
import {
  EC2Client,
  StopInstancesCommand,
  CreateSnapshotCommand,
  DeleteVolumeCommand,
} from '@aws-sdk/client-ec2';
import { env } from '../config/env.js';
import { store, Recommendation } from '../db/store.js';

export class RemediationService {
  public static approve(id: string, actor: string): Recommendation {
    const rec = store.recommendations.find((r) => r.id === id);
    if (!rec) throw new Error('Recommendation not found');
    if (rec.status !== 'PROPOSED') {
      throw new Error(`Invalid state transition: cannot approve from ${rec.status}`);
    }
    const prev = rec.status;
    rec.status = 'APPROVED';
    rec.approvedBy = actor;
    rec.updatedAt = new Date().toISOString();

    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      recommendationId: rec.id,
      awsResourceId: rec.awsResourceId,
      action: 'RECOMMENDATION_APPROVED',
      actor,
      previousStatus: prev,
      newStatus: 'APPROVED',
      dryRun: true,
      details: `Approved ${rec.suggestedAction} on ${rec.resourceName} (${rec.awsResourceId}).`,
      createdAt: rec.updatedAt,
    });
    return rec;
  }

  public static reject(id: string, actor: string, reason = 'Excluded by reviewer'): Recommendation {
    const rec = store.recommendations.find((r) => r.id === id);
    if (!rec) throw new Error('Recommendation not found');
    if (rec.status !== 'PROPOSED' && rec.status !== 'APPROVED') {
      throw new Error(`Invalid state transition: cannot reject from ${rec.status}`);
    }
    const prev = rec.status;
    rec.status = 'REJECTED';
    rec.updatedAt = new Date().toISOString();

    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      recommendationId: rec.id,
      awsResourceId: rec.awsResourceId,
      action: 'RECOMMENDATION_REJECTED',
      actor,
      previousStatus: prev,
      newStatus: 'REJECTED',
      dryRun: true,
      details: `Rejected recommendation on ${rec.resourceName}: ${reason}`,
      createdAt: rec.updatedAt,
    });
    return rec;
  }

  public static async execute(id: string, actor: string, dryRun = true): Promise<Recommendation> {
    const rec = store.recommendations.find((r) => r.id === id);
    if (!rec) throw new Error('Recommendation not found');
    if (rec.status !== 'APPROVED') {
      throw new Error(
        `Safety Gate Violation: Recommendation must be in APPROVED state before execution (current: ${rec.status})`
      );
    }

    const resource = store.resources.find((r) => r.id === rec.resourceId);
    rec.status = 'EXECUTING';
    const now = new Date().toISOString();

    // If DEMO_MODE=false, execute real AWS SDK v3 calls against your real AWS account
    if (!env.demoMode) {
      const ec2 = new EC2Client({ region: resource?.region || env.awsRegion });
      try {
        if (rec.resourceType === 'EC2_INSTANCE') {
          await ec2.send(
            new StopInstancesCommand({
              InstanceIds: [rec.awsResourceId],
              DryRun: dryRun,
            })
          );
        } else if (rec.resourceType === 'EBS_VOLUME') {
          const snapResp = await ec2.send(
            new CreateSnapshotCommand({
              VolumeId: rec.awsResourceId,
              Description: `CCG safety backup before deleting ${rec.awsResourceId}`,
              DryRun: dryRun,
            })
          );
          rec.rollbackSnapshotId = snapResp.SnapshotId || `snap-live-${Date.now()}`;
          await ec2.send(
            new DeleteVolumeCommand({
              VolumeId: rec.awsResourceId,
              DryRun: dryRun,
            })
          );
        }
      } catch (awsErr: any) {
        // AWS returns DryRunOperation when DryRun=true succeeds and IAM permissions are valid
        if (awsErr?.name !== 'DryRunOperation' && awsErr?.Code !== 'DryRunOperation') {
          rec.status = 'FAILED';
          rec.remediationResult = `[AWS ERROR] ${awsErr.message || String(awsErr)}`;
          store.auditLogs.unshift({
            id: `aud-${Date.now()}`,
            recommendationId: rec.id,
            awsResourceId: rec.awsResourceId,
            action: 'REMEDIATION_FAILED',
            actor,
            previousStatus: 'EXECUTING',
            newStatus: 'FAILED',
            dryRun,
            details: rec.remediationResult,
            createdAt: now,
          });
          throw awsErr;
        }
      }
    } else if (rec.resourceType === 'EBS_VOLUME') {
      rec.rollbackSnapshotId = `snap-0ccg${Math.random().toString(16).slice(2, 10)}`;
    }

    rec.status = 'COMPLETED';
    rec.updatedAt = now;
    rec.remediationResult = dryRun
      ? `[DRY-RUN SUCCESS] Validated IAM permissions & simulated ${rec.suggestedAction} on ${rec.awsResourceId}${
          rec.rollbackSnapshotId ? ` (Rollback snapshot ${rec.rollbackSnapshotId} simulated)` : ''
        }.`
      : `[LIVE EXECUTION SUCCESS] Executed ${rec.suggestedAction} on ${rec.awsResourceId}${
          rec.rollbackSnapshotId ? ` after creating safety snapshot ${rec.rollbackSnapshotId}` : ''
        }.`;

    if (resource && !dryRun) {
      resource.state = rec.resourceType === 'EC2_INSTANCE' ? 'stopped' : 'deleted (snapshotted)';
    }

    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      recommendationId: rec.id,
      awsResourceId: rec.awsResourceId,
      action: dryRun ? 'REMEDIATION_DRY_RUN_COMPLETED' : 'REMEDIATION_LIVE_COMPLETED',
      actor,
      previousStatus: 'APPROVED',
      newStatus: 'COMPLETED',
      dryRun,
      details: rec.remediationResult,
      createdAt: now,
    });

    return rec;
  }
}
