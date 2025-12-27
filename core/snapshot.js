const { Connection, PublicKey } = require("@solana/web3.js");
const config = require("../config");
const store = require("../db/store");

const connection = new Connection(config.solanaRpcUrl, "confirmed");

/**
 * Create a round snapshot at the current slot
 * This freezes the competition state for this round
 */
async function createRoundSnapshot() {
    const roundId = store.generateRoundId();

    // Get current slot for snapshot reference
    const slot = await connection.getSlot();
    const timestamp = Date.now();

    console.log(`📸 Creating snapshot for round ${roundId} at slot ${slot}`);

    // Create round record
    store.createRound(roundId, slot, timestamp);

    // Get all registered tokens
    const tokens = store.getActiveTokens();

    if (tokens.length === 0) {
        console.warn("⚠️ No registered tokens found. Register tokens before running a round.");
        return { roundId, slot, timestamp, tokenCount: 0 };
    }


    console.log(`📊 Snapshotting ${tokens.length} registered tokens...`);

    // Fetch market data for all tokens from DexScreener
    const dexscreener = require("../external/dexscreener");
    const tokenAddresses = tokens.map(t => t.token_mint);
    const marketDataMap = await dexscreener.getMultipleTokensData(tokenAddresses);
    console.log(`📈 Fetched market data for ${marketDataMap.size} tokens from DexScreener`);

    // For each token, snapshot holders
    for (const token of tokens) {
        try {
            const { indexAllHolders } = require("./indexer");
            const holders = await indexAllHolders(token.token_mint);

            const totalSupply = holders.reduce((acc, h) => acc + h.balance, 0);

            // Get market data from DexScreener (or defaults)
            const marketData = marketDataMap.get(token.token_mint) || {
                volume24h: 0,
                priceChange24h: 0,
                liquidity: totalSupply
            };

            // Save token snapshot with real market data
            store.saveTokenSnapshot(
                roundId,
                token.token_mint,
                holders.length,
                totalSupply,
                marketData.liquidity || totalSupply,
                marketData.volume24h || 0,
                marketData.priceChange24h || 0
            );

            // Save all holders
            store.saveHoldersBatch(roundId, token.token_mint, holders);

            console.log(`  ✓ ${token.token_mint.slice(0, 8)}... - ${holders.length} holders | Vol: $${(marketData.volume24h || 0).toFixed(0)}`);
        } catch (error) {
            console.error(`  ✗ ${token.token_mint.slice(0, 8)}... - ${error.message}`);
        }
    }

    store.updateRoundStatus(roundId, 'snapshot_complete');

    return { roundId, slot, timestamp, tokenCount: tokens.length };
}

/**
 * Get snapshot data for a specific round
 */
function getRoundSnapshot(roundId) {
    const round = store.getRound(roundId);
    if (!round) return null;

    const tokens = store.getRoundTokens(roundId);
    const tokensWithHolders = tokens.map(t => ({
        ...t,
        holders: store.getHoldersForToken(roundId, t.token_mint)
    }));

    return {
        round,
        tokens: tokensWithHolders
    };
}

module.exports = {
    createRoundSnapshot,
    getRoundSnapshot
};
