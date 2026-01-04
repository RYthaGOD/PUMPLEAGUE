const { test, describe, it } = require('node:test');
const assert = require('node:assert');
const antifraud = require('../../game/antifraud');

describe('Antifraud System', () => {

    describe('detectFraud', () => {
        it('should detect high holder concentration', async () => {
            const tokenStats = { volume_24h: 1000, claimed_fees: 10 };

            // Create holders where top 1 has 90%
            const holders = [
                { balance: 900, address: 'whale' },
                { balance: 10, address: 'h2' },
                { balance: 10, address: 'h3' },
                { balance: 10, address: 'h4' }
            ];
            // Total 930. Top 3: 920. 920/930 = 98.9% > 80%

            const result = await antifraud.detectFraud(tokenStats, holders);

            // Should flag it, but requires 2+ flags to be "Suspicious" generally
            assert.ok(result.flags.length > 0);
            assert.ok(result.flags.some(f => f.includes('HIGH_CONCENTRATION')));
        });

        it('should detect abnormal fee-to-volume ratio', async () => {
            // High fees, low volume (wash trading fees?)
            // ratio = fees / volume
            // threshold 0.10 (10%)
            const tokenStats = {
                volume_24h: 100,
                claimed_fees: 20 // 20% ratio > 10%
            };
            const holders = new Array(25).fill({ balance: 10, address: 'addr' });

            const result = await antifraud.detectFraud(tokenStats, holders);

            assert.ok(result.flags.length > 0);
            assert.ok(result.flags.some(f => f.includes('ABNORMAL_FEE_RATIO')));
        });

        it('should detect low holder count', async () => {
            const tokenStats = { volume_24h: 1000 };
            const holders = new Array(5).fill({ balance: 10 });
            // Min is 20 usually

            const result = await antifraud.detectFraud(tokenStats, holders);

            assert.ok(result.flags.length > 0);
            assert.ok(result.flags.some(f => f.includes('LOW_HOLDER_COUNT')));
        });

        it('should return clean for healthy token', async () => {
            const tokenStats = {
                volume_24h: 10000,
                claimed_fees: 100 // 1% ratio 
            };

            // Well distributed
            const holders = new Array(100).fill(0).map((_, i) => ({
                balance: 100 + Math.random() * 10,
                address: `h${i}`
            }));

            const result = await antifraud.detectFraud(tokenStats, holders);

            assert.strictEqual(result.isSuspicious, false);
            assert.strictEqual(result.flags.length, 0);
            assert.strictEqual(result.penaltyMultiplier, 1.0);
        });
    });

    describe('shouldDisqualify', () => {
        it('should disqualify if 3 or more flags', () => {
            const result = { flags: ['F1', 'F2', 'F3'] };
            assert.strictEqual(antifraud.shouldDisqualify(result), true);
        });

        it('should not disqualify if fewer than 3 flags', () => {
            const result = { flags: ['F1', 'F2'] };
            assert.strictEqual(antifraud.shouldDisqualify(result), false);
        });
    });
});
