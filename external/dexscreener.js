/**
 * DexScreener API Client
 * 
 * Used to fetch real-time market data for Solana tokens.
 */

const { withRetry } = require('./api');
const cache = require('../utils/cache');
const rateLimiter = require('../utils/rate-limiter');

/**
 * Fetch data for multiple tokens (batching)
 * DexScreener allows up to 30 addresses per request.
 * @param {string[]} mints - Array of token mint addresses
 */
async function getMultipleTokensData(mints) {
    if (!mints || mints.length === 0) return new Map();

    const results = new Map();
    const uncachedMints = [];

    // Check cache first
    for (const mint of mints) {
        const cached = cache.get('marketData', mint);
        if (cached) {
            results.set(mint, cached);
        } else {
            uncachedMints.push(mint);
        }
    }

    if (uncachedMints.length === 0) {
        return results; // All from cache
    }

    const BATCH_SIZE = 30;

    for (let i = 0; i < uncachedMints.length; i += BATCH_SIZE) {
        const batch = uncachedMints.slice(i, i + BATCH_SIZE);
        const addressList = batch.join(",");
        const url = `https://api.dexscreener.com/tokens/v1/solana/${addressList}`;

        try {
            // Rate limit and fetch
            const data = await rateLimiter.execute('dexscreener', async () => {
                return await withRetry(async () => {
                    const response = await fetch(url);
                    if (!response.ok) throw new Error(`DexScreener API returned ${response.status}`);
                    return await response.json();
                }, 3, 2000);
            });

            if (Array.isArray(data)) {
                data.forEach(pair => {
                    const mint = pair.baseToken?.address;
                    if (mint && !results.has(mint)) {
                        const tokenData = {
                            priceUsd: parseFloat(pair.priceUsd || 0),
                            volume24h: pair.volume ? pair.volume.h24 : 0,
                            priceChange24h: pair.priceChange ? pair.priceChange.h24 : 0,
                            liquidityUsd: pair.liquidity ? pair.liquidity.usd : 0,
                            fdv: pair.fdv || 0,
                            marketCap: pair.marketCap || 0,
                            pairAddress: pair.pairAddress,
                            url: pair.url
                        };
                        results.set(mint, tokenData);
                        // Cache for 30 seconds
                        cache.set('marketData', mint, tokenData);
                    }
                });
            }
        } catch (error) {
            console.error(`[DexScreener] Batch error: ${error.message}`);
        }
    }

    return results;
}

/**
 * Fetch data for a single token mint
 */
async function getTokenData(mint) {
    const results = await getMultipleTokensData([mint]);
    return results.get(mint) || null;
}

module.exports = {
    getTokenData,
    getMultipleTokensData
};
