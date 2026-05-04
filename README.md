# KI Tracker

Live occupancy tracker for Kletterzentrum Innsbruck. Check how busy the gym is before heading over.

**[→ View live dashboard](https://szijpeter.github.io/ki-tracker/)**

## Status

Automated GitHub Actions collection is currently paused (manual runs only).

### Incident (May 4, 2026)

Root cause:
- The KI website returned HTTP `403` to GitHub-hosted runner traffic during collection windows.
- Local runs could still fetch data, which points to runner IP/network blocking rather than parser logic.

Evidence:
- Failing runs on May 4, 2026 (open hours): `25309561974`, `25314876064`, `25316794863`.
- Logs show `Failed to fetch main page: 403`.
- Later run with resilience fallbacks (`25317201649`) still showed `403` for both primary and mirror fallback from Actions.

Suggested solutions:
1. Use a self-hosted runner for collection (recommended).
2. Run collection from a local/VPS cron job and push `data/*.json`.
3. Use a paid proxy/scraping provider with stable non-blocked IPs.
4. Request an official API or allowlist from KI.

## How it works

A GitHub Action (currently manual-only) runs the scraper and stores occupancy data in `data/history.json`. The dashboard is a static page served via GitHub Pages that reads this JSON and renders charts.

```
GitHub Actions → scrapes KI → commits to repo → GitHub Pages serves dashboard
```

## Local development

```bash
npm install
npm run scrape   # test the scraper
npm run collect  # run full collection
npm run serve    # start local server at http://localhost:8080
```

Other scripts: `npm run lint`, `npm run format`, `npm test`

## Project structure

```
├── collect.js       # data collection + gym hours logic
├── scraper.js       # fetches & parses KI website
├── dashboard.js     # frontend chart rendering
├── index.html       # dashboard page
├── style.css
├── data/
│   ├── history.json # 7 days of occupancy data
│   └── status.json  # last run info
└── test/            # unit tests
```

## Deploy your own

1. Fork this repo
2. Enable GitHub Pages (Settings → Pages → Deploy from branch `main`)
3. The Action runs automatically and populates the data
4. Your dashboard: `https://YOUR_USERNAME.github.io/ki-tracker/`

## Configuration

**Polling frequency** — edit `.github/workflows/collect.yml`:
```yaml
schedule:
  - cron: '*/10 * * * *'  # every 10 min
```

**Data retention** — edit `collect.js`:
```javascript
const MAX_DAYS = 14;
```

**Gym hours** are configured in `collect.js`. The scraper skips polling when closed and records zero occupancy.

## Data format

```json
{
  "timestamp": "2026-01-18T10:05:00.000Z",
  "lead": 45,
  "boulder": 62,
  "overall": 54,
  "openSectors": "29/31"
}
```

## Notes

- Scrapes publicly available data for personal use
- Don't poll more than every 5 minutes
- Not affiliated with Kletterzentrum Innsbruck

---

MIT License
