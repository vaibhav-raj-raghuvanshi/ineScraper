import { chromium } from 'playwright';
import pLimit from 'p-limit';
import { dbRepo } from '../db/repo.js';
import { decryptPricePayload } from './crypto.js';
import { validateSnapshot } from './parser.js';

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 8000;
const STORE_BASE_URL = process.env.STORE_BASE_URL || 'https://demo.inelabteamdev.com';

/**
 * Calculates exponential backoff with full jitter
 */
function getBackoffDelay(attempt) {
  const exp = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * Math.pow(2, attempt - 1));
  const jitter = Math.floor(Math.random() * 500);
  return exp + jitter;
}

/**
 * Sleep helper
 */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Scrapes a single product through a Playwright browser page
 * Intercepts session token and encrypted price payload, decrypts ground truth
 * Also falls back to DOM inspection if needed
 */
async function scrapeProductAttempt(browser, product, attemptNumber, customRouteHandler = null) {
  const url = product.url || `${STORE_BASE_URL}/product/${product.external_id}`;
  const page = await browser.newPage();

  let sessionToken = null;
  let priceCiphertext = null;
  let httpStatus = null;
  let apiError = null;

  // Set default timeout (12s)
  page.setDefaultTimeout(12000);

  // Intercept responses for session and price
  page.on('response', async res => {
    const resUrl = res.url();
    if (resUrl.includes(`/api/product/${product.external_id}`)) {
      httpStatus = res.status();
    }
    if (resUrl.includes('/api/session') && res.status() === 200) {
      try {
        const data = await res.json();
        sessionToken = data.token;
      } catch (_) {}
    }
    if (resUrl.includes('/price')) {
      httpStatus = res.status();
      if (res.status() === 200) {
        try {
          const data = await res.json();
          priceCiphertext = data.e;
        } catch (_) {}
      } else if (res.status() >= 400) {
        apiError = `Price endpoint error: HTTP ${res.status()}`;
      }
    }
  });

  // Apply custom route handler if provided (for headed demo simulating slow or failing responses)
  if (customRouteHandler) {
    await customRouteHandler(page, attemptNumber);
  }

  try {
    const navResponse = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });
    if (navResponse) {
      httpStatus = navResponse.status();
      if (httpStatus === 404) {
        const err = new Error(`Product not found (HTTP 404)`);
        err.httpStatus = 404;
        err.isNonRetryable = true;
        throw err;
      }
    }

    // Wait for the price block element to exist
    const priceBlock = page.locator('.price-block');
    await priceBlock.waitFor({ state: 'visible', timeout: 8000 });

    // Handle anti-scraping interaction: hover, mouse moves, dwell time
    const box = await priceBlock.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 25, box.y + 20);
      for (let i = 0; i < 14; i++) {
        await page.mouse.move(box.x + 25 + i * 4, box.y + 20 + (i % 3) * 4);
        await sleep(55);
      }
      // Dwell time >= 600ms
      await sleep(650);
    }

    // Reveal price button click
    const revealBtn = page.locator('.price-block button.btn-primary');
    if (await revealBtn.isVisible()) {
      // Click handling intentional client-side flakiness
      for (let c = 0; c < 4; c++) {
        if (await revealBtn.isVisible() && !await revealBtn.isDisabled()) {
          await revealBtn.click().catch(() => {});
        }
        if (sessionToken && priceCiphertext) break;
        await sleep(500);
      }
    }

    // Wait for network price response or success element
    for (let i = 0; i < 15; i++) {
      if (sessionToken && priceCiphertext) break;
      await sleep(400);
    }

    if (apiError) {
      const err = new Error(apiError);
      err.httpStatus = httpStatus;
      throw err;
    }

    // Extract decrypted ground truth
    if (sessionToken && priceCiphertext) {
      const decrypted = decryptPricePayload(priceCiphertext, sessionToken);
      await page.close().catch(() => {});
      return {
        candidate: {
          price: decrypted.price,
          mrp: decrypted.mrp,
          stock: decrypted.stock,
          inStock: decrypted.inStock,
          currency: decrypted.currency,
          seller: decrypted.seller,
          raw: decrypted.raw
        },
        httpStatus: httpStatus || 200
      };
    }

    // Fallback: Read rendered DOM if decryption payload was not intercepted
    const domData = await page.evaluate(() => {
      const success = document.querySelector('.price-block.price-success');
      if (!success) return null;

      const stockBadge = success.querySelector('.stock-badge');
      const spans = Array.from(success.querySelectorAll('.price-main span'));
      const priceSpan = spans.find(s => {
        const style = window.getComputedStyle(s);
        const text = s.innerText.trim();
        return style.display !== 'none' &&
               !s.hasAttribute('aria-hidden') &&
               !s.classList.contains('badge') &&
               style.textDecoration.indexOf('line-through') === -1 &&
               !text.includes('Deal price') &&
               !text.includes('off') &&
               text.length > 0;
      });

      return {
        priceText: priceSpan ? priceSpan.innerText.trim() : null,
        stockText: stockBadge ? stockBadge.innerText.trim() : null,
        isOutOfStock: stockBadge ? stockBadge.classList.contains('out-stock') : false
      };
    });

    await page.close().catch(() => {});

    if (domData && domData.priceText) {
      return {
        candidate: {
          price: domData.priceText,
          stock: domData.stockText,
          inStock: !domData.isOutOfStock
        },
        httpStatus: httpStatus || 200
      };
    }

    throw new Error('Price and stock failed to resolve in page (timeout or placeholder)');
  } catch (err) {
    await page.close().catch(() => {});
    err.httpStatus = httpStatus || err.httpStatus || 500;
    throw err;
  }
}

/**
 * Scrapes a product with retry, exponential backoff, jitter, validation, and logging
 */
export async function scrapeProductWithRetry(browser, product, options = {}) {
  const startTime = Date.now();
  const logId = await dbRepo.insertScrapeLogStart({ product_id: product.id });

  let attempts = 0;
  let finalOutcome = 'failed';
  let finalHttpStatus = null;
  let finalError = null;
  let validData = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    attempts = attempt;
    try {
      if (options.onAttempt) {
        options.onAttempt(attempt, MAX_ATTEMPTS, product);
      }

      const result = await scrapeProductAttempt(browser, product, attempt, options.customRouteHandler);
      finalHttpStatus = result.httpStatus;

      // Strict validation before storing
      const validation = validateSnapshot(result.candidate, product.external_id);
      if (!validation.valid) {
        const validationErr = new Error(`Validation failed: ${validation.error}`);
        if (validation.structureChange) {
          console.warn(`[WARN] Possible store structure change detected for product ${product.external_id}: ${validation.error}`);
          validationErr.message = `Possible structure change: ${validation.error}`;
        }
        throw validationErr;
      }

      validData = validation.data;
      finalOutcome = attempt === 1 ? 'success' : 'retried';
      finalError = null;
      break; // Success, break retry loop!
    } catch (err) {
      finalError = err.message || 'Unknown scrape error';
      finalHttpStatus = err.httpStatus || finalHttpStatus || 500;

      if (options.onAttemptError) {
        options.onAttemptError(attempt, MAX_ATTEMPTS, err);
      }

      // Check non-retryable conditions (e.g. 404)
      if (err.isNonRetryable || finalHttpStatus === 404) {
        console.log(`[Scraper] Non-retryable error (${finalHttpStatus}) for product ${product.external_id}, aborting retries.`);
        break;
      }

      if (attempt < MAX_ATTEMPTS) {
        const delay = getBackoffDelay(attempt);
        console.log(`[Scraper] Attempt ${attempt} failed for product ${product.external_id} (${finalError}). Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  const durationMs = Date.now() - startTime;

  // If scrape succeeded, insert clean price_history row and release lock with success timestamp
  if (validData && (finalOutcome === 'success' || finalOutcome === 'retried')) {
    await dbRepo.insertPriceHistory({
      product_id: product.id,
      price: validData.price,
      mrp: validData.mrp,
      in_stock: validData.inStock,
      stock_count: validData.stockCount,
      currency: validData.currency,
      seller: validData.seller
    });
    await dbRepo.releaseProductLock(product.id, true);
  } else {
    // On failure: Never store wrong or empty data in price_history. Release lock without success timestamp.
    await dbRepo.releaseProductLock(product.id, false);
  }

  // Record honest execution log
  await dbRepo.updateScrapeLogEnd(logId, {
    duration_ms: durationMs,
    attempts,
    outcome: finalOutcome,
    http_status: finalHttpStatus,
    error_message: finalError
  });

  return {
    productId: product.id,
    externalId: product.external_id,
    outcome: finalOutcome,
    attempts,
    durationMs,
    price: validData ? validData.price : null,
    inStock: validData ? validData.inStock : null,
    error: finalError
  };
}

/**
 * Scrapes a batch of products with failure isolation and controlled concurrency
 */
export async function scrapeBatch(products, concurrency = 2) {
  if (!products || products.length === 0) return [];

  console.log(`[Batch Scraper] Starting scrape batch for ${products.length} products (concurrency: ${concurrency})...`);
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const limit = pLimit(concurrency);

  try {
    const results = await Promise.allSettled(
      products.map(product =>
        limit(async () => {
          try {
            return await scrapeProductWithRetry(browser, product);
          } catch (err) {
            console.error(`[Scraper Isolation] Uncaught error on product ${product.external_id}:`, err);
            return {
              productId: product.id,
              externalId: product.external_id,
              outcome: 'failed',
              error: err.message
            };
          }
        })
      )
    );

    return results.map(r => (r.status === 'fulfilled' ? r.value : { outcome: 'failed', error: r.reason?.message }));
  } finally {
    await browser.close().catch(() => {});
    console.log(`[Batch Scraper] Batch complete.`);
  }
}
