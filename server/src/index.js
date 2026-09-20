import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { dbRepo } from './db/repo.js';
import { scrapeBatch, scrapeProductWithRetry } from './scraper/scraper.js';
import { chromium } from 'playwright';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const CRON_SECRET = process.env.CRON_SECRET || 'ine-secret-cron-token-2026';
const STORE_BASE_URL = process.env.STORE_BASE_URL || 'https://demo.inelabteamdev.com';

app.use(cors());
app.use(express.json());

// Background worker state
let isScrapeRunning = false;
let lastCronRunAt = null;
let lastHealthPingAt = null;

// ---------------------------------------------------------------------------
// 1. Health check endpoint (Keep-warm every ~10 min from cron-job.org)
// ---------------------------------------------------------------------------
app.get('/health', (req, res) => {
  lastHealthPingAt = new Date().toISOString();
  res.status(200).json({
    status: 'healthy',
    timestamp: lastHealthPingAt,
    uptimeSec: Math.floor(process.uptime()),
    scraperState: {
      isScrapeRunning,
      lastCronRunAt
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Search endpoint (Lightweight HTTP to /api/catalog)
// ---------------------------------------------------------------------------
app.get('/api/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim().toLowerCase();
    const page = parseInt(req.query.page || '1', 10);
    const pageSize = parseInt(req.query.pageSize || '20', 10);

    const targetUrl = `${STORE_BASE_URL}/api/catalog?page=${page}&pageSize=${pageSize}`;
    const response = await fetch(targetUrl);
    if (!response.ok) {
      return res.status(response.status).json({ error: `Mock store returned HTTP ${response.status}` });
    }

    const data = await response.json();
    let items = data.items || [];

    // Filter by search query if provided
    if (q) {
      items = items.filter(item =>
        item.name.toLowerCase().includes(q) ||
        (item.brand && item.brand.toLowerCase().includes(q)) ||
        (item.category && item.category.toLowerCase().includes(q)) ||
        (item.sku && item.sku.toLowerCase().includes(q))
      );
    }

    res.json({
      page: data.page,
      pageSize: data.pageSize,
      total: items.length,
      items: items.map(item => ({
        id: item.id,
        name: item.name,
        slug: item.slug,
        brand: item.brand,
        category: item.category,
        sku: item.sku,
        description: item.description,
        url: `${STORE_BASE_URL}/product/${item.id}`
      }))
    });
  } catch (err) {
    console.error('Search endpoint error:', err);
    res.status(500).json({ error: 'Failed to query mock store catalog', details: err.message });
  }
});

// ---------------------------------------------------------------------------
// 3. Tracked Products Management
// ---------------------------------------------------------------------------
app.get('/api/tracked', async (req, res) => {
  try {
    const products = await dbRepo.getTrackedProducts();
    res.json(products);
  } catch (err) {
    console.error('Get tracked error:', err);
    res.status(500).json({ error: 'Failed to fetch tracked products', details: err.message });
  }
});

app.post('/api/tracked', async (req, res) => {
  try {
    const { external_id, name, url, category, brand } = req.body;
    if (!external_id || !name) {
      return res.status(400).json({ error: 'Missing required fields: external_id, name' });
    }

    // Check if already tracked
    const existing = await dbRepo.getTrackedProductByExternalId(external_id);
    if (existing) {
      return res.status(200).json(existing);
    }

    const product = await dbRepo.addTrackedProduct({
      external_id: Number(external_id),
      name,
      url: url || `${STORE_BASE_URL}/product/${external_id}`,
      category: category || null,
      brand: brand || null
    });

    // Trigger immediate background initial scrape
    setTimeout(async () => {
      try {
        console.log(`[Init Scrape] Running initial scrape for newly added product ${product.external_id}...`);
        const browser = await chromium.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        await scrapeProductWithRetry(browser, product);
        await browser.close().catch(() => {});
      } catch (e) {
        console.error(`[Init Scrape] Failed for product ${product.external_id}:`, e);
      }
    }, 100);

    res.status(201).json(product);
  } catch (err) {
    console.error('Add tracked error:', err);
    res.status(500).json({ error: 'Failed to track product', details: err.message });
  }
});

app.delete('/api/tracked/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await dbRepo.deleteTrackedProduct(id);
    res.json({ success: true, message: 'Product tracking removed' });
  } catch (err) {
    console.error('Delete tracked error:', err);
    res.status(500).json({ error: 'Failed to remove tracked product', details: err.message });
  }
});

// ---------------------------------------------------------------------------
// 4. Product Price History & Scrape Logs
// ---------------------------------------------------------------------------
app.get('/api/tracked/:id/history', async (req, res) => {
  try {
    const { id } = req.params;
    const history = await dbRepo.getPriceHistory(id);
    res.json(history);
  } catch (err) {
    console.error('Get history error:', err);
    res.status(500).json({ error: 'Failed to fetch price history', details: err.message });
  }
});

app.get('/api/tracked/:id/logs', async (req, res) => {
  try {
    const { id } = req.params;
    const logs = await dbRepo.getScrapeLogs(id);
    res.json(logs);
  } catch (err) {
    console.error('Get logs error:', err);
    res.status(500).json({ error: 'Failed to fetch scrape logs', details: err.message });
  }
});

// ---------------------------------------------------------------------------
// 5. Manual Scrape Trigger (with TTL Slack check)
// ---------------------------------------------------------------------------
app.post('/api/tracked/:id/scrape', async (req, res) => {
  try {
    const { id } = req.params;
    const force = req.query.force === 'true';
    const product = await dbRepo.getTrackedProductById(id);
    if (!product) {
      return res.status(404).json({ error: 'Tracked product not found' });
    }

    // Check freshness TTL (115 minutes threshold) unless force=true
    if (!force && product.last_success_at) {
      const lastSuccess = new Date(product.last_success_at).getTime();
      const elapsedMinutes = (Date.now() - lastSuccess) / (1000 * 60);
      if (elapsedMinutes < 115) {
        return res.status(429).json({
          error: `Product was scraped recently (${Math.round(elapsedMinutes)} min ago). Next scheduled scrape in ${Math.round(115 - elapsedMinutes)} min.`,
          nextDueInMinutes: Math.round(115 - elapsedMinutes)
        });
      }
    }

    // Run scrape
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const result = await scrapeProductWithRetry(browser, product);
    await browser.close().catch(() => {});

    res.json(result);
  } catch (err) {
    console.error('Manual scrape error:', err);
    res.status(500).json({ error: 'Manual scrape failed', details: err.message });
  }
});

// ---------------------------------------------------------------------------
// 6. Cron Trigger Endpoint (cron-job.org every 2 hours: 0 */2 * * *)
// ---------------------------------------------------------------------------
app.post('/api/cron/scrape', async (req, res) => {
  // 1. Validate secret header
  const secretHeader = req.headers['x-cron-secret'] || req.query.secret;
  if (CRON_SECRET && secretHeader !== CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized: Invalid cron secret' });
  }

  if (isScrapeRunning) {
    return res.status(409).json({
      message: 'Scrape batch already running in background',
      lastCronRunAt
    });
  }

  // 2. Return 202 Accepted immediately so cron-job.org does not timeout (~30s limit)
  res.status(202).json({
    message: 'Scrape job accepted and running in background',
    triggeredAt: new Date().toISOString()
  });

  // 3. Run atomic claim and scrape in background
  (async () => {
    isScrapeRunning = true;
    lastCronRunAt = new Date().toISOString();
    try {
      console.log(`[Cron Scraper] Claiming due products (TTL slack: 115 min)...`);
      const dueProducts = await dbRepo.claimDueProducts();
      console.log(`[Cron Scraper] Claimed ${dueProducts.length} due products.`);

      if (dueProducts.length > 0) {
        await scrapeBatch(dueProducts, 2);
      }
    } catch (err) {
      console.error('[Cron Scraper] Error in background batch:', err);
    } finally {
      isScrapeRunning = false;
      console.log('[Cron Scraper] Background run ended.');
    }
  })();
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`✓ Product Price Tracker API listening on port ${PORT}`);
  console.log(`✓ Keep-warm ping route: GET http://localhost:${PORT}/health`);
  console.log(`✓ Cron route: POST http://localhost:${PORT}/api/cron/scrape`);
});
