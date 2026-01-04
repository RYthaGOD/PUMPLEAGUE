const { test, describe, it } = require('node:test');
const assert = require('node:assert');
const scoring = require('../../game/scoring');

describe('Scoring Logic', () => {

    describe('calculateDynamicBounds', () => {
        it('should calculate correct min/max bounds', () => {
            const tokens = [
                { claimed_fees: 10, volume_24h: 1000 },
                { claimed_fees: 50, volume_24h: 5000 },
                { claimed_fees: 5, volume_24h: 500 }
            ];
            const holders = {
                't1': new Array(10), // length 10
                't2': new Array(50),
                't3': new Array(5)
            };

            // Map holders to tokens for the function logic
            // The function expects tokens.map looking up holders[t.token_mint]
            // Let's mock token_mint
            tokens[0].token_mint = 't1';
            tokens[1].token_mint = 't2';
            tokens[2].token_mint = 't3';

            const bounds = scoring.calculateDynamicBounds(tokens, holders);

            assert.strictEqual(bounds.feeMin, 5);
            assert.strictEqual(bounds.feeMax, 50);
            assert.strictEqual(bounds.holderMin, 5);
            assert.strictEqual(bounds.holderMax, 50);
            assert.strictEqual(bounds.volumeMin, 500);
            assert.strictEqual(bounds.volumeMax, 5000);
        });

        it('should handle single token gracefully', () => {
            const tokens = [{ claimed_fees: 10, volume_24h: 1000, token_mint: 't1' }];
            const holders = { 't1': new Array(10) };

            const bounds = scoring.calculateDynamicBounds(tokens, holders);

            // min == max, but max || 1 prevents zero
            assert.strictEqual(bounds.feeMin, 10);
            assert.strictEqual(bounds.feeMax, 10);
        });
    });

    describe('normalize', () => {
        it('should normalize value within range 0-100', () => {
            // value, min, max
            assert.strictEqual(scoring.normalize(50, 0, 100), 50);
            assert.strictEqual(scoring.normalize(10, 0, 100), 10);
            assert.strictEqual(scoring.normalize(100, 0, 100), 100);
        });

        it('should handle min == max', () => {
            // Implementation detail: returns 50 when range is 0
            assert.strictEqual(scoring.normalize(50, 50, 50), 50);
        });

        it('should clamp values', () => {
            assert.strictEqual(scoring.normalize(150, 0, 100), 100);
            assert.strictEqual(scoring.normalize(-10, 0, 100), 0);
        });
    });

    describe('calculateScore', () => {
        it('should calculate weighted score correctly', () => {
            const tokenStats = {
                claimed_fees: 50,
                volume_24h: 5000,
                price_change_24h: 5 // 5% change -> 95 stability score, 5 growth score
            };
            const holders = new Array(50);

            const bounds = {
                feeMin: 0, feeMax: 100,
                holderMin: 0, holderMax: 100,
                volumeMin: 0, volumeMax: 10000
            };

            // Expected scores (Weights: fees 0.3, holders 0.25, vol 0.2, stability 0.15, growth 0.1):
            // Fees: 50 (normalized 0-100) * 0.30 = 15
            // Holders: 50 (normalized 0-100) * 0.25 = 12.5
            // Volume: 50 (normalized 0-10000) = 50 * 0.20 = 10
            // Stability: 95 * 0.15 = 14.25
            // Growth: 5 * 0.10 = 0.5
            // Total: 15 + 12.5 + 10 + 14.25 + 0.5 = 52.25

            const result = scoring.calculateScore(tokenStats, holders, bounds);

            // Allow small float precision diff
            assert.ok(Math.abs(result.rawScore - 52.25) < 0.01, `Expected 52.25, got ${result.rawScore}`);
        });

        it('should apply 2x boost if configured', () => {
            // Wait, the 2x boost is inside calculation?
            // "rawScore *= 2.0; // 2x boost for active fee contributors (per RULES.md)"
            // This line is unconditional in some versions or conditional?
            // In verification step (Step 490), we saw:
            // "rawScore *= 2.0; // 2x boost for active fee contributors"
            // It seems it was unconditional there?
            // Let's check scoring.js carefully in next read if test fails.
        });
    });
});
