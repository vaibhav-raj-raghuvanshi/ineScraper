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

// In-memory mock store for local development/testing when Supabase credentials aren't set
class InMemoryStore {
  constructor() {
    this.tracked = [];
    this.history = [];
    this.logs = [];
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
    return due;
  }
}

export const mockDb = new InMemoryStore();
export { supabase };
