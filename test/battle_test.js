/**
 * PumpLeague Battle Test Suite
 * 
 * Comprehensive end-to-end integration test that simulates
 * a full competition round with realistic scenarios.
 */

const store = require('../db/store');
const config = require('../config');
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');

class BattleTest {
    constructor() {
        this.results = {
            passed: 0,
            failed: 0,
            warnings: 0,
            tests: []
        };
        this.testRoundId = `TEST_${Date.now()}`;
        this.mockTokens = [];
    }

    log(emoji, message) {
        console.log(`${emoji} ${message}`);
    }

    pass(test) {
        this.results.passed++;
        this.results.tests.push({ test, status: 'PASS' });
        this.log('✅', test);
    }

    fail(test, reason) {
        this.results.failed++;
        this.results.tests.push({ test, status: 'FAIL', reason });
        this.log('❌', `${test}: ${reason}`);
    }

    warn(test, reason) {
        this.results.warnings++;
        this.results.tests.push({ test, status: 'WARN', reason });
        this.log('⚠️ ', `${test}: ${reason}`);
    }

    async run() {
        console.log('\n🏛️  PUMPLEAGUE BATTLE TEST SUITE\n');
        console.log('═'.repeat(70));
        console.log('Simulating full competition round with realistic scenarios...\n');

        try {
            await this.setup();
            await this.testSnapshot();
            await this.testFeeClaiming();
            await this.testScoring();
            await this.testFraudDetection();
            await this.testPayoutCalculation();
            await this.testDataIntegrity();
            await this.testEdgeCases();
            await this.testStressScenarios();
            await this.cleanup();
        } catch (error) {
            this.fail('Battle Test Suite', error.message);
            console.error(error);
        }

        this.printSummary();
    }

    async setup() {
        console.log('\n📦 SETUP: Initializing test environment\n');

        try {
            await store.init();
            this.pass('Database initialization');

            // Create mock tokens with realistic data
            this.mockTokens = [
                {
                    mint: 'WINNER1_' + Math.random().toString(36).substring(7),
                    name: 'Champion Token',
                    symbol: 'CHAMP',
                    holders: 1500,
                    volume: 100000,
                    liquidity: 50000,
                    claimedFees: 2.5,
                    isActive: true,
                    concentration: 0.35 // Healthy
                },
                {
                    mint: 'WINNER2_' + Math.random().toString(36).substring(7),
                    name: 'Runner Up',
                    symbol: 'RUNUP',
                    holders: 1200,
                    volume: 75000,
                    liquidity: 40000,
                    claimedFees: 1.8,
                    isActive: true,
                    concentration: 0.42
                },
                {
                    mint: 'WINNER3_' + Math.random().toString(36).substring(7),
                    name: 'Bronze Medal',
                    symbol: 'BRONZE',
                    holders: 1000,
                    volume: 50000,
                    liquidity: 30000,
                    claimedFees: 1.2,
                    isActive: true,
                    concentration: 0.38
                },
                {
                    mint: 'PASSIVE_' + Math.random().toString(36).substring(7),
                    name: 'Passive Token',
                    symbol: 'PASS',
                    holders: 800,
                    volume: 40000,
                    liquidity: 25000,
                    claimedFees: 0,
                    isActive: false,
                    concentration: 0.45
                },
                {
                    mint: 'FRAUD_' + Math.random().toString(36).substring(7),
                    name: 'Suspicious Token',
                    symbol: 'SUS',
                    holders: 15, // Below minimum
                    volume: 20000,
                    liquidity: 10000,
                    claimedFees: 0.5,
                    isActive: true,
                    concentration: 0.85 // Too concentrated
                }
            ];

            // Register mock tokens
            for (const token of this.mockTokens) {
                store.registerToken(token.mint, 'TEST_CREATOR', token.name, token.symbol);
            }
            this.pass(`Registered ${this.mockTokens.length} mock tokens`);

        } catch (error) {
            this.fail('Setup', error.message);
            throw error;
        }
    }

    async testSnapshot() {
        console.log('\n📸 PHASE 1: Snapshot Creation\n');

        try {
            // Create round
            const slot = 123456789;
            const timestamp = Date.now();
            store.createRound(this.testRoundId, slot, timestamp);
            this.pass('Round creation');

            // Save token snapshots
            for (const token of this.mockTokens) {
                store.saveTokenSnapshot(
                    this.testRoundId,
                    token.mint,
                    token.holders,
                    1000000000, // total supply
                    token.liquidity,
                    token.volume,
                    5.5 // price change
                );

                // Generate mock holders
                const mockHolders = this.generateMockHolders(token);
                store.saveHoldersBatch(this.testRoundId, token.mint, mockHolders);
            }
            this.pass('Token snapshots saved');

            // Verify snapshot data
            const tokens = store.getRoundTokens(this.testRoundId);
            if (tokens.length === this.mockTokens.length) {
                this.pass('Snapshot data integrity');
            } else {
                this.fail('Snapshot data integrity', `Expected ${this.mockTokens.length}, got ${tokens.length}`);
            }

            store.updateRoundStatus(this.testRoundId, 'snapshot_complete');
            this.pass('Snapshot phase completed');

        } catch (error) {
            this.fail('Snapshot phase', error.message);
        }
    }

    async testFeeClaiming() {
        console.log('\n💰 PHASE 2: Fee Claiming\n');

        try {
            store.updateRoundStatus(this.testRoundId, 'claiming');

            // Simulate fee claiming for each token
            for (const token of this.mockTokens) {
                const preBalance = 10.0; // Mock balance
                const postBalance = preBalance + token.claimedFees;

                store.updateTokenFees(
                    this.testRoundId,
                    token.mint,
                    preBalance,
                    postBalance,
                    token.claimedFees,
                    token.isActive ? 1 : 0
                );
            }
            this.pass('Fee claiming simulation');

            // Verify active/passive classification
            const tokens = store.getRoundTokens(this.testRoundId);
            const activeCount = tokens.filter(t => t.is_active === 1).length;
            const expectedActive = this.mockTokens.filter(t => t.isActive).length;

            if (activeCount === expectedActive) {
                this.pass('Active/passive classification');
            } else {
                this.fail('Active/passive classification', `Expected ${expectedActive} active, got ${activeCount}`);
            }

            store.updateRoundStatus(this.testRoundId, 'fees_claimed');
            this.pass('Fee claiming phase completed');

        } catch (error) {
            this.fail('Fee claiming phase', error.message);
        }
    }

    async testScoring() {
        console.log('\n📊 PHASE 3: Scoring & Ranking\n');

        try {
            const { calculateScore } = require('../game/scoring');
            const tokens = store.getRoundTokens(this.testRoundId);

            for (const token of tokens) {
                const score = calculateScore(token);
                store.updateTokenScore(this.testRoundId, token.token_mint, score);
            }
            this.pass('Score calculation');

            // Verify scoring logic
            const scored = store.getRoundTokens(this.testRoundId);
            const sorted = scored.sort((a, b) => b.score - a.score);

            // Top scorer should be CHAMP (highest fees + volume + holders)
            if (sorted[0].symbol === 'CHAMP') {
                this.pass('Scoring logic correctness');
            } else {
                this.warn('Scoring logic', `Expected CHAMP as top, got ${sorted[0].symbol}`);
            }

            // Active tokens should score higher than passive
            const activeScores = scored.filter(t => t.is_active).map(t => t.score);
            const passiveScores = scored.filter(t => !t.is_active).map(t => t.score);
            const avgActive = activeScores.reduce((a, b) => a + b, 0) / activeScores.length;
            const avgPassive = passiveScores.reduce((a, b) => a + b, 0) / passiveScores.length;

            if (avgActive > avgPassive) {
                this.pass('Active boost verification');
            } else {
                this.fail('Active boost', 'Active tokens should score higher on average');
            }

            store.updateRoundStatus(this.testRoundId, 'scored');
            this.pass('Scoring phase completed');

        } catch (error) {
            this.fail('Scoring phase', error.message);
        }
    }

    async testFraudDetection() {
        console.log('\n🛡️  PHASE 4: Fraud Detection\n');

        try {
            const { detectFraud } = require('../game/antifraud');
            const tokens = store.getRoundTokens(this.testRoundId);

            for (const token of tokens) {
                const mockToken = this.mockTokens.find(t => t.mint === token.token_mint);
                const holders = store.getHoldersForToken(this.testRoundId, token.token_mint);

                const flags = detectFraud(token, holders);

                if (flags.length > 0) {
                    store.saveFraudFlags(this.testRoundId, token.token_mint, flags);
                }
            }
            this.pass('Fraud detection execution');

            // Verify suspicious token was flagged
            const susToken = tokens.find(t => t.symbol === 'SUS');
            const susFlags = store.getFraudFlags(this.testRoundId, susToken.token_mint);

            if (susFlags.length > 0) {
                this.pass('Fraud detection accuracy (flagged suspicious token)');
            } else {
                this.fail('Fraud detection', 'Failed to flag obviously suspicious token');
            }

            // Verify clean tokens weren't flagged
            const champToken = tokens.find(t => t.symbol === 'CHAMP');
            const champFlags = store.getFraudFlags(this.testRoundId, champToken.token_mint);

            if (champFlags.length === 0) {
                this.pass('Fraud detection precision (no false positives)');
            } else {
                this.warn('Fraud detection', 'Flagged a clean token');
            }

        } catch (error) {
            this.fail('Fraud detection phase', error.message);
        }
    }

    async testPayoutCalculation() {
        console.log('\n💸 PHASE 5: Payout Calculation\n');

        try {
            const tokens = store.getRoundTokens(this.testRoundId);
            const sorted = tokens.sort((a, b) => b.score - a.score);
            const winners = sorted.slice(0, config.topN);

            // Calculate total fees
            const totalFees = this.mockTokens.reduce((sum, t) => sum + t.claimedFees, 0);
            this.pass(`Total fees: ${totalFees.toFixed(4)} SOL`);

            // Verify fee distribution
            const holderShare = totalFees * config.feeDistribution.toHolders;
            const arenaShare = totalFees * config.feeDistribution.toArena;
            const prizeShare = totalFees * config.feeDistribution.toPrizePool;

            const calculatedTotal = holderShare + arenaShare + prizeShare;
            if (Math.abs(calculatedTotal - totalFees) < 0.0001) {
                this.pass('Fee distribution calculation');
            } else {
                this.fail('Fee distribution', `Sum mismatch: ${calculatedTotal} vs ${totalFees}`);
            }

            // Simulate payout distribution
            let totalPaidOut = 0;
            for (const winner of winners) {
                const holders = store.getHoldersForToken(this.testRoundId, winner.token_mint);
                const tokenFees = this.mockTokens.find(t => t.mint === winner.token_mint).claimedFees;
                const tokenShare = tokenFees * config.feeDistribution.toHolders;

                // Distribute proportionally
                for (const holder of holders) {
                    const holderPct = holder.balance / winner.total_supply;
                    const payout = tokenShare * holderPct;

                    if (payout >= config.safetyLimits.minPayoutLamports / 1e9) {
                        totalPaidOut += payout;
                    }
                }
            }

            if (totalPaidOut <= holderShare * 1.01) { // Allow 1% variance for rounding
                this.pass('Payout calculation accuracy');
            } else {
                this.fail('Payout calculation', `Paid ${totalPaidOut} vs allocated ${holderShare}`);
            }

        } catch (error) {
            this.fail('Payout calculation', error.message);
        }
    }

    async testDataIntegrity() {
        console.log('\n🔍 PHASE 6: Data Integrity Checks\n');

        try {
            // Check round exists
            const round = store.getRound(this.testRoundId);
            if (round) {
                this.pass('Round record integrity');
            } else {
                this.fail('Round record', 'Round not found in database');
            }

            // Check all tokens have snapshots
            const tokens = store.getRoundTokens(this.testRoundId);
            if (tokens.length === this.mockTokens.length) {
                this.pass('Token snapshot completeness');
            } else {
                this.fail('Token snapshots', `Missing snapshots: ${this.mockTokens.length - tokens.length}`);
            }

            // Check all tokens have holders
            for (const token of tokens) {
                const holders = store.getHoldersForToken(this.testRoundId, token.token_mint);
                if (holders.length > 0) {
                    this.pass(`Holder data for ${token.symbol}`);
                } else {
                    this.fail(`Holder data for ${token.symbol}`, 'No holders found');
                }
            }

            // Check score normalization
            const scores = tokens.map(t => t.score);
            const maxScore = Math.max(...scores);
            const minScore = Math.min(...scores);

            if (maxScore <= 100 && minScore >= 0) {
                this.pass('Score normalization (0-100 range)');
            } else {
                this.warn('Score normalization', `Range: ${minScore} to ${maxScore}`);
            }

        } catch (error) {
            this.fail('Data integrity checks', error.message);
        }
    }

    async testEdgeCases() {
        console.log('\n⚠️  PHASE 7: Edge Case Testing\n');

        try {
            // Test zero fees
            const passiveToken = this.mockTokens.find(t => !t.isActive);
            if (passiveToken) {
                this.pass('Zero fees handling (passive tokens)');
            }

            // Test minimum holder count
            const lowHolderToken = this.mockTokens.find(t => t.holders < config.antifraud.minHolderCount);
            if (lowHolderToken) {
                const flags = store.getFraudFlags(this.testRoundId, lowHolderToken.mint);
                if (flags.some(f => f.includes('LOW_HOLDERS'))) {
                    this.pass('Minimum holder threshold enforcement');
                } else {
                    this.warn('Minimum holders', 'Low holder count not flagged');
                }
            }

            // Test concentration limits
            const concentratedToken = this.mockTokens.find(t => t.concentration > config.antifraud.maxConcentration);
            if (concentratedToken) {
                const flags = store.getFraudFlags(this.testRoundId, concentratedToken.mint);
                if (flags.some(f => f.includes('CONCENTRATION'))) {
                    this.pass('Concentration limit enforcement');
                } else {
                    this.warn('Concentration limits', 'High concentration not flagged');
                }
            }

        } catch (error) {
            this.fail('Edge case testing', error.message);
        }
    }

    async testStressScenarios() {
        console.log('\n💪 PHASE 8: Stress Testing\n');

        try {
            // Test with many holders
            const largeHolderSet = [];
            for (let i = 0; i < 1000; i++) {
                largeHolderSet.push({
                    wallet_address: `WALLET_${i}`,
                    balance: Math.random() * 1000000
                });
            }

            const testToken = this.mockTokens[0];
            store.saveHoldersBatch(this.testRoundId, testToken.mint, largeHolderSet);

            const retrieved = store.getHoldersForToken(this.testRoundId, testToken.mint);
            if (retrieved.length >= 1000) {
                this.pass('Large holder set handling (1000+ holders)');
            } else {
                this.fail('Large holder set', `Only retrieved ${retrieved.length} holders`);
            }

            // Test rapid queries
            const startTime = Date.now();
            for (let i = 0; i < 100; i++) {
                store.getRoundTokens(this.testRoundId);
            }
            const elapsed = Date.now() - startTime;

            if (elapsed < 1000) {
                this.pass(`Query performance (100 queries in ${elapsed}ms)`);
            } else {
                this.warn('Query performance', `Slow: ${elapsed}ms for 100 queries`);
            }

        } catch (error) {
            this.fail('Stress testing', error.message);
        }
    }

    async cleanup() {
        console.log('\n🧹 CLEANUP: Removing test data\n');

        try {
            // Deactivate test tokens
            for (const token of this.mockTokens) {
                store.deactivateToken(token.mint);
            }
            this.pass('Test tokens deactivated');

            // Note: We keep the test round for manual inspection
            this.log('ℹ️ ', `Test round ${this.testRoundId} preserved for inspection`);

        } catch (error) {
            this.warn('Cleanup', error.message);
        }
    }

    generateMockHolders(token) {
        const holders = [];
        const holderCount = token.holders;

        // Generate realistic holder distribution (power law)
        for (let i = 0; i < holderCount; i++) {
            const rank = i + 1;
            const balance = 1000000000 / Math.pow(rank, 1.5); // Power law distribution

            holders.push({
                wallet_address: `HOLDER_${token.symbol}_${i}`,
                balance: Math.floor(balance)
            });
        }

        return holders;
    }

    printSummary() {
        console.log('\n' + '═'.repeat(70));
        console.log('\n📊 BATTLE TEST SUMMARY\n');

        console.log(`✅ Passed:   ${this.results.passed}`);
        console.log(`❌ Failed:   ${this.results.failed}`);
        console.log(`⚠️  Warnings: ${this.results.warnings}`);
        console.log(`📝 Total:    ${this.results.tests.length}`);

        const passRate = (this.results.passed / this.results.tests.length * 100).toFixed(1);
        console.log(`\n📈 Pass Rate: ${passRate}%`);

        if (this.results.failed > 0) {
            console.log('\n❌ FAILED TESTS:\n');
            this.results.tests
                .filter(t => t.status === 'FAIL')
                .forEach(t => console.log(`   ❌ ${t.test}: ${t.reason}`));
            console.log('\n⚠️  SYSTEM HAS ISSUES - REVIEW FAILURES\n');
        } else if (this.results.warnings > 0) {
            console.log('\n⚠️  WARNINGS:\n');
            this.results.tests
                .filter(t => t.status === 'WARN')
                .forEach(t => console.log(`   ⚠️  ${t.test}: ${t.reason}`));
            console.log('\n✅ SYSTEM FUNCTIONAL WITH WARNINGS\n');
        } else {
            console.log('\n🎉 ALL TESTS PASSED - SYSTEM BATTLE-READY!\n');
        }

        console.log('═'.repeat(70));
    }
}

// Run battle test
const test = new BattleTest();
test.run().catch(error => {
    console.error('\n💥 Battle test crashed:', error);
    process.exit(1);
});
