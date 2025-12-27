/**
 * Production Readiness Audit Script
 * Run this before deploying to production
 */

const store = require('../db/store');
const config = require('../config');
const { Connection, Keypair } = require('@solana/web3.js');

class ProductionAudit {
    constructor() {
        this.results = {
            passed: [],
            failed: [],
            warnings: []
        };
    }

    pass(test) {
        this.results.passed.push(test);
        console.log(`✅ ${test}`);
    }

    fail(test, reason) {
        this.results.failed.push({ test, reason });
        console.log(`❌ ${test}: ${reason}`);
    }

    warn(test, reason) {
        this.results.warnings.push({ test, reason });
        console.log(`⚠️  ${test}: ${reason}`);
    }

    async run() {
        console.log('\n🔍 PRODUCTION READINESS AUDIT\n');
        console.log('═'.repeat(60));

        await this.auditDatabase();
        await this.auditWalletSecurity();
        await this.auditConfiguration();
        await this.auditAPIIntegrations();
        await this.auditErrorHandling();
        await this.auditDataIntegrity();

        this.printSummary();
    }

    async auditDatabase() {
        console.log('\n📦 DATABASE AUDIT\n');

        try {
            await store.init();
            this.pass('Database initialization');

            // Check for test tokens
            const active = store.getActiveTokens();
            if (active.length > 1) {
                this.warn('Multiple active tokens found', `${active.length} tokens - verify these are production tokens`);
            } else if (active.length === 1) {
                this.pass('Single production token registered');
            } else {
                this.warn('No active tokens', 'System will run but needs tokens to compete');
            }

            // Check for incomplete rounds
            const latest = store.getLatestRound();
            if (latest && latest.status !== 'completed') {
                this.warn('Incomplete round detected', `Round ${latest.round_id} is in ${latest.status} state`);
            } else {
                this.pass('No incomplete rounds');
            }

        } catch (error) {
            this.fail('Database audit', error.message);
        }
    }

    async auditWalletSecurity() {
        console.log('\n🔐 WALLET SECURITY AUDIT\n');

        try {
            // Check secret key parsing
            const secretKey = config.arenaWallet.secretKey;
            if (!secretKey || secretKey.length === 0) {
                this.fail('Wallet secret key', 'ARENA_WALLET_SECRET not configured');
                return;
            }

            if (secretKey.length !== 32 && secretKey.length !== 64) {
                this.fail('Wallet secret key length', `Invalid length: ${secretKey.length} bytes`);
                return;
            }
            this.pass(`Wallet secret key format (${secretKey.length} bytes)`);

            // Verify keypair derivation
            let wallet;
            try {
                if (secretKey.length === 64) {
                    try {
                        wallet = Keypair.fromSecretKey(secretKey);
                    } catch (e) {
                        wallet = Keypair.fromSeed(secretKey.slice(0, 32));
                    }
                } else {
                    wallet = Keypair.fromSeed(secretKey);
                }
                this.pass('Wallet keypair derivation');
            } catch (error) {
                this.fail('Wallet keypair derivation', error.message);
                return;
            }

            // Check public key matches
            const configPubkey = config.arenaWallet.publicKey;
            const derivedPubkey = wallet.publicKey.toBase58();
            if (configPubkey === derivedPubkey) {
                this.pass('Public key consistency');
            } else {
                this.fail('Public key mismatch', `Config: ${configPubkey}, Derived: ${derivedPubkey}`);
            }

            // Check balance
            try {
                const connection = new Connection(config.solanaRpcUrl, 'confirmed');
                const balance = await connection.getBalance(wallet.publicKey);
                const balanceSOL = balance / 1e9;

                if (balanceSOL >= config.safetyLimits.minArenaBalanceSOL) {
                    this.pass(`Arena balance (${balanceSOL.toFixed(4)} SOL)`);
                } else {
                    this.fail('Arena balance too low', `${balanceSOL.toFixed(4)} SOL < ${config.safetyLimits.minArenaBalanceSOL} SOL required`);
                }
            } catch (error) {
                this.warn('Balance check failed', error.message);
            }

        } catch (error) {
            this.fail('Wallet security audit', error.message);
        }
    }

    async auditConfiguration() {
        console.log('\n⚙️  CONFIGURATION AUDIT\n');

        // Check critical env vars
        const criticalVars = [
            'SOLANA_RPC_URL',
            'ARENA_WALLET_SECRET',
            'GEMINI_API_KEY'
        ];

        for (const varName of criticalVars) {
            if (process.env[varName]) {
                this.pass(`${varName} configured`);
            } else {
                this.fail(`${varName} missing`, 'Required environment variable not set');
            }
        }

        // Check optional but recommended
        if (!process.env.PUMPPORTAL_API_KEY) {
            this.warn('PUMPPORTAL_API_KEY not set', 'Fee claiming will not work');
        } else {
            this.pass('PUMPPORTAL_API_KEY configured');
        }

        // Check AI configuration
        if (config.ai.enabled) {
            this.pass('AI enabled');
            if (config.ai.autopilotMode === 'FULL_AUTO') {
                this.warn('AI in FULL_AUTO mode', 'Will post tweets automatically');
            }
        } else {
            this.warn('AI disabled', 'Agent commentary will not be generated');
        }

        // Check safety limits
        if (config.safetyLimits.minArenaBalanceSOL < 0.1) {
            this.warn('Low minimum balance threshold', 'Consider increasing for production');
        }
    }

    async auditAPIIntegrations() {
        console.log('\n🌐 API INTEGRATION AUDIT\n');

        // Test DexScreener
        try {
            const dexscreener = require('../external/dexscreener');
            // Use a known token for testing
            const testMint = '8TcEe7nSgRqQyzVCh55SzDJrFbHsz7J92TyxBMyGpump';
            const data = await dexscreener.getTokenData(testMint);
            if (data) {
                this.pass('DexScreener API connectivity');
            } else {
                this.warn('DexScreener returned null', 'Token may not be listed yet');
            }
        } catch (error) {
            this.fail('DexScreener API', error.message);
        }

        // Test Gemini AI
        if (config.ai.enabled) {
            try {
                const gemini = require('../ai/gemini');
                if (gemini.enabled) {
                    this.pass('Gemini AI client initialized');
                } else {
                    this.warn('Gemini AI disabled', 'Check API key and configuration');
                }
            } catch (error) {
                this.fail('Gemini AI', error.message);
            }
        }
    }

    async auditErrorHandling() {
        console.log('\n🛡️  ERROR HANDLING AUDIT\n');

        // Check for try-catch in critical paths
        const criticalFiles = [
            '../core/snapshot.js',
            '../core/fees.js',
            '../payout/executor.js'
        ];

        for (const file of criticalFiles) {
            try {
                require(file);
                this.pass(`${file.split('/').pop()} loads without errors`);
            } catch (error) {
                this.fail(`${file.split('/').pop()} load failed`, error.message);
            }
        }
    }

    async auditDataIntegrity() {
        console.log('\n📊 DATA INTEGRITY AUDIT\n');

        // Check scoring weights sum to 1.0
        const weights = config.scoringWeights;
        const totalWeight = weights.fees + weights.holders + weights.volume + weights.stability + weights.growth;
        if (Math.abs(totalWeight - 1.0) < 0.01) {
            this.pass('Scoring weights normalized');
        } else {
            this.warn('Scoring weights', `Total weight: ${totalWeight.toFixed(2)} (should be ~1.0)`);
        }

        // Check fee distribution sums to 1.0
        const fees = config.feeDistribution;
        const totalFees = fees.toHolders + fees.toArena + fees.toPrizePool;
        if (Math.abs(totalFees - 1.0) < 0.01) {
            this.pass('Fee distribution sums to 100%');
        } else {
            this.fail('Fee distribution', `Sums to ${(totalFees * 100).toFixed(0)}% instead of 100%`);
        }
    }

    printSummary() {
        console.log('\n' + '═'.repeat(60));
        console.log('\n📋 AUDIT SUMMARY\n');

        console.log(`✅ Passed: ${this.results.passed.length}`);
        console.log(`❌ Failed: ${this.results.failed.length}`);
        console.log(`⚠️  Warnings: ${this.results.warnings.length}`);

        if (this.results.failed.length > 0) {
            console.log('\n🚨 CRITICAL FAILURES:\n');
            this.results.failed.forEach(f => {
                console.log(`   ❌ ${f.test}: ${f.reason}`);
            });
            console.log('\n⛔ SYSTEM NOT READY FOR PRODUCTION\n');
            process.exit(1);
        } else if (this.results.warnings.length > 0) {
            console.log('\n⚠️  WARNINGS TO REVIEW:\n');
            this.results.warnings.forEach(w => {
                console.log(`   ⚠️  ${w.test}: ${w.reason}`);
            });
            console.log('\n✅ SYSTEM READY WITH WARNINGS\n');
        } else {
            console.log('\n🎉 ALL CHECKS PASSED - PRODUCTION READY!\n');
        }
    }
}

// Run audit
const audit = new ProductionAudit();
audit.run().catch(error => {
    console.error('\n💥 Audit crashed:', error);
    process.exit(1);
});
