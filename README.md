# INE Product Price Tracker (Web Scraping & Automated Monitoring)

A full-stack, production-grade price and stock tracking application built for INE's hosted mock storefront ([demo.inelabteamdev.com](https://demo.inelabteamdev.com/)).

Built with **React (Vite) + Recharts**, **Node.js (Express) + Playwright**, and **Supabase (PostgreSQL)**, scheduled via **cron-job.org**.

---

## Architecture Overview

```
                                  cron-job.org
                                       │
                  ┌────────────────────┴───────────────────┐
      (Every ~10 min keep-warm)               (Every 2 hrs cron scrape)
                  │                                        │
                  ▼                                        ▼
             GET /health                          POST /api/cron/scrape
                  │                              (returns 202 Accepted,
                  │                               runs worker in background)
                  │                                        │
                  ▼                                        ▼
        ┌────────────────────────────────────────────────────────────┐
        │                  Render Backend (Express)                  │
        │                                                            │
        │  • Scraper Engine (Playwright + retry + backoff + jitter)  │
        │  • Validation Engine (Zod finite price > 0, stock schema)  │
        │  • REST Endpoints:                                         │
        │    - GET  /api/search?q=                                   │
        │    - GET  /api/tracked                                     │
        │    - POST /api/tracked                                     │
        │    - DELETE /api/tracked/:id                               │
        │    - GET  /api/tracked/:id/history                         │
        │    - GET  /api/tracked/:id/logs                            │
        │    - POST /api/tracked/:id/scrape (Manual trigger)         │
        └──────────────────────────────┬─────────────────────────────┘
                                       │
                        ┌──────────────┴─────────────┐
                        ▼                            ▼
              Supabase (PostgreSQL)           Vercel Frontend
           • tracked_products               (React + Vite + Recharts)
           • price_history                  • Product search & tracking
           • scrape_logs                    • Live price & stock trends
           • claim_due_products()           • Per-product audit log
```

---

## Core Technical Features

1. **Lightweight Search vs. Playwright Scraper**:
   - **Catalog Search**: Fast, lightweight plain HTTP against `/api/catalog` with debounce.
   - **Price & Stock Extraction**: Automated via Playwright to satisfy INE's interactive challenge (mouse dwell $\ge 600$ms, $\ge 8$ moves, WebAssembly proof-of-work, and XOR ciphertext decryption).
2. **Reliability & Retry Strategy**:
   - Timeouts on every operation (12s ceiling via Playwright/AbortController).
   - Exponential backoff with full randomized jitter ($t = \min(t_{\max}, t_{\text{base}} \times 2^{\text{attempt}-1} + \text{jitter})$).
   - Selective retries: Retries timeouts, network drops, 429 rate limits, and 5xx errors; immediately aborts on non-retryable 404 errors.
   - Outcome classification: First attempt = `success`, resolved on attempt 2–3 = `retried`, all retries exhausted = `failed`.
3. **Strict Validation (Never Store Wrong or Empty Data)**:
   - Evaluated via **Zod schema**: price must be a strictly positive, finite number; stock must resolve to a known state.
   - Detects placeholders ("Loading…", "Price hidden", "Check the current price", "NaN", skeletons).
   - On scrape failure: records an honest log entry with error diagnostics, but **never inserts a false or empty row into `price_history`**.
   - Structure-change detection: Flags missing expected fields or selectors as "possible structure change".
4. **Atomic Scheduling & Free-Tier Handling**:
   - **cron-job.org Schedule**: `0 */2 * * *` triggers `POST /api/cron/scrape`.
   - **Immediate 202 Accepted**: Returns HTTP 202 immediately to prevent cron-job.org from timing out (~30s threshold).
   - **115-Minute TTL Slack**: Avoids skipping cycles due to slight timing drift.
   - **Atomic PostgreSQL Lock (`claim_due_products`)**: Sets `locked_until = now() + 5 min` in a single query to prevent race conditions or overlapping cron jobs.
   - **Keep-Warm Cron**: `GET /health` pinged every 10 minutes to prevent Render free-tier instances from idling.

---

## Project Structure

```
INE-PROJECT-VAIBHAV/
├── client/                     # React + Vite + Recharts frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.jsx               # Status bar, keep-warm indicator, sync
│   │   │   ├── ProductSearch.jsx        # Debounced catalog search & tracking
│   │   │   ├── TrackedProductsList.jsx  # Cards with live price, stock & freshness
│   │   │   ├── PriceChart.jsx           # Recharts timeline with honest gaps
│   │   │   └── ScrapeLogsTable.jsx      # Execution log with audit badges
│   │   ├── App.jsx                      # Main dashboard controller
│   │   ├── index.css                    # Design system & dark mode aesthetics
│   │   └── main.jsx
│   └── vite.config.js
│
├── server/                     # Express backend & Playwright scraper
│   ├── src/
│   │   ├── db/
│   │   │   ├── repo.js                  # Database abstraction (Supabase + mock fallback)
│   │   │   ├── schema.sql               # PostgreSQL tables & stored procedures
│   │   │   └── supabase.js              # Supabase client wrapper
│   │   ├── scraper/
│   │   │   ├── crypto.js                # SHA-256 keystream ciphertext decrypter
│   │   │   ├── parser.js                # Defensive price/stock parser & Zod validator
│   │   │   ├── scraper.js               # Playwright engine with retry, backoff, jitter
│   │   │   └── headed_runner.js         # Observable headed CLI script
│   │   └── index.js                     # Express REST API routes & cron trigger
│   ├── test/
│   │   ├── fixtures/                    # Test fixtures for parsing & validation
│   │   ├── retry.test.js                # Unit tests for retry semantics & logging
│   │   └── scraper.test.js              # Unit tests for prices, stocks, crypto & Zod
│   ├── .env.example
│   └── package.json
│
├── DESIGN_NOTE.md              # Technical trade-offs, reverse-engineering & AI lessons
├── README.md                   # Setup, schedule, and execution guide
└── package.json                # Root orchestration scripts
```

---

## Getting Started Locally

### Prerequisites
- Node.js v18+ (tested on Node.js v22)
- npm v9+

### 1. Installation
Clone repository and install dependencies:
```bash
# Install server dependencies
cd server
npm install
npx playwright install chromium

# Install client dependencies
cd ../client
npm install
```

### 2. Environment Setup
Create `server/.env` based on `server/.env.example`:
```env
PORT=4000
STORE_BASE_URL=https://demo.inelabteamdev.com
CRON_SECRET=ine-secret-cron-token-2026

# Optional: Supabase credentials (in-memory mock is used automatically if omitted)
SUPABASE_URL=https://your-supabase-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-key
```

### 3. Database Migration (Supabase)
If using Supabase, paste the contents of `server/src/db/schema.sql` into the **SQL Editor** in your Supabase dashboard and run it.

### 4. Running Unit Tests
```bash
npm test
```
Runs all 17 unit tests verifying defensive price parsing, currency stripping, stock variants, cryptographic decryption, Zod validation, retry outcome semantics, and atomic product claiming.

---

## Running the Application

### Start Backend Server
```bash
npm run dev:server
# Server starts on http://localhost:4000
```

### Start Frontend Dashboard
```bash
npm run dev:client
# Vite dev server runs on http://localhost:3000
```

---

## Observable (Headed) Scraper Run

To watch the scraper run in a visible browser window with simulated failure handling:
```bash
npm run scrape:headed
```
Or for a specific product:
```bash
node server/src/scraper/headed_runner.js --product 433 --fail-first
```

### What You Will See On Screen:
1. **Visible Chromium Browser Launches**: Navigates to `https://demo.inelabteamdev.com/product/433`.
2. **Attempt 1 (Simulated Failure)**: The script intercepts `/api/challenge` and aborts it using `page.route()`.
3. **Exponential Backoff & Jitter**: Scraper waits through backoff delay and retries.
4. **Attempt 2 (Recovery & Interaction)**:
   - Mouse moves visibly over the price area to satisfy dwell time ($\ge 600$ms).
   - "Reveal price" button becomes enabled.
   - Button is clicked.
   - Challenge completes, encrypted response is decrypted.
   - Price (`₹16,142`) and Stock (`72 IN STOCK`) appear on screen.
5. **Honest Log Output**: Output displays status `RETRIED`, attempt count `2/3`, and records the execution in the database audit log.

---

## Production Deployment & Hosting

For detailed, step-by-step instructions with all environment variables, refer to **[DEPLOYMENT.md](file:///DEPLOYMENT.md)**.

### Summary:
1. **Supabase**: Run SQL schema in `server/src/db/schema.sql` and execute table grants.
2. **Render (Backend)**: Connect `vaibhav-raj-raghuvanshi/ineScraper`, set Root Directory to `server`, Runtime to **Docker** (uses `server/Dockerfile` with Playwright pre-installed).
3. **Vercel (Frontend)**: Connect `vaibhav-raj-raghuvanshi/ineScraper`, set Root Directory to `client`, Framework `Vite`, and add `VITE_API_URL`.
4. **cron-job.org**: Set up the 2-hour scrape cycle (`POST /api/cron/scrape`) and 10-minute keep-warm ping (`GET /health`).

