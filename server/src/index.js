import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dbRepo } from './db/repo.js';
import { scrapeBatch, scrapeProductWithRetry } from './scraper/scraper.js';
import { isSupabaseConfigured, supabase } from './db/supabase.js';
import { chromium } from 'playwright';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CATALOG_FILE_PATH = path.join(__dirname, 'data/catalog.json');

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

// Full in-memory catalog cache (holds all 1000 items from mock store)
let catalogCache = [];
let catalogCategories = [];
let isCatalogLoading = false;
let catalogLastLoadedAt = null;

/**
 * Pre-fetches all 1,000 items from cache file or mock store
 */
async function loadFullCatalog() {
  if (isCatalogLoading) return;
  isCatalogLoading = true;
  const startTime = Date.now();

  // Try loading from saved catalog.json first for instant boot
  if (fs.existsSync(CATALOG_FILE_PATH)) {
    try {
      const raw = fs.readFileSync(CATALOG_FILE_PATH, 'utf8');
      catalogCache = JSON.parse(raw);
      catalogCategories = [...new Set(catalogCache.map(i => i.category).filter(Boolean))].sort();
      catalogLastLoadedAt = new Date().toISOString();
      console.log(`✓ [Catalog] Instantly loaded ${catalogCache.length} products from disk cache in ${Date.now() - startTime}ms`);
      isCatalogLoading = false;
      return;
    } catch (e) {
      console.warn('[Catalog] Error reading catalog.json, falling back to network fetch:', e.message);
    }
  }

  try {
    console.log('[Catalog] Fetching all 1000 products from INE mock store...');
    const pages = Array.from({ length: 17 }, (_, i) => i + 1);
    const pageResults = await Promise.all(
      pages.map(async pageNum => {
        try {
          const res = await fetch(`${STORE_BASE_URL}/api/catalog?page=${pageNum}&pageSize=60`);
          if (!res.ok) return [];
          const data = await res.json();
          return data.items || [];
        } catch (e) {
          console.error(`[Catalog] Failed to fetch page ${pageNum}:`, e.message);
          return [];
        }
      })
    );

    const allItems = pageResults.flat();
    if (allItems.length > 0) {
      const uniqueMap = new Map();
      for (const item of allItems) {
        if (item && item.id && !uniqueMap.has(item.id)) {
          uniqueMap.set(item.id, {
            id: item.id,
            name: item.name,
            slug: item.slug,
            brand: item.brand,
            category: item.category,
            sku: item.sku,
            description: item.description,
            url: `${STORE_BASE_URL}/product/${item.id}`
          });
        }
      }

      catalogCache = Array.from(uniqueMap.values()).sort((a, b) => a.id - b.id);
      catalogCategories = [...new Set(catalogCache.map(i => i.category).filter(Boolean))].sort();
      catalogLastLoadedAt = new Date().toISOString();
      console.log(`✓ [Catalog] Successfully indexed all ${catalogCache.length} unique products in ${Date.now() - startTime}ms`);
    }
  } catch (err) {
    console.error('[Catalog] Error loading full catalog:', err);
  } finally {
    isCatalogLoading = false;
  }
}

// Initial catalog load on startup
loadFullCatalog();

// ---------------------------------------------------------------------------
// 1. Health check endpoint (Keep-warm every ~10 min from cron-job.org)
// ---------------------------------------------------------------------------
app.get('/health', (req, res) => {
  lastHealthPingAt = new Date().toISOString();
  res.status(200).json({
    status: 'healthy',
    timestamp: lastHealthPingAt,
    uptimeSec: Math.floor(process.uptime()),
    supabaseConnected: isSupabaseConfigured,
    catalog: {
      totalLoaded: catalogCache.length,
      lastLoadedAt: catalogLastLoadedAt,
      isLoading: isCatalogLoading
    },
    scraperState: {
      isScrapeRunning,
      lastCronRunAt
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Full Product Search & Browsing Catalog API with Smart Relevance Scoring
// ---------------------------------------------------------------------------
app.get('/api/search', async (req, res) => {
  try {
    const rawQ = (req.query.q || '').trim();
    const category = (req.query.category || '').trim().toLowerCase();
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.max(1, Math.min(1000, parseInt(req.query.pageSize || '24', 10)));

    // Ensure catalog is populated
    if (catalogCache.length === 0 && !isCatalogLoading) {
      await loadFullCatalog();
    }

    let filtered = catalogCache;

    // Filter by category if specified
    if (category && category !== 'all') {
      filtered = filtered.filter(item => item.category && item.category.toLowerCase() === category);
    }

    // Smart Multi-Token Relevance Scoring
    if (rawQ) {
      const qLower = rawQ.toLowerCase();
      const tokens = qLower.split(/\s+/).filter(Boolean);

      const scoredItems = [];

      for (const item of filtered) {
        const name = (item.name || '').toLowerCase();
        const brand = (item.brand || '').toLowerCase();
        const cat = (item.category || '').toLowerCase();
        const sku = (item.sku || '').toLowerCase();
        const desc = (item.description || '').toLowerCase();

        let score = 0;

        // 1. Exact full-name match (highest possible priority)
        if (name === qLower) {
          score += 10000;
        } else if (name.startsWith(qLower)) {
          score += 5000;
        } else if (name.includes(qLower)) {
          score += 2500;
        }

        // 2. Exact SKU or Brand match
        if (sku === qLower) {
          score += 6000;
        } else if (sku.includes(qLower)) {
          score += 1500;
        }
        if (brand === qLower) {
          score += 1000;
        }

        // 3. Multi-word token matching
        let matchedTokens = 0;
        for (const token of tokens) {
          let tokenMatched = false;
          if (name.includes(token)) {
            score += 600;
            tokenMatched = true;
          }
          if (brand.includes(token)) {
            score += 200;
            tokenMatched = true;
          }
          if (sku.includes(token)) {
            score += 250;
            tokenMatched = true;
          }
          if (cat.includes(token)) {
            score += 100;
            tokenMatched = true;
          }
          if (desc.includes(token)) {
            score += 50;
            tokenMatched = true;
          }

          if (tokenMatched) matchedTokens++;
        }

        // Must match full contiguous phrase OR all individual tokens
        const matchesFull = name.includes(qLower) || brand.includes(qLower) || sku.includes(qLower) || cat.includes(qLower) || desc.includes(qLower);
        const matchesAllTokens = tokens.length > 0 && matchedTokens === tokens.length;

        if (matchesFull || matchesAllTokens) {
          if (matchesAllTokens) score += 1200; // Bonus for all keywords matching
          scoredItems.push({ item, score });
        }
      }

      // Sort by score DESC, then shorter name length (closer match), then ID
      scoredItems.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.item.name.length !== b.item.name.length) return a.item.name.length - b.item.name.length;
        return a.item.id - b.item.id;
      });

      filtered = scoredItems.map(s => s.item);
    }

    const total = filtered.length;
    const totalPages = Math.ceil(total / pageSize) || 1;
    const startIndex = (page - 1) * pageSize;
    const paginatedItems = filtered.slice(startIndex, startIndex + pageSize);

    res.json({
      page,
      pageSize,
      total,
      totalPages,
      categories: catalogCategories,
      catalogTotal: catalogCache.length,
      items: paginatedItems
    });
  } catch (err) {
    console.error('Search endpoint error:', err);
    res.status(500).json({ error: 'Failed to query catalog', details: err.message });
  }
});

// Refresh catalog on demand
app.post('/api/catalog/refresh', async (req, res) => {
  await loadFullCatalog();
  res.json({
    message: 'Catalog refreshed',
    total: catalogCache.length,
    timestamp: catalogLastLoadedAt
  });
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
    if (!external_id) {
      return res.status(400).json({ error: 'Missing required field: external_id' });
    }

    // Fetch actual live product details if not supplied
    let productName = name;
    let productUrl = url;
    let productCategory = category;
    let productBrand = brand;

    if (!productName || !productCategory) {
      try {
        const pRes = await fetch(`${STORE_BASE_URL}/api/product/${external_id}`);
        if (pRes.ok) {
          const pData = await pRes.json();
          productName = pData.name || productName || `Product ${external_id}`;
          productUrl = `${STORE_BASE_URL}/product/${external_id}`;
          productCategory = pData.category || productCategory;
          productBrand = pData.brand || productBrand;
        }
      } catch (_) {}
    }

    // Check if already tracked
    const existing = await dbRepo.getTrackedProductByExternalId(external_id);
    if (existing) {
      return res.status(200).json(existing);
    }

    const product = await dbRepo.addTrackedProduct({
      external_id: Number(external_id),
      name: productName || `Product ${external_id}`,
      url: productUrl || `${STORE_BASE_URL}/product/${external_id}`,
      category: productCategory || null,
      brand: productBrand || null
    });

    // Trigger immediate actual live scrape for newly tracked product
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
// 5. Manual Scrape Trigger (Forces live scrape without blocking cursor)
// ---------------------------------------------------------------------------
app.post('/api/tracked/:id/scrape', async (req, res) => {
  try {
    const { id } = req.params;
    const force = req.query.force !== 'false'; // Defaults to true when user explicitly clicks button
    const product = await dbRepo.getTrackedProductById(id);
    if (!product) {
      return res.status(404).json({ error: 'Tracked product not found' });
    }

    if (!force && product.last_success_at) {
      const lastSuccess = new Date(product.last_success_at).getTime();
      const elapsedMinutes = (Date.now() - lastSuccess) / (1000 * 60);
      if (elapsedMinutes < 115) {
        return res.status(429).json({
          error: `Product was scraped recently (${Math.round(elapsedMinutes)}m ago). Next scheduled run in ${Math.round(115 - elapsedMinutes)}m.`,
          nextDueInMinutes: Math.round(115 - elapsedMinutes)
        });
      }
    }

    // Run actual live scrape
    console.log(`[Manual Scrape] Starting live scrape for product ${product.external_id}...`);
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

  // Return 202 immediately to beat cron-job.org 30s timeout
  res.status(202).json({
    message: 'Scrape job accepted and running in background',
    triggeredAt: new Date().toISOString()
  });

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

// ---------------------------------------------------------------------------
// 7. Supabase Credentials Configuration Endpoint
// ---------------------------------------------------------------------------
app.post('/api/config/supabase', async (req, res) => {
  try {
    const { url, key } = req.body;
    if (!url || !key) {
      return res.status(400).json({ error: 'Missing Supabase URL or Key' });
    }

    // Write to server/.env
    const fs = await import('fs');
    const path = await import('path');
    const envPath = path.join(process.cwd(), 'server', '.env');
    const envContent = `PORT=${PORT}
STORE_BASE_URL=${STORE_BASE_URL}
CRON_SECRET=${CRON_SECRET}
SUPABASE_URL=${url.trim()}
SUPABASE_SERVICE_ROLE_KEY=${key.trim()}
`;
    fs.writeFileSync(envPath, envContent);

    res.json({
      success: true,
      message: 'Supabase credentials saved to server/.env. Restart server to apply.'
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save configuration', details: err.message });
  }
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`✓ Product Price Tracker API listening on port ${PORT}`);
  console.log(`✓ Keep-warm ping route: GET http://localhost:${PORT}/health`);
  console.log(`✓ Cron route: POST http://localhost:${PORT}/api/cron/scrape`);
});
