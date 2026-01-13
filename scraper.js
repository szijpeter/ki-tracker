/**
 * KI Occupancy Scraper
 * Extracts live utilization data from Kletterzentrum Innsbruck website
 */

import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.kletterzentrum-innsbruck.at';
const MAIN_PAGE = `${BASE_URL}/en/`;
const AJAX_URL = `${BASE_URL}/wp-admin/admin-ajax.php`;

/**
 * Fetches the main page and extracts the WordPress nonce token
 * @returns {Promise<string>} The nonce token
 */
async function extractNonce() {
  /* eslint-disable no-undef */
  // Add AbortController support for Node 16+ (global in 18+)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const response = await fetch(MAIN_PAGE, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch main page: ${response.status}`);
    }

    const html = await response.text();

    // Look for ki_ajax object in the page's JavaScript
    const nonceMatch = html.match(
      /ki_ajax\s*=\s*\{[^}]*nonce["']?\s*:\s*["']([^"']+)["']/
    );

    if (!nonceMatch) {
      throw new Error('Could not find nonce token in page');
    }

    return nonceMatch[1];
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Calls the WordPress AJAX endpoint to get occupancy data
 * @param {string} nonce - The security token
 * @returns {Promise<string>} The HTML response
 */
async function fetchOccupancyData(nonce) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  const params = new URLSearchParams();
  params.append('action', 'ki_get_opening_hours_desktop');
  params.append('nonce', nonce);

  try {
    const response = await fetch(AJAX_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error(`AJAX request failed: ${response.status}`);
    }

    return response.text();
  } finally {
    clearTimeout(timeoutId);
  }
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

/**
 * Main scraping function - fetches and parses current occupancy
 * @returns {Promise<Object>} Complete occupancy data with timestamp
 */
export async function scrapeOccupancy() {
  const nonce = await extractNonce();
  const html = await fetchOccupancyData(nonce);
  const data = parseOccupancyData(html);

  if (data.lead === null && data.boulder === null) {
    throw new Error('Failed to parse occupancy data: No known selectors matched');
  }

  return {
    timestamp: new Date().toISOString(),
    ...data,
  };
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
