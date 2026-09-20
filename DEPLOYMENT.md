# Deployment Guide — INE Product Price Tracker

This project is configured for cloud deployment across the following stack:
- **Frontend Dashboard**: [Vercel](https://vercel.com/) (React + Vite + Recharts)
- **Backend & Scraper Engine**: [Render](https://render.com/) (Docker + Playwright + Express)
- **Database**: [Supabase](https://supabase.com/) (PostgreSQL)
- **Automated Scheduling**: [cron-job.org](https://cron-job.org/) (2-Hour Cron & 10-Min Keep-Warm)

---

## Step 1: Deploy Backend to Render

1. Go to [Render.com](https://dashboard.render.com/) and click **New +** → **Web Service**.
2. Connect your GitHub repository: `vaibhav-raj-raghuvanshi/ineScraper`.
3. Configure the service:
   - **Name**: `ine-tracker-backend`
   - **Region**: Oregon (or nearest)
   - **Branch**: `main`
   - **Root Directory**: `server`
   - **Runtime**: **Docker** (Render automatically picks up `server/Dockerfile` with pre-installed Playwright and Chromium)
   - **Instance Type**: **Free**
4. Under **Environment Variables**, add:
   - `PORT`: `4000`
   - `STORE_BASE_URL`: `https://demo.inelabteamdev.com`
   - `SUPABASE_URL`: `https://wohfgahpypfmvfvodijh.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY`: `sb_publishable_uSW7GkZMwCqRXrdx0MJ64w_RU1QGG84`
   - `CRON_SECRET`: `ine-secret-cron-token-2026`
5. Click **Create Web Service**.
6. Once deployed, note your Render URL (e.g. `https://ine-tracker-backend.onrender.com`).
   - Test it: `https://ine-tracker-backend.onrender.com/health`

---

## Step 2: Deploy Frontend to Vercel

1. Go to [Vercel.com](https://vercel.com/new) and click **Add New...** → **Project**.
2. Import the GitHub repository: `vaibhav-raj-raghuvanshi/ineScraper`.
3. Configure the project:
   - **Framework Preset**: `Vite`
   - **Root Directory**: Click **Edit** and choose `client`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. In **Environment Variables**, add:
   - `VITE_API_URL`: Your Render backend URL (e.g., `https://ine-tracker-backend.onrender.com`)
5. Click **Deploy**.

---

## Step 3: Configure 2-Hour Cron Job on cron-job.org

To ensure automated 2-hour scrapes and prevent Render free-tier sleep:

### Job 1: 2-Hour Automated Scrape Cycle
1. Go to [cron-job.org](https://console.cron-job.org/jobs) → **Create Cronjob**.
2. **Title**: `INE Scraper - 2-Hour Scrape`
3. **URL**: `https://<YOUR-RENDER-URL>/api/cron/scrape`
4. **Schedule**: Custom cron expression: `0 */2 * * *` (Every 2 hours on the hour)
5. Under **Advanced Settings**:
   - **Request Method**: `POST`
   - **Headers**:
     - `x-cron-secret`: `ine-secret-cron-token-2026`
     - `Content-Type`: `application/json`
6. Click **Create Job**.

### Job 2: 10-Minute Keep-Warm Ping (Free-Tier Wakeup)
1. In [cron-job.org](https://console.cron-job.org/jobs) → **Create Cronjob**.
2. **Title**: `INE Backend - Keep-Warm Ping`
3. **URL**: `https://<YOUR-RENDER-URL>/health`
4. **Schedule**: Every 10 minutes (`*/10 * * * *`)
5. **Request Method**: `GET`
6. Click **Create Job**.

---

## Step 4: Supabase Database Setup

Run the SQL script located in `server/src/db/schema.sql` inside your [Supabase SQL Editor](https://supabase.com/dashboard/project/wohfgahpypfmvfvodijh/sql) to ensure tables and permissions are initialized:

```sql
GRANT ALL ON TABLE tracked_products TO anon, authenticated, service_role;
GRANT ALL ON TABLE price_history TO anon, authenticated, service_role;
GRANT ALL ON TABLE scrape_logs TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION claim_due_products() TO anon, authenticated, service_role;
```
