# Design Note: Scraper Reliability, Trade-Offs, and Engineering Lessons

**Assignment**: Product Price Tracker (Web Scraping) — INE Software Engineer Intern Assignment  
**Target Store**: `https://demo.inelabteamdev.com/`

---

## 1. Architectural Trade-Off: Lightweight Fetching vs. Headless Browser

The evaluation criteria specifically assess judgment between lightweight HTTP fetching and a headless browser.

### The Inspection & Reverse-Engineering Findings
When inspecting `demo.inelabteamdev.com`, we decompiled and traced the client bundle (`/assets/index-B9UiQq4X.js`):
1. **The Public Catalog Endpoint (`GET /api/catalog`)**:
   - Returns paginated product metadata: `id`, `slug`, `name`, `brand`, `category`, `sku`, `description`.
   - **Crucially, it contains NO price and NO stock information.**
2. **The Product Metadata Endpoint (`GET /api/product/:id`)**:
   - Returns specifications and customer reviews, but also **no price or stock**.
3. **The Anti-Scraping Challenge (`.price-block.price-idle`)**:
   - On the product detail page, price and stock are hidden behind an interactive anti-scraping challenge:
     - The "Reveal price" button is initially disabled (`disabled: p !== null`).
     - The internal tracker (`class Ar`) requires **at least 8 mouse moves** spaced by $\ge 40$ms and a **dwell time of $\ge 600$ms** over the price block before `p` resolves to `null`.
     - Button clicks are wrapped in an intentional flakiness helper (`Xn`) that randomly drops or delays clicks by 900ms (`Math.random() < 0.35`).
     - Clicking "Reveal price" initiates a browser proof-of-work challenge:
       1. Fetches `/api/challenge` with canvas and WebGL hardware fingerprinting.
       2. Executes an in-memory compiled WebAssembly module (`WebAssembly.compile`).
       3. Calculates a SHA-256 proof-of-work nonce matching the server difficulty.
       4. Sends attestation and interaction coordinates to `/api/session` to acquire a signed JWT token.
       5. Requests `/api/products/:id/price` with `Authorization: Bearer <token>`.
       6. The price response is encrypted ciphertext, decrypted via XOR against `SHA-256("ine-mock-store-shared-k3y|enc|" + token)`.
     - Naive DOM scrapers are trapped by hidden dummy elements (`<span style="display:none" class="amount" data-price="true">`).

### The Technical Decision
- **Search & Discovery**: Done via lightweight plain HTTP (`/api/catalog`). It is fast, consumes minimal memory, and avoids running browser instances for catalog pagination.
- **Price & Stock Extraction**: Genuinely requires Playwright Chromium automation to execute the WebAssembly runtime, simulate genuine mouse movements, satisfy dwell time, click through flakiness, and decrypt the ground-truth payload.

---

## 2. Scraping Reliability & Failure Isolation

Unattended scheduled scrapers frequently fail when target servers fluctuate, throttle, or deploy layout updates. To make our scraper resilient over hundreds of unattended runs:

1. **Strict Request & Operation Timeouts**:
   - Playwright navigations and waits are capped at 12 seconds with explicit timeout handlers. No operation is permitted to hang indefinitely.
2. **Exponential Backoff with Full Randomized Jitter**:
   - On transient errors, the scraper retries up to 3 times.
   - Delay formula: $\text{delay} = \min(8000, 1000 \times 2^{\text{attempt}-1} + \text{random}(0, 500))$.
   - Jitter prevents "thundering herd" synchronization when multiple products are scraped.
3. **Selective Error Classification**:
   - Retries on network drops, timeouts, 429 rate limits, and 5xx server errors.
   - **Immediately aborts on HTTP 404 (Not Found)**. Retrying a 404 wastes system resources and prolongs batch execution for missing items.
4. **Outcome Semantics**:
   - 1st attempt success $\rightarrow$ logged as `success`.
   - Succeeded on attempt 2 or 3 $\rightarrow$ logged as `retried`.
   - All attempts exhausted $\rightarrow$ logged as `failed`.
5. **Crash Breadcrumbs ("Started" Row First)**:
   - Before attempting a scrape, a log row is inserted immediately with `started_at = now()` and `outcome = 'failed'`.
   - If the scraper crashes midway (e.g. process termination or memory limit), the run leaves clear evidence in the database rather than disappearing.
   - Upon completion, the row is updated atomically with duration, status, and outcome.
6. **Failure Isolation**:
   - In batch runs, every product execution is wrapped in an independent `try/catch` block. A failure or timeout on one product cannot terminate the run for other products.
   - Concurrency is throttled to 2 parallel browser contexts (`p-limit(2)`) to keep memory footprint well below Render's 512MB free-tier ceiling.

---

## 3. Data Integrity: Strict Validation Engine

To satisfy the "never store wrong or empty data" rule:
1. **Schema Validation with Zod**:
   - Price must be a finite number strictly greater than 0.
   - Stock must resolve to a known boolean (`in_stock`).
2. **Defensive Currency and Number Parsing**:
   - Handles currency prefixes (`₹`, `$`, `€`), thousands separators (`16,142`), and whitespace.
   - Specifically tests for placeholder strings ("Loading…", "Price hidden", "Check the current price", "NaN", "null") and rejects them as failed attempts rather than prices.
3. **Separation of History and Logs**:
   - `price_history` stores only clean, validated data. If a scrape fails, **no row is written to `price_history`**.
   - `scrape_logs` records every attempt honestly, including durations and error messages.
4. **Structure Change Detection**:
   - If expected selectors or data keys are missing from the store response, the scraper writes "Possible structure change" into the log diagnostics.

---

## 4. Free-Tier Scheduling Constraints & Gotchas

1. **cron-job.org 30-Second Timeout**:
   - cron-job.org cancels HTTP requests that do not respond within ~30 seconds.
   - Solution: `POST /api/cron/scrape` validates the secret token and returns **`202 Accepted` immediately**, continuing the batch scrape asynchronously in the background.
2. **Render 15-Minute Sleep**:
   - Render free web services go to sleep after 15 minutes of idle time.
   - Solution: A secondary cron-job.org task pings `GET /health` every 10 minutes (`*/10 * * * *`), keeping the instance awake and warm.
3. **The 115-Minute TTL Slack**:
   - If a cron job runs strictly every 120 minutes and the freshness check requires 120 minutes, slight network drift (e.g. cron firing at 1h 59m 58s) causes the product to be skipped and delayed for an extra 2 hours.
   - Solution: We use a **115-minute freshness threshold** with an atomic 5-minute database lock (`claim_due_products()`).
   - `last_success_at` is only updated on successful scrape runs. Failed products remain due for the next cycle.

---

## 5. What AI Tools Got Wrong on the First Attempt (And How We Corrected Them)

During initial exploration, standard AI coding assistants made several common, critical mistakes that had to be caught and corrected:

1. **Hallucinating an Open Price API or Simple Regex**:
   - **What AI assumed**: AI assistants assumed that since `/api/catalog` existed, there was a public `/api/products/:id` with price fields, or that price could be extracted using a simple regex on the initial HTML response.
   - **The Reality**: The initial HTML is an empty Vite shell (`<div id="root"></div>`), `/api/catalog` has no prices, and the actual price is locked behind a WebAssembly anti-scraping challenge returning encrypted ciphertext.
   - **Correction**: We decompiled the bundle, inspected the challenge protocol, verified that Playwright was required, and reverse-engineered the keystream XOR cipher.
2. **Storing 0 or Null on Scrape Failure**:
   - **What AI generated**: In fallback error handlers, AI tools wrote `price: 0` or `price: null` into the database history table.
   - **The Reality**: Storing `0` corrupts price trends and breaks min/max analytics.
   - **Correction**: We implemented strict Zod validation that rejects any non-positive number. On failure, we write exclusively to `scrape_logs` and never insert into `price_history`.
3. **Fixed Sleeps (`sleep(3000)`) Instead of Condition-Based Waiting**:
   - **What AI generated**: AI models frequently insert arbitrary `page.waitForTimeout(3000)` calls to wait for prices to load.
   - **The Reality**: Fixed sleeps make scrapers slow when the site is fast, and cause false timeouts when the site is slow.
   - **Correction**: We replaced fixed sleeps with real condition waiting: waiting for `.price-block`, waiting for dwell time, and waiting for the network response / `.price-block.price-success`.
4. **Blind Retries on HTTP 404**:
   - **What AI generated**: Generic retry loops that catch all errors and retry 3 times with exponential backoff.
   - **The Reality**: If a product is deleted or given an invalid ID (HTTP 404), retrying it 3 times wastes up to 30 seconds of execution time and browser resources.
   - **Correction**: We added error classification that immediately flags 404s as non-retryable and exits after the first attempt.
5. **Strict 2-Hour TTL Without Drift Slack**:
   - **What AI generated**: `where last_scraped_at <= now() - interval '2 hours'`.
   - **The Reality**: A cron job scheduled at `0 */2 * * *` will fire a few milliseconds before 2 hours have passed, skipping the entire batch and causing 4-hour intervals.
   - **Correction**: Added 5 minutes of slack ($115$ minutes) and atomic locking via `claim_due_products()`.
