import { chromium } from 'playwright';
import { scrapeProductWithRetry } from './scraper.js';
import { dbRepo } from '../db/repo.js';

// Parse CLI flags
const args = process.argv.slice(2);
const productIdArg = args.find((_, i) => args[i - 1] === '--product') || '433';
const shouldSimulateFailure = args.includes('--fail-first') || true; // Enabled for evaluation video recording
const slowMoVal = parseInt(args.find((_, i) => args[i - 1] === '--slowMo') || '200', 10);
const storeBase = process.env.STORE_BASE_URL || 'https://demo.inelabteamdev.com';

console.log('='.repeat(70));
console.log('  INE STORE — OBSERVABLE HEADED SCRAPER RUN');
console.log('='.repeat(70));
console.log(`Target Product ID: ${productIdArg}`);
console.log(`Simulate First Attempt Failure: ${shouldSimulateFailure ? 'YES (via page.route)' : 'NO'}`);
console.log(`Browser slowMo: ${slowMoVal}ms`);
console.log('Launching visible Chromium browser...\n');

async function runHeadedDemo() {
  const browser = await chromium.launch({
    headless: false,
    slowMo: slowMoVal,
    args: ['--window-size=1280,800', '--start-maximized']
  });

  // Fetch actual live product details from store API
  let product = await dbRepo.getTrackedProductByExternalId(productIdArg);
  if (!product) {
    console.log(`Fetching actual product metadata from ${storeBase}/api/product/${productIdArg}...`);
    let actualName = `Product #${productIdArg}`;
    let actualCategory = 'Store Item';
    let actualBrand = 'INE Store';

    try {
      const pRes = await fetch(`${storeBase}/api/product/${productIdArg}`);
      if (pRes.ok) {
        const pData = await pRes.json();
        actualName = pData.name || actualName;
        actualCategory = pData.category || actualCategory;
        actualBrand = pData.brand || actualBrand;
        console.log(`✓ Fetched live metadata: "${actualName}" (${actualBrand} · ${actualCategory})`);
      }
    } catch (e) {
      console.warn('Could not pre-fetch metadata:', e.message);
    }

    product = await dbRepo.addTrackedProduct({
      external_id: Number(productIdArg),
      name: actualName,
      url: `${storeBase}/product/${productIdArg}`,
      category: actualCategory,
      brand: actualBrand
    });
  }

  console.log(`[Narrator] Product record ready: ${product.name} (UUID: ${product.id})`);
  console.log('[Narrator] Starting scrape with retry, backoff, and full validation...\n');

  // Custom route handler to simulate network delay / failure on attempt 1
  let simulatedFailureTriggered = false;
  const customRouteHandler = async (page, attemptNumber) => {
    if (shouldSimulateFailure && attemptNumber === 1 && !simulatedFailureTriggered) {
      simulatedFailureTriggered = true;
      console.log('🔴 [DEMO INJECTION] Simulating network drop / 503 on /api/challenge for Attempt 1...');
      await page.route('**/api/challenge', async route => {
        console.log('🔴 [DEMO INJECTION] Intercepted /api/challenge -> Aborting request (simulated timeout/drop)');
        await route.abort('failed');
      });
    } else {
      console.log(`🟢 [DEMO] Attempt ${attemptNumber}: Normal network traffic allowed.`);
    }
  };

  const result = await scrapeProductWithRetry(browser, product, {
    customRouteHandler,
    onAttempt: (attempt, max, p) => {
      console.log(`▶ ATTEMPT ${attempt} of ${max}: Navigating to ${p.url}...`);
    },
    onAttemptError: (attempt, max, err) => {
      console.log(`⚠️ ATTEMPT ${attempt} of ${max} ENCOUNTERED ERROR: ${err.message}`);
      if (attempt < max) {
        console.log(`⏳ Exponential backoff kicking in before attempt ${attempt + 1}...`);
      }
    }
  });

  console.log('\n' + '='.repeat(70));
  console.log('  SCRAPE COMPLETED - EXECUTION SUMMARY');
  console.log('='.repeat(70));
  console.log(`• Final Outcome:   ${result.outcome.toUpperCase()}`);
  console.log(`• Total Attempts:  ${result.attempts}`);
  console.log(`• Duration:        ${result.durationMs}ms`);
  console.log(`• Extracted Price: ${result.price ? '₹' + result.price.toLocaleString('en-IN') : 'None'}`);
  console.log(`• In Stock:        ${result.inStock ? 'YES' : 'NO'}`);
  console.log(`• Error / Note:    ${result.error || 'None (Clean scrape)'}`);

  // Fetch and display latest logs
  const logs = await dbRepo.getScrapeLogs(product.id);
  console.log('\n--- Recorded Scrape Audit Log (from Database) ---');
  if (logs.length > 0) {
    const latest = logs[0];
    console.log(`Log ID:      ${latest.id}`);
    console.log(`Started At:  ${latest.started_at}`);
    console.log(`Outcome:     ${latest.outcome}`);
    console.log(`Attempts:    ${latest.attempts}`);
    console.log(`Duration:    ${latest.duration_ms}ms`);
    console.log(`HTTP Status: ${latest.http_status}`);
    console.log(`Error Msg:   ${latest.error_message || 'N/A'}`);
  }
  console.log('='.repeat(70));

  console.log('\nKeeping browser open for 3 seconds for inspection...');
  await new Promise(r => setTimeout(r, 3000));
  await browser.close();
  console.log('Done.');
}

runHeadedDemo().catch(err => {
  console.error('Fatal headed demo error:', err);
  process.exit(1);
});
