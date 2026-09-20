-- ==============================================================================
-- INE Product Price Tracker - Database Schema for Supabase (PostgreSQL)
-- ==============================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Tracked Products Table
create table if not exists tracked_products (
  id uuid primary key default gen_random_uuid(),
  external_id integer not null unique,
  name text not null,
  url text not null,
  category text,
  brand text,
  active boolean not null default true,
  last_success_at timestamptz,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_tracked_products_external_id on tracked_products(external_id);
create index if not exists idx_tracked_products_active on tracked_products(active);
create index if not exists idx_tracked_products_due on tracked_products(active, last_success_at, locked_until);

-- 2. Price History Table (Holds only valid, verified, non-empty scrapes)
create table if not exists price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references tracked_products(id) on delete cascade,
  price numeric(12, 2) not null check (price > 0),
  mrp numeric(12, 2),
  in_stock boolean not null,
  stock_count integer,
  currency text not null default 'INR',
  seller text,
  raw_data jsonb,
  scraped_at timestamptz not null default now()
);

create index if not exists idx_price_history_product_id on price_history(product_id);
create index if not exists idx_price_history_scraped_at on price_history(scraped_at desc);
create index if not exists idx_price_history_lookup on price_history(product_id, scraped_at desc);

-- 3. Scrape Logs Table (Records EVERY attempt honestly, including failures & retries)
create table if not exists scrape_logs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references tracked_products(id) on delete cascade,
  started_at timestamptz not null default now(),
  duration_ms integer,
  attempts integer not null default 1,
  outcome text not null check (outcome in ('success', 'retried', 'failed')),
  http_status integer,
  error_message text,
  metadata jsonb
);

create index if not exists idx_scrape_logs_product_id on scrape_logs(product_id);
create index if not exists idx_scrape_logs_started_at on scrape_logs(started_at desc);
create index if not exists idx_scrape_logs_lookup on scrape_logs(product_id, started_at desc);

-- 4. Atomic Claim Stored Procedure
-- Atomically claims products due for scraping with a 115-minute freshness threshold (slack)
-- and locks them for 5 minutes to prevent race conditions or double cron fires.
create or replace function claim_due_products() returns setof tracked_products as $$
  update tracked_products
  set locked_until = now() + interval '5 minutes'
  where active
    and (last_success_at is null or last_success_at <= now() - interval '115 minutes')
    and (locked_until is null or locked_until < now())
  returning *;
$$ language sql;
