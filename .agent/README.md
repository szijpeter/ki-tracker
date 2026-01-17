# KI Tracker - Agent Context

This document helps AI assistants understand the project when working on it.

## What this is

A scraper + dashboard that tracks occupancy at Kletterzentrum Innsbruck climbing gym. Runs 100% on GitHub infrastructure (Actions for scraping, Pages for hosting).

## Stack

- **Runtime**: Node.js 20 (ES modules)
- **Scraping**: Native fetch + cheerio for HTML parsing
- **Frontend**: Vanilla HTML/CSS/JS + Chart.js (loaded via CDN)
- **CI/CD**: GitHub Actions (every 5 min cron)
- **Hosting**: GitHub Pages (static files from repo root)

## Key files

| File | Purpose |
|------|---------|
| `scraper.js` | Fetches KI website, extracts nonce, parses occupancy HTML |
| `collect.js` | Orchestrates scraping, handles gym hours, manages history.json |
| `dashboard.js` | Frontend rendering, Chart.js charts, time filters |
| `data/history.json` | Rolling 7-day occupancy data (array of entries) |
| `data/status.json` | Last run status for debugging |

## Conventions

- ES modules (`import`/`export`, `"type": "module"`)
- JSDoc comments on exported functions
- ESLint + Prettier enforced (run `npm run lint:fix` before committing)
- Tests in `test/` using Node's built-in test runner (`npm test`)

## Common tasks

**Test changes locally:**
```bash
npm run scrape   # just test the scraper
npm run collect  # full collection cycle
npm run serve    # view dashboard at localhost:8080
```

**Before committing:**
```bash
npm run lint:fix && npm test
```

## Gotchas

- The scraper needs to extract a WordPress nonce from the main page before calling the AJAX endpoint
- `collect.js` has opening hours logic — it records zero occupancy when gym is closed instead of scraping
- The dashboard fetches `data/history.json` client-side, so CORS isn't an issue (same origin on GitHub Pages)
- There's leftover Kotlin Multiplatform scaffolding (`backend/`, `shared/`, `web/`, gradle files) from an abandoned port — ignore it

## Data shape

Each entry in `history.json`:
```json
{
  "timestamp": "2026-01-18T10:05:00.000Z",
  "lead": 45,       // % utilization lead climbing
  "boulder": 62,    // % utilization bouldering
  "overall": 54,    // average of lead + boulder
  "openSectors": "29/31"
}
```

## When modifying

- **Scraper breaks?** The KI website structure may have changed. Check if the nonce regex or cheerio selectors need updating.
- **Adding features?** Keep it simple — this runs on free GitHub infrastructure with tight resource limits.
- **Changing data format?** Update both `collect.js` (writing) and `dashboard.js` (reading).
