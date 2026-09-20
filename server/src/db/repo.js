import crypto from 'crypto';
import { supabase, isSupabaseConfigured, mockDb } from './supabase.js';

export const dbRepo = {
  // 1. Get all active or all tracked products
  async getTrackedProducts() {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('tracked_products')
        .select(`
          *,
          price_history (
            price,
            mrp,
            in_stock,
            stock_count,
            scraped_at
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Map latest price from price_history
      return data.map(p => {
        const sortedHistory = (p.price_history || []).sort(
          (a, b) => new Date(b.scraped_at).getTime() - new Date(a.scraped_at).getTime()
        );
        const latest = sortedHistory[0] || null;
        return {
          id: p.id,
          external_id: p.external_id,
          name: p.name,
          url: p.url,
          category: p.category,
          brand: p.brand,
          active: p.active,
          last_success_at: p.last_success_at,
          locked_until: p.locked_until,
          created_at: p.created_at,
          latest_price: latest ? Number(latest.price) : null,
          latest_mrp: latest?.mrp ? Number(latest.mrp) : null,
          in_stock: latest ? latest.in_stock : null,
          stock_count: latest ? latest.stock_count : null,
          last_scraped_at: latest ? latest.scraped_at : null
        };
      });
    }

    // Mock DB fallback
    return mockDb.tracked.map(p => {
      const productHistory = mockDb.history
        .filter(h => h.product_id === p.id)
        .sort((a, b) => new Date(b.scraped_at).getTime() - new Date(a.scraped_at).getTime());
      const latest = productHistory[0] || null;

      return {
        ...p,
        latest_price: latest ? Number(latest.price) : null,
        latest_mrp: latest?.mrp ? Number(latest.mrp) : null,
        in_stock: latest ? latest.in_stock : null,
        stock_count: latest ? latest.stock_count : null,
        last_scraped_at: latest ? latest.scraped_at : null
      };
    });
  },

  // 2. Get single product by ID
  async getTrackedProductById(id) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('tracked_products')
        .select('*')
        .eq('id', id)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    }
    return mockDb.tracked.find(p => p.id === id) || null;
  },

  // 3. Get single product by external ID
  async getTrackedProductByExternalId(externalId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('tracked_products')
        .select('*')
        .eq('external_id', externalId)
        .maybeSingle();
      if (error) throw error;
      return data;
    }
    return mockDb.tracked.find(p => p.external_id === Number(externalId)) || null;
  },

  // 4. Add tracked product
  async addTrackedProduct({ external_id, name, url, category, brand }) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('tracked_products')
        .insert([{ external_id, name, url, category, brand, active: true }])
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    const newProduct = {
      id: crypto.randomUUID(),
      external_id: Number(external_id),
      name,
      url,
      category,
      brand,
      active: true,
      last_success_at: null,
      locked_until: null,
      created_at: new Date().toISOString()
    };
    mockDb.tracked.push(newProduct);
    return newProduct;
  },

  // 5. Deactivate or delete product
  async deleteTrackedProduct(id) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('tracked_products')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return true;
    }
    const idx = mockDb.tracked.findIndex(p => p.id === id);
    if (idx !== -1) {
      mockDb.tracked.splice(idx, 1);
      return true;
    }
    return false;
  },

  // 6. Claim due products atomically (115 min threshold + 5 min lock)
  async claimDueProducts() {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.rpc('claim_due_products');
      if (error) {
        console.warn('claim_due_products RPC error, falling back to manual lock query:', error.message);
        // Fallback if stored procedure was not yet executed on user's Supabase DB
        const now = new Date();
        const threshold = new Date(now.getTime() - 115 * 60 * 1000).toISOString();
        const lockExpiration = new Date(now.getTime() + 5 * 60 * 1000).toISOString();

        const { data: candidates, error: selectErr } = await supabase
          .from('tracked_products')
          .select('*')
          .eq('active', true)
          .or(`last_success_at.is.null,last_success_at.lte.${threshold}`)
          .or(`locked_until.is.null,locked_until.lt.${now.toISOString()}`);

        if (selectErr) throw selectErr;
        if (!candidates || candidates.length === 0) return [];

        const ids = candidates.map(c => c.id);
        const { data: locked, error: updateErr } = await supabase
          .from('tracked_products')
          .update({ locked_until: lockExpiration })
          .in('id', ids)
          .select();

        if (updateErr) throw updateErr;
        return locked;
      }
      return data || [];
    }

    return await mockDb.claimDueProducts();
  },

  // 7. Release lock and update last_success_at on success
  async releaseProductLock(id, wasSuccessful = false) {
    const update = {
      locked_until: null
    };
    if (wasSuccessful) {
      update.last_success_at = new Date().toISOString();
    }

    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('tracked_products')
        .update(update)
        .eq('id', id);
      if (error) console.error('Error releasing product lock:', error);
      return;
    }

    const p = mockDb.tracked.find(p => p.id === id);
    if (p) {
      p.locked_until = null;
      if (wasSuccessful) p.last_success_at = update.last_success_at;
    }
  },

  // 8. Insert verified price history
  async insertPriceHistory({ product_id, price, mrp, in_stock, stock_count, currency = 'INR', seller, raw_data }) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('price_history')
        .insert([{
          product_id,
          price,
          mrp,
          in_stock,
          stock_count,
          currency,
          seller,
          raw_data,
          scraped_at: new Date().toISOString()
        }])
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    const row = {
      id: crypto.randomUUID(),
      product_id,
      price: Number(price),
      mrp: mrp ? Number(mrp) : null,
      in_stock: Boolean(in_stock),
      stock_count: stock_count !== undefined && stock_count !== null ? Number(stock_count) : null,
      currency,
      seller: seller || null,
      raw_data: raw_data || null,
      scraped_at: new Date().toISOString()
    };
    mockDb.history.push(row);
    return row;
  },

  // 9. Get price history for a product
  async getPriceHistory(productId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('price_history')
        .select('*')
        .eq('product_id', productId)
        .order('scraped_at', { ascending: true });
      if (error) throw error;
      return data;
    }
    return mockDb.history
      .filter(h => h.product_id === productId)
      .sort((a, b) => new Date(a.scraped_at).getTime() - new Date(b.scraped_at).getTime());
  },

  // 10. Start a scrape log row (writes immediately so crashes leave evidence)
  async insertScrapeLogStart({ product_id }) {
    const started_at = new Date().toISOString();
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('scrape_logs')
        .insert([{
          product_id,
          started_at,
          attempts: 1,
          outcome: 'failed', // Defaults to failed until updated on completion
          duration_ms: null,
          http_status: null,
          error_message: 'In-progress or interrupted run'
        }])
        .select()
        .single();
      if (error) throw error;
      return data.id;
    }

    const logId = crypto.randomUUID();
    mockDb.logs.push({
      id: logId,
      product_id,
      started_at,
      duration_ms: null,
      attempts: 1,
      outcome: 'failed',
      http_status: null,
      error_message: 'In-progress or interrupted run',
      metadata: null
    });
    return logId;
  },

  // 11. Update scrape log on run completion
  async updateScrapeLogEnd(logId, { duration_ms, attempts, outcome, http_status, error_message, metadata }) {
    const updateData = {
      duration_ms,
      attempts,
      outcome,
      http_status,
      error_message: error_message || null,
      metadata: metadata || null
    };

    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('scrape_logs')
        .update(updateData)
        .eq('id', logId);
      if (error) console.error('Error updating scrape log:', error);
      return;
    }

    const log = mockDb.logs.find(l => l.id === logId);
    if (log) {
      Object.assign(log, updateData);
    }
  },

  // 12. Get scrape logs for a product
  async getScrapeLogs(productId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('scrape_logs')
        .select('*')
        .eq('product_id', productId)
        .order('started_at', { ascending: false });
      if (error) throw error;
      return data;
    }
    return mockDb.logs
      .filter(l => l.product_id === productId)
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  }
};
