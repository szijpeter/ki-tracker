/**
 * KI Occupancy Scraper
 * Extracts live utilization data from Kletterzentrum Innsbruck website
 */

import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.kletterzentrum-innsbruck.at';
const MAIN_PAGES = [`${BASE_URL}/en/`, `${BASE_URL}/`, `${BASE_URL}/de/`];
const AJAX_URL = `${BASE_URL}/wp-admin/admin-ajax.php`;
const REQUEST_TIMEOUT_MS = 10000;
const RETRY_DELAY_MS = 1200;

const HEADER_PROFILES = [
  {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'de-AT,de;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    Referer: `${BASE_URL}/`,
  },
  {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,de;q=0.8',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    Referer: `${BASE_URL}/`,
  },
];

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetches the main page and extracts the WordPress nonce token
 * @returns {Promise<string>} The HTML content
 */
async function fetchMainPageHtml() {
  const failures = [];

  for (const pageUrl of MAIN_PAGES) {
    for (const headers of HEADER_PROFILES) {
      try {
        const response = await fetchWithTimeout(pageUrl, { headers });
        if (!response.ok) {
          failures.push(`${pageUrl} -> HTTP ${response.status}`);
          if (response.status === 403 || response.status === 429) {
            await delay(RETRY_DELAY_MS);
          }
          continue;
        }
        return await response.text();
      } catch (error) {
        failures.push(`${pageUrl} -> ${error.name || 'Error'}`);
        await delay(RETRY_DELAY_MS);
      }
    }
  }

  throw new Error(
    `Failed to fetch main page: all attempts failed (${failures.join(' | ')})`
  );
}

function extractNonce(html) {
  const nonceMatch = html.match(
    /ki_ajax\s*=\s*\{[^}]*nonce["']?\s*:\s*["']([^"']+)["']/
  );

  if (!nonceMatch) {
    throw new Error('Could not find nonce token in page');
  }

  return nonceMatch[1];
}

/**
 * Calls the WordPress AJAX endpoint to get occupancy data
 * @param {string} nonce - The security token
 * @returns {Promise<string>} The HTML response
 */
async function fetchOccupancyData(nonce) {
  const params = new URLSearchParams();
  params.append('action', 'ki_get_opening_hours_desktop');
  params.append('nonce', nonce);

  const headers = {
    ...HEADER_PROFILES[0],
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest',
    Origin: BASE_URL,
  };

  const response = await fetchWithTimeout(AJAX_URL, {
    method: 'POST',
    headers,
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`AJAX request failed: ${response.status}`);
  }

  return response.text();
}

function hasOccupancyData(data) {
  return data.lead !== null || data.boulder !== null;
}

async function scrapeFromMainPage() {
  const html = await fetchMainPageHtml();
  const data = parseOccupancyData(html);

  if (hasOccupancyData(data)) {
    return data;
  }

  const nonce = extractNonce(html);
  const ajaxHtml = await fetchOccupancyData(nonce);
  const ajaxData = parseOccupancyData(ajaxHtml);

  if (hasOccupancyData(ajaxData)) {
    return ajaxData;
  }

  throw new Error('Failed to parse occupancy data: No known selectors matched');
}

/**
 * Main scraping function - fetches and parses current occupancy
 * @returns {Promise<Object>} Complete occupancy data with timestamp
 */
export async function scrapeOccupancy() {
  let lastError;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const data = await scrapeFromMainPage();
      return {
        timestamp: new Date().toISOString(),
        ...data,
      };
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await delay(RETRY_DELAY_MS);
      }
    }
  }

  throw lastError;
}

/**
 * Parses the HTML response to extract occupancy percentages
 * @param {string} html - The HTML response from the AJAX call
 * @returns {Object} Parsed occupancy data
 */
export function parseOccupancyData(html) {
  const $ = cheerio.load(html);

  const result = {
    lead: null,
    boulder: null,
    overall: null,
    openSectors: null,
  };

  // The HTML structure is:
  // <div class="bar-container">
  //   <div class="bar" data-percentage="26"></div>
  //   <span class="label">Seil</span>
  // </div>

  // Find all bar containers and extract percentage + label
  $('.bar-container').each((_, container) => {
    const $container = $(container);
    const $bar = $container.find('[data-percentage]');
    const $label = $container.find('.label');

    if ($bar.length && $label.length) {
      const percentage = parseInt($bar.attr('data-percentage'), 10);
      const labelText = $label.text().toLowerCase().trim();

      if (labelText.includes('seil') || labelText.includes('lead')) {
        result.lead = percentage;
      } else if (labelText.includes('boulder')) {
        result.boulder = percentage;
      }
    }
  });

  // Fallback: look for data-percentage with nearby text
  if (result.lead === null && result.boulder === null) {
    $('[data-percentage]').each((_, el) => {
      const percentage = parseInt($(el).attr('data-percentage'), 10);
      const parentText = $(el).parent().text().toLowerCase();

      if (parentText.includes('seil') || parentText.includes('lead')) {
        result.lead = result.lead ?? percentage;
      } else if (parentText.includes('boulder')) {
        result.boulder = result.boulder ?? percentage;
      }
    });
  }

  // Calculate overall as average if we have both values
  if (result.lead !== null && result.boulder !== null) {
    result.overall = Math.round((result.lead + result.boulder) / 2);
  } else {
    result.overall = result.lead ?? result.boulder;
  }

  // Try to find open sectors info (pattern: "29/31" or similar)
  const sectorsMatch = html.match(/(\d+)\s*\/\s*(\d+)/);
  if (sectorsMatch) {
    result.openSectors = `${sectorsMatch[1]}/${sectorsMatch[2]}`;
  }

  return result;
}

// Run directly if executed as main module
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const data = await scrapeOccupancy();
    console.log('Current occupancy:');
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Scraping failed:', error.message);
    process.exit(1);
  }
}
