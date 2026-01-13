/**
 * Data Collection Script
 * Runs the scraper and appends data to the history file
 */

import { scrapeOccupancy } from './scraper.js';
import { readFile, writeFile, mkdir, rename } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname } from 'path';

const DATA_FILE = './data/history.json';
const MAX_DAYS = 7; // Keep 7 days of data

/**
 * Reads existing history data or returns empty array
 * Backs up corrupt files found
 */
async function readHistory() {
    try {
        const content = await readFile(DATA_FILE, 'utf-8');
        const data = JSON.parse(content);
        return Array.isArray(data) ? data : [];
    } catch (error) {
        if (existsSync(DATA_FILE)) {
            const backupName = `${DATA_FILE}.corrupt.${Date.now()}`;
            console.error(`Status file corrupt, backing up to ${backupName}`);
            try {
                await rename(DATA_FILE, backupName);
            } catch (e) {
                console.error('Failed to backup corrupt file:', e);
            }
        }
        return [];
    }
}

/**
 * Filters data to keep only entries from the last N days
 */
export function pruneOldData(data, maxDays) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - maxDays);

    return data.filter(entry => new Date(entry.timestamp) > cutoff);
}

const STATUS_FILE = './data/status.json';

/**
 * Main collection function
 */
export async function collect() {
    console.log(`[${new Date().toISOString()}] Starting data collection...`);
    const status = {
        // ...
        // ...
    }
}

// Run collection if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    try {
        await collect();
    } catch (error) {
        console.error('Collection failed:', error.message);
        process.exit(1);
    }
}
