import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORE_BASE_URL = 'https://demo.inelabteamdev.com';

async function fetchWithRetry(url, retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        await new Promise(r => setTimeout(r, 250 * (i + 1)));
        continue;
      }
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      await new Promise(r => setTimeout(r, 250 * (i + 1)));
    }
  }
  return null;
}

async function syncCatalog() {
  console.log('🔄 Indexing complete 1,000 products catalog from mock store...');
  const map = new Map();

  // Phase 1: Rapid Catalog paging (35 pages with 429 protection)
  for (let p = 1; p <= 35; p++) {
    const data = await fetchWithRetry(`${STORE_BASE_URL}/api/catalog?page=${p}&pageSize=60`);
    if (data && data.items) {
      for (const it of data.items) {
        if (!map.has(it.id)) {
          map.set(it.id, {
            id: it.id,
            name: it.name,
            slug: it.slug,
            brand: it.brand,
            category: it.category,
            sku: it.sku,
            description: it.description,
            url: `${STORE_BASE_URL}/product/${it.id}`
          });
        }
      }
    }
    await new Promise(r => setTimeout(r, 60));
  }

  console.log(`✓ Phase 1 complete: ${map.size} unique items indexed from catalog endpoints.`);

  // Phase 2: Fill in any gaps from 1 to 1000
  const missing = [];
  for (let id = 1; id <= 1000; id++) {
    if (!map.has(id)) missing.push(id);
  }

  console.log(`ℹ️ Phase 2: Fetching remaining ${missing.length} items directly from /api/product/:id...`);
  const batchSize = 6;
  for (let i = 0; i < missing.length; i += batchSize) {
    const chunk = missing.slice(i, i + batchSize);
    await Promise.all(chunk.map(async id => {
      const prod = await fetchWithRetry(`${STORE_BASE_URL}/api/product/${id}`);
      if (prod && prod.id) {
        map.set(prod.id, {
          id: prod.id,
          name: prod.name,
          slug: prod.slug,
          brand: prod.brand,
          category: prod.category,
          sku: prod.sku,
          description: prod.description,
          url: `${STORE_BASE_URL}/product/${prod.id}`
        });
      }
    }));
    await new Promise(r => setTimeout(r, 80));
    if ((i + batchSize) % 60 === 0 || i + batchSize >= missing.length) {
      console.log(`  Indexed ${map.size} / 1000 items...`);
    }
  }

  const sortedCatalog = Array.from(map.values()).sort((a, b) => a.id - b.id);
  const dataDir = path.join(__dirname, '../src/data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const catalogFilePath = path.join(dataDir, 'catalog.json');
  fs.writeFileSync(catalogFilePath, JSON.stringify(sortedCatalog, null, 2), 'utf8');

  console.log(`🎉 SUCCESS: Fully saved ${sortedCatalog.length} products to ${catalogFilePath}`);
  console.log('Sample item 49:', sortedCatalog.find(i => i.id === 49));
}

syncCatalog().catch(err => {
  console.error('Failed to sync catalog:', err);
  process.exit(1);
});
