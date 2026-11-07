import test from 'node:test';
import assert from 'node:assert/strict';
import { store } from '../db/store.js';
import { RemediationService } from '../services/remediation.service.js';
import { estimateEc2MonthlyCost, estimateEbsMonthlyCost } from '../services/pricing.service.js';

test('Static Pricing Service calculates accurate monthly EC2 and EBS costs', () => {
  assert.equal(estimateEc2MonthlyCost('t3.medium', true), 34.02);
  assert.equal(estimateEbsMonthlyCost('gp3', 100), 8.00);
});

test('Approval state machine enforces PROPOSED -> APPROVED -> COMPLETED and blocks unapproved execution', () => {
  store.seedInitialDemoData();
  const proposedRec = store.recommendations.find((r) => r.status === 'PROPOSED')!;
  assert.ok(proposedRec, 'Expected at least one PROPOSED recommendation');

  assert.throws(() => {
    RemediationService.execute(proposedRec.id, 'Tester', true);
  }, /Safety Gate Violation/);

  const approved = RemediationService.approve(proposedRec.id, 'Himansu Mallik');
  assert.equal(approved.status, 'APPROVED');

  const completed = RemediationService.execute(proposedRec.id, 'Himansu Mallik', true);
  assert.equal(completed.status, 'COMPLETED');
  assert.match(completed.remediationResult || '', /DRY-RUN SUCCESS/);
});
