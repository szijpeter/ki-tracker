# KI Tracker

Live occupancy tracker for Kletterzentrum Innsbruck. Check how busy the gym is before heading over.

**[→ View live dashboard](https://szijpeter.github.io/ki-tracker/)**

## How it works

A GitHub Action runs every 5 minutes, scrapes the occupancy data from the KI website, and stores it in `data/history.json`. The dashboard is a static page served via GitHub Pages that reads this JSON and renders charts. Zero servers, zero cost.

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
