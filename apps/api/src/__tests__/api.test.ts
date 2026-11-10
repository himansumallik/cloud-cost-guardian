import test from 'node:test';
import assert from 'node:assert/strict';
import { store } from '../db/store.js';
import { RemediationService } from '../services/remediation.service.js';
import { estimateEc2MonthlyCost, estimateEbsMonthlyCost } from '../services/pricing.service.js';
import { env } from '../config/env.js';

process.env.NODE_ENV = 'test';
env.demoMode = true;
const { app } = await import('../index.js');

test('Static Pricing Service calculates accurate monthly EC2 and EBS costs', () => {
  assert.equal(estimateEc2MonthlyCost('t3.medium', true), 34.02);
  assert.equal(estimateEbsMonthlyCost('gp3', 100), 8.00);
});

test('Terraform endpoints return templates, apply demo resources, and list them', async () => {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));

  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const templatesResponse = await fetch(`${baseUrl}/api/terraform/templates`);
    assert.equal(templatesResponse.status, 200);
    const templates = await templatesResponse.json();
    assert.equal(templates.EC2_INSTANCE.filename, 'provision_ec2.tf');

    const resourcesResponse = await fetch(`${baseUrl}/api/resources`);
    assert.equal(resourcesResponse.status, 200);
    assert.ok(Array.isArray(await resourcesResponse.json()));

    const applyResponse = await fetch(`${baseUrl}/api/terraform/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resourceType: 'EC2_INSTANCE', name: 'ccg-tf-api-test' }),
    });
    assert.equal(applyResponse.status, 200);
    const applied = await applyResponse.json();
    assert.equal(applied.status, 'APPLIED');
    assert.equal(applied.resource.name, 'ccg-tf-api-test');
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

test('Approval state machine enforces PROPOSED -> APPROVED -> COMPLETED and blocks unapproved execution', async () => {
  store.seedInitialDemoData();
  const proposedRec = store.recommendations.find((r) => r.status === 'PROPOSED')!;
  assert.ok(proposedRec, 'Expected at least one PROPOSED recommendation');

  await assert.rejects(RemediationService.execute(proposedRec.id, 'Tester', true), /Safety Gate Violation/);

  const approved = RemediationService.approve(proposedRec.id, 'Himansu Mallik');
  assert.equal(approved.status, 'APPROVED');

  const completed = await RemediationService.execute(proposedRec.id, 'Himansu Mallik', true);
  assert.equal(completed.status, 'COMPLETED');
  assert.match(completed.remediationResult || '', /DRY-RUN SUCCESS/);
});
