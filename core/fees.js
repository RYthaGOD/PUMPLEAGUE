const { Connection } = require("@solana/web3.js");
const config = require("../config");
const store = require("../db/store");

const connection = new Connection(config.solanaRpcUrl, "confirmed");

/**
 * Claim creator fees for a SPECIFIC token via PumpPortal
 * Returns the actual SOL delta received
 */
async function claimTokenFee(mint, arenaWalletPubkey) {
    const preBalance = await connection.getBalance(arenaWalletPubkey);

    let apiResponse = null;
    try {
        const { claimCreatorFee } = require("../external/api");
        apiResponse = await claimCreatorFee("pump", mint);
    } catch (error) {
        console.error(`  [${mint.slice(0, 8)}] Claim error: ${error.message}`);
    }

    // Wait slightly for tx to settle
    await sleep(2000);

    const postBalance = await connection.getBalance(arenaWalletPubkey);
    const deltaSOL = Math.max(0, (postBalance - preBalance) / 1e9);

    return {
        delta: deltaSOL,
        success: !!apiResponse?.signature,
        apiResponse
    };
}

/**
 * Distribute claimed fees proportionally based on 24h volume
 * Tokens with higher volume get proportionally more of the claimed fees
 */
function distributeFeesByVolume(tokens, totalFees) {
    // Calculate total volume across all tokens
    const totalVolume = tokens.reduce((acc, t) => acc + (t.volume_24h || 0), 0);

    if (totalVolume === 0) {
        // Fallback: equal distribution if no volume data
        console.log(`  ⚠️ No volume data, distributing equally`);
        const equalShare = totalFees / tokens.length;
        return tokens.map(t => ({
            token_mint: t.token_mint,
            share: 1 / tokens.length,
            claimedFees: equalShare
        }));
    }

    // Distribute proportionally by volume
    return tokens.map(t => {
        const volume = t.volume_24h || 0;
        const share = volume / totalVolume;
        const claimedFees = totalFees * share;
        return {
            token_mint: t.token_mint,
            share,
            claimedFees,
            volume
        };
    });
}

/**
 * Claim fees for all tokens in a round individually
 */
async function claimAllFees(roundId, arenaWalletPubkey) {
    const tokens = store.getRoundTokens(roundId);

    if (tokens.length === 0) {
        console.log(`\n⚠️ No tokens in round ${roundId}`);
        return 0;
    }

    console.log(`\n💰 Processing fees for ${tokens.length} tokens in round ${roundId}...`);
    store.updateRoundStatus(roundId, 'claiming');

    let totalClaimed = 0;

    for (const token of tokens) {
        const mint = token.token_mint;
        console.log(`  Checking ${token.symbol || mint.slice(0, 8)}...`);

        // Check balance before/after for this specific token
        const preBalance = await connection.getBalance(arenaWalletPubkey);
        const result = await claimTokenFee(mint, arenaWalletPubkey);
        const postBalance = await connection.getBalance(arenaWalletPubkey);

        const delta = result.delta;
        const isActive = delta > 0 ? 1 : 0;

        store.updateTokenFees(
            roundId,
            mint,
            preBalance / 1e9,
            postBalance / 1e9,
            delta,
            isActive
        );

        if (delta > 0) {
            console.log(`    ✅ Claimed ${delta.toFixed(4)} SOL`);
            totalClaimed += delta;
        } else {
            console.log(`    ℹ️ No fees claimed (Passive Mode)`);
        }
    }

    store.updateRoundStatus(roundId, 'fees_claimed');
    console.log(`\n✓ Total fees claimed this round: ${totalClaimed.toFixed(4)} SOL`);

    return totalClaimed;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    claimTokenFee,
    distributeFeesByVolume,
    claimAllFees
};
