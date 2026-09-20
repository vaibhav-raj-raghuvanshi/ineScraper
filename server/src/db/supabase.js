import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

let supabase = null;
if (isSupabaseConfigured) {
  supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });
  console.log('✓ Connected to Supabase PostgreSQL at:', supabaseUrl);
} else {
  console.warn('⚠️ Supabase credentials not found in environment. Using in-memory database mock for local testing.');
}

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_STORE_PATH = path.join(__dirname, '../data/db_store.json');

// Resilient store for local development/testing or Supabase fallback
class InMemoryStore {
  constructor() {
    this.tracked = [];
    this.history = [];
    this.logs = [];
    this.loadFromDisk();
  }

  loadFromDisk() {
    try {
      if (fs.existsSync(DB_STORE_PATH)) {
        const raw = fs.readFileSync(DB_STORE_PATH, 'utf8');
        const data = JSON.parse(raw);
        this.tracked = data.tracked || [];
        this.history = data.history || [];
        this.logs = data.logs || [];
      }
    } catch (e) {
      console.warn('[Store] Could not read db_store.json:', e.message);
    }
  }

  saveToDisk() {
    try {
      const dir = path.dirname(DB_STORE_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(DB_STORE_PATH, JSON.stringify({
        tracked: this.tracked,
        history: this.history,
        logs: this.logs
      }, null, 2), 'utf8');
    } catch (e) {
      console.warn('[Store] Could not save db_store.json:', e.message);
    }
  }

  async claimDueProducts() {
    const now = Date.now();
    const threshold = now - 115 * 60 * 1000;
    const due = [];

    for (const p of this.tracked) {
      if (!p.active) continue;
      const lastSuccess = p.last_success_at ? new Date(p.last_success_at).getTime() : 0;
      const lockedUntil = p.locked_until ? new Date(p.locked_until).getTime() : 0;

      if ((lastSuccess <= threshold) && (lockedUntil < now)) {
        p.locked_until = new Date(now + 5 * 60 * 1000).toISOString();
        due.push({ ...p });
      }
    }
    this.saveToDisk();
    return due;
  }
}

export const mockDb = new InMemoryStore();
export { supabase };
