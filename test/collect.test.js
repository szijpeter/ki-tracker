import { test } from 'node:test';
import assert from 'node:assert';
import { pruneOldData } from '../collect.js';

test('pruneOldData removes entries older than maxDays', () => {
    const now = new Date();
    // Use fixed time to avoid flakiness with time boundaries if needed, 
    // but relative calculation usually fine
    const oneDay = 24 * 60 * 60 * 1000;

    const recent = new Date(now - 2 * oneDay).toISOString();
    const old = new Date(now - 8 * oneDay).toISOString();
    const boundary = new Date(now - 7 * oneDay + 1000).toISOString(); // Just inside 7 days

    const data = [
        { timestamp: recent, val: 1 },
        { timestamp: old, val: 2 },
        { timestamp: boundary, val: 3 }
    ];

    const result = pruneOldData(data, 7);

    // Should keep recent and boundary, remove old
    assert.strictEqual(result.length, 2);
    // ordered same way
    assert.strictEqual(result[0].val, 1);
    assert.strictEqual(result[1].val, 3);
});

test('pruneOldData handles empty arrays', () => {
    const result = pruneOldData([], 7);
    assert.deepStrictEqual(result, []);
});
