/**
 * PumpLeague Protocol - Main Orchestrator
 * 
 * Complete automated token competition system with:
 * - Round snapshots at fixed slots
 * - Full holder indexing
 * - Fee delta accounting
 * - Multi-metric scoring
 * - Anti-fraud detection
 * - Safe payout execution
 * - Transparent accounting
 * - Crash recovery with round resume
 */

const config = require("./config");
const store = require("./db/store");
const { createRoundSnapshot } = require("./core/snapshot");
const { claimAllFees } = require("./core/fees");
const { rankTokens, getLeaderboard } = require("./game/scoring");
const { executePayouts } = require("./payout/executor");
const { generateRoundAccounting } = require("./payout/accounting");
const { announceRoundComplete, announceLeaderboard } = require("./social/twitter");
const { formatHallOfFame } = require("./social/history");
const { getSafetyStatus } = require("./safety/guards");
const { getRoundState } = require("./safety/idempotency");
const { Keypair, PublicKey, Connection } = require("@solana/web3.js");
const agent = require("./ai/agent");

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SINGLE_ROUND = args.includes('--single');

let isRoundRunning = false;

/**
 * Check for and resume any incomplete rounds
 * This handles crash recovery scenarios
 */
async function resumeIncompleteRounds(arenaWallet) {
    const history = store.getRoundHistory(10);
    const incompleteStatuses = ['pending', 'snapshot_complete', 'claiming', 'fees_claimed', 'paying'];

    const incompleteRounds = history.filter(r => incompleteStatuses.includes(r.status));

    if (incompleteRounds.length === 0) {
        return null;
    }

    console.log(`\n🔄 Found ${incompleteRounds.length} incomplete round(s), attempting to resume...`);

    for (const round of incompleteRounds) {
        const roundId = round.round_id;
        const status = round.status;

        console.log(`\n   Resuming round ${roundId} (status: ${status})...`);

        try {
            // Resume based on where it stopped
            if (status === 'pending' || status === 'snapshot_complete') {
                // Need to claim fees
                console.log(`   → Resuming from fee claiming...`);
                await claimAllFees(roundId, arenaWallet.publicKey);
            }

            if (['pending', 'snapshot_complete', 'claiming', 'fees_claimed'].includes(status)) {
                // Need to score and rank
                console.log(`   → Calculating scores...`);
                const ranked = await rankTokens(roundId);
            }

            if (['pending', 'snapshot_complete', 'claiming', 'fees_claimed', 'paying'].includes(status)) {
                // Need to execute payouts
                console.log(`   → Resuming payouts...`);
                const topTokens = store.getTopTokens(roundId, config.topN);
                await executePayouts(roundId, topTokens, { dryRun: DRY_RUN });
            }

            // Complete the round
            const ranked = store.getRoundTokens(roundId);

            // Update Hall of Fame
            if (!DRY_RUN) {
                for (const token of ranked.slice(0, 3)) {
                    store.updateHallOfFame(
                        token.token_mint,
                        token.rank,
                        token.claimed_fees || 0,
                        token.score || 0,
                        roundId
                    );
                }
            }

            console.log(`   ✅ Round ${roundId} resumed and completed!`);

        } catch (error) {
            console.error(`   ❌ Failed to resume round ${roundId}: ${error.message}`);
        }
    }

    return incompleteRounds.length;
}

/**
 * Run a complete round
 */
async function runRound() {
    if (isRoundRunning) {
        console.log('\n⚠️ A round is already in progress. Skipping.');
        return null;
    }

    try {
        isRoundRunning = true;

        console.log(`\n${'═'.repeat(60)}`);
        console.log(`🛡 PUMPLEAGUE ROUND STARTING...`);
        console.log(`   Mode: ${DRY_RUN ? '🧪 DRY RUN' : '💰 LIVE'}`);
        console.log(`${'═'.repeat(60)}\n`);

        // Check safety status
        const safety = getSafetyStatus();
        if (safety.emergencyStop) {
            console.error('🚨 EMERGENCY STOP IS ACTIVE. Aborting round.');
            return null;
        }

        // Get arena wallet
        let arenaWallet;
        try {
            const secretKey = config.arenaWallet.secretKey;
            if (!secretKey || secretKey.length === 0) {
                throw new Error('Arena wallet secret key not configured');
            }

            if (secretKey.length === 64) {
                try {
                    arenaWallet = Keypair.fromSecretKey(secretKey);
                } catch (e) {
                    console.warn(`   ⚠️ Standard 64-byte load failed, trying first 32 bytes as seed...`);
                    arenaWallet = Keypair.fromSeed(secretKey.slice(0, 32));
                }
            } else if (secretKey.length === 32) {
                arenaWallet = Keypair.fromSeed(secretKey);
            } else {
                throw new Error(`Invalid secret key length: ${secretKey.length} bytes. Expected 32 or 64 bytes.`);
            }

            console.log(`💳 Arena wallet: ${arenaWallet.publicKey.toBase58().slice(0, 12)}...`);
        } catch (error) {
            console.error(`❌ Failed to load arena wallet: ${error.message}`);
            console.error('   Set ARENA_WALLET_SECRET in your .env file');
            return null;
        }

        // Pre-flight balance check
        try {
            const connection = new Connection(config.solanaRpcUrl, "confirmed");
            const balance = await connection.getBalance(arenaWallet.publicKey);
            const balanceSOL = balance / 1e9;
            console.log(`💰 Arena balance: ${balanceSOL.toFixed(4)} SOL`);

            if (balanceSOL < config.safetyLimits.minArenaBalanceSOL) {
                console.error(`❌ Arena balance too low. Minimum: ${config.safetyLimits.minArenaBalanceSOL} SOL`);
                return null;
            }
        } catch (error) {
            console.error(`⚠️ Could not check arena balance: ${error.message}`);
        }

        // STEP 1: Create round snapshot
        console.log(`\n📸 STEP 1: Creating round snapshot...`);
        const snapshot = await createRoundSnapshot();
        console.log(`   Round ID: ${snapshot.roundId}`);
        console.log(`   Slot: ${snapshot.slot}`);
        console.log(`   Tokens: ${snapshot.tokenCount}`);

        if (snapshot.tokenCount === 0) {
            console.log('\n⚠️ No tokens registered. Use CLI to register tokens first.');
            console.log('   Example: node cli.js register <token_mint> <creator_wallet>');
            return null;
        }

        // STEP 2: Claim fees
        console.log(`\n💰 STEP 2: Claiming creator fees...`);
        const totalFees = await claimAllFees(snapshot.roundId, arenaWallet.publicKey);

        // STEP 3: Calculate scores and rank
        console.log(`\n📊 STEP 3: Calculating scores...`);
        const ranked = await rankTokens(snapshot.roundId);

        // Display leaderboard
        const leaderboard = getLeaderboard(snapshot.roundId, config.topN);
        announceLeaderboard(ranked.slice(0, config.topN));

        // STEP 4: Execute payouts
        console.log(`\n💸 STEP 4: Executing payouts...`);
        const topTokens = store.getTopTokens(snapshot.roundId, config.topN);
        const payoutResult = await executePayouts(snapshot.roundId, topTokens, { dryRun: DRY_RUN });

        // STEP 5: Update Hall of Fame
        if (!DRY_RUN) {
            console.log(`\n🏆 STEP 5: Updating Hall of Fame...`);
            for (const token of ranked.slice(0, 3)) {
                store.updateHallOfFame(
                    token.token_mint,
                    token.rank,
                    token.claimed_fees || 0,
                    token.score || 0,
                    snapshot.roundId
                );
            }
        }

        // STEP 6: Generate accounting report
        const accounting = generateRoundAccounting(snapshot.roundId);

        // STEP 7: Announce completion
        await announceRoundComplete(snapshot.roundId, ranked.slice(0, config.topN));

        // Show Hall of Fame
        console.log(formatHallOfFame(5));

        console.log(`\n${'═'.repeat(60)}`);
        console.log(`🎉 ROUND ${snapshot.roundId} COMPLETE!`);
        console.log(`${'═'.repeat(60)}\n`);

        return {
            roundId: snapshot.roundId,
            tokenCount: snapshot.tokenCount,
            totalFees,
            payouts: payoutResult
        };

    } catch (error) {
        console.error(`\n❌ ROUND FAILED: ${error.message}`);
        console.error(error.stack);
        return null;
    } finally {
        isRoundRunning = false;
    }
}

/**
 * Main entry point
 */
async function main() {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    🏆 PUMPLEAGUE 🏆                       ║
║         Automated Token Competition Protocol              ║
╚═══════════════════════════════════════════════════════════╝
  `);

    // Initialize database
    console.log('📦 Initializing database...');
    await store.init();

    // Start Autonomous Agent
    if (config.ai.enabled) {
        await agent.start();
    }

    // Show configuration
    console.log('\n⚙️ Configuration:');
    console.log(`   RPC: ${config.solanaRpcUrl}`);
    console.log(`   Round Duration: ${config.roundDurationHours} hours`);
    console.log(`   Top N Winners: ${config.topN}`);
    console.log(`   Fee Distribution: ${config.feeDistribution.toHolders * 100}% holders / ${config.feeDistribution.toArena * 100}% arena / ${config.feeDistribution.toPrizePool * 100}% prize pool`);

    // Check for registered tokens
    const tokens = store.getActiveTokens();
    console.log(`\n📋 Registered Tokens: ${tokens.length}`);
    if (tokens.length > 0) {
        tokens.slice(0, 5).forEach(t => {
            console.log(`   • ${t.token_mint.slice(0, 12)}... (${t.symbol || 'unnamed'})`);
        });
        if (tokens.length > 5) console.log(`   ... and ${tokens.length - 5} more`);
    }

    // Check for and resume incomplete rounds (crash recovery)
    let arenaWallet = null;
    try {
        const secretKey = config.arenaWallet.secretKey;
        if (secretKey && secretKey.length > 0) {
            if (secretKey.length === 64) {
                try {
                    arenaWallet = Keypair.fromSecretKey(secretKey);
                } catch (e) {
                    arenaWallet = Keypair.fromSeed(secretKey.slice(0, 32));
                }
            } else if (secretKey.length === 32) {
                arenaWallet = Keypair.fromSeed(secretKey);
            } else {
                throw new Error(`Invalid secret key length: ${secretKey.length} bytes`);
            }
            await resumeIncompleteRounds(arenaWallet);
        }
    } catch (error) {
        console.error(`⚠️ Could not check for incomplete rounds: ${error.message}`);
    }

    // Run round
    if (SINGLE_ROUND) {
        console.log('\n🔄 Running single round...');
        await runRound();
    } else {
        // Run immediately, then schedule
        await runRound();

        // Schedule recurring rounds
        const intervalMs = config.roundDurationHours * 60 * 60 * 1000;
        console.log(`\n⏰ Next round scheduled in ${config.roundDurationHours} hours`);
        setInterval(runRound, intervalMs);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n👋 Shutting down PumpLeague...');
    process.exit(0);
});

// Run
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});

module.exports = {
    runRound,
    resumeIncompleteRounds
};
