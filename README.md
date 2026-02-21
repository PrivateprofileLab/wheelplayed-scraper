# WheelPlayed — Automated Lottery Scraper

Automated daily scraper that keeps your Supabase `draws` table current across 52 lottery games. Runs on GitHub Actions (free tier).

## How It Works

- **4x daily** via GitHub Actions cron schedule
- Fetches latest draws from NY Gov Open Data API + lottery.net
- Upserts to Supabase (no duplicates, safe to re-run)
- ~1-2 minutes per run → ~240 min/month → **12% of free tier**

## Data Sources

| Source | Games | Method |
|--------|-------|--------|
| `data.ny.gov` JSON API | Powerball, Mega Millions, NY Lotto | Direct JSON |
| `data.ny.gov` CSV API | Take 5 New York | CSV download (evening + midday draws) |
| `lottery.net` HTML scrape | 48 state games | Parse current year page |

## Setup

### 1. Create the GitHub Repository

```bash
# In this folder:
git init
git add .
git commit -m "Initial scraper setup"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/wheelplayed-scraper.git
git push -u origin main
```

### 2. Add Secrets

Go to your repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add these two secrets:

| Secret Name | Value |
|------------|-------|
| `SUPABASE_URL` | Your Supabase project URL (e.g., `https://xxxxx.supabase.co`) |
| `SUPABASE_SERVICE_KEY` | Your Supabase **service role** key (NOT the anon key — needed for writes) |

> ⚠️ Use the **service role key**, not the anon key. Find it in Supabase → Settings → API → `service_role` (secret).

### 3. Enable the Workflow

After pushing, go to the **Actions** tab in your repo. GitHub may ask you to enable workflows — click to enable.

### 4. Test It

Click **Actions** → **Update Lottery Draws** → **Run workflow** → **Run workflow** (daily mode).

Watch the logs to verify it's fetching and upserting correctly.

### 5. Backfill Problem Games

The 3 games that failed client-side CORS scraping (Gimme 5, Cash 5 OK, Montana Cash) need a one-time backfill:

Click **Actions** → **Update Lottery Draws** → **Run workflow** → select **backfill** → **Run workflow**.

This fetches year-by-year from lottery.net server-side (no CORS!) and should get full history.

## Schedule

The scraper runs 4x daily at these times (UTC):

| UTC | EST | Purpose |
|-----|-----|---------|
| 6:00 AM | 1:00 AM | Catches late-night draws |
| 12:00 PM | 7:00 AM | Catches morning draws |
| 6:00 PM | 1:00 PM | Catches midday draws |
| 11:30 PM | 6:30 PM | Catches evening draws |

## Files

| File | Purpose |
|------|---------|
| `scrape.mjs` | Daily scraper — fetches current year for all 52 games |
| `backfill.mjs` | One-time backfill for 3 problem games |
| `.github/workflows/scrape.yml` | GitHub Actions workflow |

## Monitoring

Check the **Actions** tab in your repo to see run history. Failed runs show ❌ and you'll get email notifications from GitHub.

## Supabase Table Schema

The scraper expects this table:

```sql
CREATE TABLE draws (
  id BIGSERIAL PRIMARY KEY,
  game_id TEXT NOT NULL,
  draw_date DATE NOT NULL,
  numbers INTEGER[] NOT NULL,
  bonus INTEGER,
  UNIQUE(game_id, draw_date, numbers)
);
```

The `ON CONFLICT DO NOTHING` / `resolution=merge-duplicates` ensures safe re-runs.

## Cost

- **GitHub Actions**: ~240 min/month → 12% of 2,000 free minutes
- **Supabase**: Minimal — ~52 small upserts per run
- **lottery.net**: ~52 page fetches per run (polite 500ms delays)
- **Total**: $0/month
