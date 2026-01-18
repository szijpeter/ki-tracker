import { test } from 'node:test';
import assert from 'node:assert';
import { parseOccupancyData } from '../scraper.js';

test('parseOccupancyData extracts correct values from standard layout', () => {
    const html = `
    <div class="bar-container">
      <div class="bar" data-percentage="45"></div>
      <span class="label">lead climbing</span>
    </div>
    <div class="bar-container">
      <div class="bar" data-percentage="30"></div>
      <span class="label">Boulder</span>
    </div>
    Some text 25/30 capacity
  `;

    // Note: openSectors regex looks for "29/31", matches "25/30"
    const result = parseOccupancyData(html);

    assert.strictEqual(result.lead, 45);
    assert.strictEqual(result.boulder, 30);
    assert.strictEqual(result.overall, 38); // Math.round(37.5) = 38
    assert.strictEqual(result.openSectors, '25/30');
});

test('parseOccupancyData handles missing sectors', () => {
    const html = `
    <div class="bar-container">
      <div class="bar" data-percentage="10"></div>
      <span class="label">Seil</span>
    </div>
  `;

    const result = parseOccupancyData(html);

    assert.strictEqual(result.lead, 10);
    assert.strictEqual(result.boulder, null);
    assert.strictEqual(result.overall, 10);
});

test('parseOccupancyData handles german labels', () => {
    const html = `
      <div class="bar-container">
        <div class="bar" data-percentage="80"></div>
        <span class="label">Seilklettern</span>
      </div>
    `;
    const result = parseOccupancyData(html);
    assert.strictEqual(result.lead, 80);
});
