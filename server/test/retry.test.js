import test from 'node:test';
import assert from 'node:assert/strict';
import { dbRepo } from '../src/db/repo.js';

test('Outcome Semantics & Isolation Rules', async (t) => {
  // Ensure clean idempotent state for test IDs
  const prev101 = await dbRepo.getTrackedProductByExternalId(101);
  if (prev101) await dbRepo.deleteTrackedProduct(prev101.id);
  const prev999 = await dbRepo.getTrackedProductByExternalId(999);
  if (prev999) await dbRepo.deleteTrackedProduct(prev999.id);

  await t.test('Initial log row is inserted with in-progress state', async () => {
    const p = await dbRepo.addTrackedProduct({
      external_id: 101,
      name: 'Test Keyboard',
      url: 'https://demo.inelabteamdev.com/product/101'
    });

    const logId = await dbRepo.insertScrapeLogStart({ product_id: p.id });
    const logs = await dbRepo.getScrapeLogs(p.id);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].id, logId);
    assert.equal(logs[0].outcome, 'failed'); // Default crash breadcrumb
    assert.equal(logs[0].duration_ms, null);
  });

  await t.test('Log updates to success or retried upon completion', async () => {
    const p = await dbRepo.getTrackedProductByExternalId(101);
    const logs = await dbRepo.getScrapeLogs(p.id);
    const logId = logs[0].id;

    // Simulate completion after retrying
    await dbRepo.updateScrapeLogEnd(logId, {
      duration_ms: 2450,
      attempts: 2,
      outcome: 'retried',
      http_status: 200,
      error_message: null
    });

    const updatedLogs = await dbRepo.getScrapeLogs(p.id);
    assert.equal(updatedLogs[0].outcome, 'retried');
    assert.equal(updatedLogs[0].attempts, 2);
    assert.equal(updatedLogs[0].duration_ms, 2450);
  });

  await t.test('Never stores price_history on scrape failure', async () => {
    const p = await dbRepo.addTrackedProduct({
      external_id: 999,
      name: 'Failed Product',
      url: 'https://demo.inelabteamdev.com/product/999'
    });

    // Simulate failure run
    const logId = await dbRepo.insertScrapeLogStart({ product_id: p.id });
    await dbRepo.updateScrapeLogEnd(logId, {
      duration_ms: 1200,
      attempts: 3,
      outcome: 'failed',
      http_status: 500,
      error_message: 'Simulated 500 timeout'
    });
    await dbRepo.releaseProductLock(p.id, false);

    const history = await dbRepo.getPriceHistory(p.id);
    assert.equal(history.length, 0, 'Must have 0 history rows on failure');

    const logs = await dbRepo.getScrapeLogs(p.id);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].outcome, 'failed');
    assert.equal(logs[0].error_message, 'Simulated 500 timeout');
  });

  await t.test('Atomic claim due products respects 115 min threshold', async () => {
    const dueBefore = await dbRepo.claimDueProducts();
    // 101 and 999 haven't had last_success_at set, so they are claimed
    assert.ok(dueBefore.length >= 2);

    // Release 101 with success
    const p101 = await dbRepo.getTrackedProductByExternalId(101);
    await dbRepo.releaseProductLock(p101.id, true);

    // Try claiming immediately again
    const dueAfter = await dbRepo.claimDueProducts();
    const claimedIds = dueAfter.map(d => d.id);
    assert.ok(!claimedIds.includes(p101.id), 'Freshly scraped product must not be claimed again within 115 mins');
  });
});
