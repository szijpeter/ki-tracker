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

const STATUS_FILE = './data/status.json';

/**
 * Main collection function
 */
async function collect() {
    console.log(`[${new Date().toISOString()}] Starting data collection...`);
    const status = {
        lastRun: new Date().toISOString(),
        success: false,
        message: '',
        data: null
    };

    try {
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

        // Update status
        status.success = true;
        status.message = 'Collection successful';
        status.data = {
            lead: currentData.lead,
            boulder: currentData.boulder,
            overall: currentData.overall
        };
        console.log('Data collection complete!');

        return currentData;

    } catch (error) {
        status.message = error.message;
        throw error;
    } finally {
        // Always write status file
        try {
            await writeFile(STATUS_FILE, JSON.stringify(status, null, 2));
        } catch (err) {
            console.error('Failed to write status file:', err);
        }
    }
}

// Run collection
try {
    await collect();
} catch (error) {
    console.error('Collection failed:', error.message);
    // We don't exit with 1 here anymore so that the workflow continues to the commit step
    // The error is recorded in status.json
    process.exit(0);
}
