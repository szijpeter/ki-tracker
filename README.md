# KI Tracker 🧗

Live occupancy tracker for **Kletterzentrum Innsbruck** climbing gym.

![Dashboard Preview](https://img.shields.io/badge/status-active-success)

## Features

- 📊 **Real-time occupancy** - See current Lead & Boulder utilization
- 📈 **Historical charts** - Track patterns over time (today, 24h, 7 days)
- 🎯 **Best times** - AI-analyzed optimal visiting hours
- 📱 **Mobile-first** - Designed for phone viewing
- 🆓 **100% Free** - Runs entirely on GitHub infrastructure

## How It Works

```
GitHub Actions (every 5 min) → Scrapes KI Website → Stores data in JSON → GitHub Pages serves dashboard
```

1. A scheduled GitHub Action runs every 5 minutes
2. It scrapes the live occupancy data from [kletterzentrum-innsbruck.at](https://www.kletterzentrum-innsbruck.at/en/)
3. Data is appended to `data/history.json` (keeps 7 days)
4. The static dashboard (GitHub Pages) reads and visualizes the data

## Setup

### 1. Fork or Clone

```bash
git clone https://github.com/YOUR_USERNAME/ki-tracker.git
cd ki-tracker
```

### 2. Install Dependencies (for local testing)

```bash
npm install
```

### 3. Test Locally

```bash
# Test the scraper
npm run scrape

# Run data collection
npm run collect

# Start local dashboard
npm run serve
# Open http://localhost:8080
```

### 4. Deploy to GitHub

```bash
git add .
git commit -m "Initial commit"
git push origin main
```

### 5. Enable GitHub Pages

1. Go to your repo **Settings** → **Pages**
2. Set **Source** to "Deploy from a branch"
3. Select **Branch**: `main` / **Folder**: `/ (root)`
4. Click **Save**

Your dashboard will be live at:
```
https://YOUR_USERNAME.github.io/ki-tracker/
```

### 6. Verify Actions

1. Go to the **Actions** tab
2. You should see the "Collect Occupancy Data" workflow
3. It will run automatically every 5 minutes
4. You can also trigger it manually with "Run workflow"

## Project Structure

```
ki-tracker/
├── .github/
│   └── workflows/
│       └── collect.yml      # Scheduled data collection
├── data/
│   └── history.json         # Historical occupancy data
├── collect.js               # Data collection script
├── scraper.js               # Website scraping module
├── index.html               # Dashboard HTML
├── style.css                # Dashboard styles
├── dashboard.js             # Dashboard JavaScript
└── package.json             # Node.js dependencies
```

## Configuration

### Change Polling Frequency

Edit `.github/workflows/collect.yml`:
```yaml
schedule:
  - cron: '*/10 * * * *'  # Every 10 minutes
```

### Adjust Data Retention

Edit `collect.js`:
```javascript
const MAX_DAYS = 14; // Keep 14 days of data
```

## Privacy & Terms

This tool scrapes publicly available data from the KI website for personal use. Please be respectful of their servers and don't decrease the polling interval below 5 minutes.

## License

MIT - Feel free to use and modify!

---

Made with ❤️ for the climbing community
