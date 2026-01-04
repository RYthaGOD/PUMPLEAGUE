const { Keypair, Connection, Transaction, SystemProgram, sendAndConfirmTransaction, PublicKey } = require("@solana/web3.js");
const config = require("../config");
const store = require("../db/store");
const { canPayHolder, recordPayout, getUnpaidHolders } = require("../safety/idempotency");
const { checkSafetyGuards, validatePayoutAmount, SafetyError } = require("../safety/guards");

const connection = new Connection(config.solanaRpcUrl, "confirmed");

/**
 * Execute payouts for top tokens in a round
 * Includes idempotency, safety guards, and dry-run mode
 */
async function executePayouts(roundId, topTokens, options = { dryRun: false }) {
    // Get arena wallet
    let arenaWallet;
    try {
        const secretKey = config.arenaWallet.secretKey;
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
    } catch (error) {
        throw new Error(`Failed to load arena wallet: ${error.message}. Check ARENA_WALLET_SECRET in .env`);
    }

    const roundState = {
        totalPaid: store.getTotalPaidForRound(roundId),
        txCount: store.getPayoutsForRound(roundId).length,
        payouts: []
    };

    console.log(`\n💸 Executing payouts for round ${roundId}...`);
    console.log(`   Mode: ${options.dryRun ? '🧪 DRY RUN' : '💰 LIVE'}`);
    console.log(`   Already paid: ${roundState.totalPaid.toFixed(4)} SOL (${roundState.txCount} tx)`);

    store.updateRoundStatus(roundId, 'paying');

    for (const token of topTokens) {
        if (!token.is_active) {
            console.log(`\n  ⏭ Skipping Passive token: ${token.token_mint.slice(0, 8)}... (No fees contributed)`);
            continue;
        }
        console.log(`\n  📦 Token: ${token.token_mint.slice(0, 8)}...`);

        // Get unpaid holders (idempotency)
        const holders = getUnpaidHolders(roundId, token.token_mint);

        if (holders.length === 0) {
            console.log(`     ⏭ All holders already paid`);
            continue;
        }

        const totalBalance = holders.reduce((acc, h) => acc + h.balance, 0);

        if (totalBalance === 0) {
            console.log(`     ⏭ No balance to distribute`);
            continue;
        }

        // Calculate holder payouts (85% to holders per config)
        const holderPool = token.claimed_fees * config.feeDistribution.toHolders;

        for (const holder of holders) {
            // Check idempotency
            if (!canPayHolder(roundId, holder.holder_address)) {
                console.log(`     ⏭ ${holder.holder_address.slice(0, 8)}... already paid`);
                continue;
            }

            const share = holder.balance / totalBalance;
            const payoutSOL = holderPool * share;
            const lamports = Math.floor(payoutSOL * 1e9);

            // Skip dust payments
            if (!validatePayoutAmount(lamports)) {
                continue;
            }

            try {
                // Check safety guards
                await checkSafetyGuards(roundState, payoutSOL, arenaWallet.publicKey);

                if (options.dryRun) {
                    console.log(`     [DRY RUN] Would pay ${payoutSOL.toFixed(6)} SOL to ${holder.holder_address.slice(0, 8)}...`);
                    roundState.payouts.push({
                        holder: holder.holder_address,
                        amount: payoutSOL,
                        tx: 'DRY_RUN'
                    });
                } else {
                    // Execute actual transaction
                    const sig = await sendPayout(arenaWallet, holder.holder_address, lamports);

                    // Record for idempotency
                    recordPayout(roundId, token.token_mint, holder.holder_address, payoutSOL, sig);

                    console.log(`     ✓ Paid ${payoutSOL.toFixed(6)} SOL to ${holder.holder_address.slice(0, 8)}... | Tx: ${sig.slice(0, 16)}...`);

                    roundState.payouts.push({
                        holder: holder.holder_address,
                        amount: payoutSOL,
                        tx: sig
                    });
                }

                roundState.totalPaid += payoutSOL;
                roundState.txCount++;

                // Rate limit between transactions
                if (!options.dryRun) {
                    await sleep(500);
                }

            } catch (error) {
                if (error instanceof SafetyError) {
                    console.error(`     ⚠️ Safety guard triggered: ${error.message}`);
                    if (error.code === 'EMERGENCY_STOP' || error.code === 'BALANCE_FLOOR') {
                        // Critical - stop all payouts
                        throw error;
                    }
                    // Non-critical - skip this payout and continue
                    continue;
                }
                console.error(`     ✗ Payout failed: ${error.message}`);
            }
        }
    }

    if (!options.dryRun) {
        // Calculate arena fee
        const totalFees = topTokens.reduce((acc, t) => acc + t.claimed_fees, 0);
        const arenaFee = totalFees * config.feeDistribution.toArena;

        store.completeRound(roundId, totalFees, roundState.totalPaid, arenaFee);
    }

    console.log(`\n✅ Payout execution complete`);
    console.log(`   Total paid: ${roundState.totalPaid.toFixed(4)} SOL`);
    console.log(`   Transactions: ${roundState.txCount}`);

    return roundState;
}

/**
 * Send a payout transaction with proper blockhash management and verification
 */
async function sendPayout(arenaWallet, recipientAddress, lamports) {
    // Get fresh blockhash with expiry info
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

    const tx = new Transaction().add(
        SystemProgram.transfer({
            fromPubkey: arenaWallet.publicKey,
            toPubkey: new PublicKey(recipientAddress),
            lamports: lamports
        })
    );

    tx.recentBlockhash = blockhash;
    tx.feePayer = arenaWallet.publicKey;

    // Sign the transaction
    tx.sign(arenaWallet);

    // Simulate first to catch errors before sending
    const simulation = await connection.simulateTransaction(tx);
    if (simulation.value.err) {
        throw new Error(`Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`);
    }

    // Send raw transaction
    const rawTransaction = tx.serialize();
    const sig = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 5
    });

    // Confirm with blockhash expiry check
    const confirmation = await connection.confirmTransaction({
        signature: sig,
        blockhash: blockhash,
        lastValidBlockHeight: lastValidBlockHeight
    }, 'confirmed');

    if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    // Verify transaction actually landed by fetching it
    const txResult = await connection.getTransaction(sig, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
    });

    if (!txResult) {
        throw new Error(`Transaction ${sig} not found after confirmation`);
    }

    if (txResult.meta?.err) {
        throw new Error(`Transaction failed on-chain: ${JSON.stringify(txResult.meta.err)}`);
    }

    return sig;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    executePayouts,
    sendPayout
};
