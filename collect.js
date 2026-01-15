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

// Opening Hours Configuration
const HOURS = {
    standard: { start: 9, end: 22 },
    exceptions: {
        '12-24': { start: 9, end: 14 }, // Christmas Eve
        '12-25': { start: 14, end: 22 }, // Christmas Day
        '12-31': { start: 9, end: 14 }, // New Year's Eve
        '01-01': { start: 14, end: 22 }  // New Year's Day
    }
};

/**
 * Checks if the gym is currently open based on local time
 * @returns {boolean}
 */
function isGymOpen(date = new Date()) {
    const month = date.getMonth() + 1; // 1-12
    const day = date.getDate();
    const key = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const hour = date.getHours();

    const config = HOURS.exceptions[key] || HOURS.standard;
    return hour >= config.start && hour < config.end;
}

/**
 * Main collection function
 */
export async function collect() {
    console.log(`[${new Date().toISOString()}] Starting data collection...`);

    try {
        // 1. Get existing history
        const history = await readHistory();
        const isOpen = isGymOpen();

        let newData;

        if (isOpen) {
            // 2a. Scrape new data
            newData = await scrapeOccupancy();
            console.log('Scraped data:', JSON.stringify(newData));
        } else {
            // 2b. Gym closed logic
            console.log('Gym is closed.');

            // Check if we need to record a "closed" marker (0 occupancy)
            // We only record if the last entry was not already a closed zero-marker
            const lastEntry = history[history.length - 1];
            const isLastZero = lastEntry && lastEntry.overall === 0;

            // Allow a "grace period" or just check value. 
            // If we are closed, and the last entry was non-zero, we want to record the drop to 0.
            if (!isLastZero) {
                console.log('Recording zero occupancy marker.');
                newData = {
                    timestamp: new Date().toISOString(),
                    lead: 0,
                    boulder: 0,
                    overall: 0,
                    openSectors: '0/0' // Optional/approximate
                };
            } else {
                console.log('Zero occupancy already recorded. Skipping.');
                return;
            }
        }

        // 3. Append and prune
        if (newData) {
            history.push(newData);
        }

        const prunedHistory = pruneOldData(history, MAX_DAYS);

        // 4. Save history
        await writeFile(DATA_FILE, JSON.stringify(prunedHistory, null, 2));
        console.log(`Updated history with ${prunedHistory.length} entries`);

        // 5. Update status
        const status = {
            lastRun: new Date().toISOString(),
            success: true,
            message: isOpen ? 'Collection successful' : 'Gym closed (0 recorded)',
            data: newData
        };
        await writeFile(STATUS_FILE, JSON.stringify(status, null, 2));
        console.log('Status updated');

    } catch (error) {
        console.error('Collection process failed:', error);

        // Update status with error
        const status = {
            lastRun: new Date().toISOString(),
            success: false,
            message: error.message,
            error: error.stack
        };

        try {
            await writeFile(STATUS_FILE, JSON.stringify(status, null, 2));
        } catch (writeError) {
            console.error('Failed to write failure status:', writeError);
        }

        throw error; // Re-throw to ensure process exit code 1
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
