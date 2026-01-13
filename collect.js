/**
 * Data Collection Script
 * Runs the scraper and appends data to the history file
 */

import { scrapeOccupancy } from './scraper.js';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname } from 'path';

const DATA_FILE = './data/history.json';
const MAX_DAYS = 7; // Keep 7 days of data

/**
 * Reads existing history data or returns empty array
 */
async function readHistory() {
    try {
        const content = await readFile(DATA_FILE, 'utf-8');
        return JSON.parse(content);
    } catch {
        return [];
    }
}

/**
 * Filters data to keep only entries from the last N days
 */
function pruneOldData(data, maxDays) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - maxDays);

    return data.filter(entry => new Date(entry.timestamp) > cutoff);
}

/**
 * Main collection function
 */
async function collect() {
    console.log(`[${new Date().toISOString()}] Starting data collection...`);

    // Scrape current data
    const currentData = await scrapeOccupancy();
    console.log(`Scraped: Lead ${currentData.lead}%, Boulder ${currentData.boulder}%`);

    // Read existing history
    let history = await readHistory();
    console.log(`Existing entries: ${history.length}`);

    // Append new data
    history.push(currentData);

    // Prune old entries
    history = pruneOldData(history, MAX_DAYS);
    console.log(`After pruning: ${history.length} entries`);

    // Ensure data directory exists
    const dir = dirname(DATA_FILE);
    if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
    }

    // Write updated history
    await writeFile(DATA_FILE, JSON.stringify(history, null, 2));
    console.log('Data collection complete!');

    return currentData;
}

// Run collection
try {
    await collect();
} catch (error) {
    console.error('Collection failed:', error.message);
    process.exit(1);
}
