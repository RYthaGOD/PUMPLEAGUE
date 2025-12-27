/**
 * External API Module
 * Integrates with PumpPortal, DexScreener, and other data sources
 */

const axios = require("axios");
const config = require("../config");

// ============ RETRY UTILITIES ============

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Base delay in ms (doubles each retry)
 */
async function withRetry(fn, maxRetries = 3, baseDelay = 1000) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            // Don't retry on 4xx errors (client errors)
            if (error.response?.status >= 400 && error.response?.status < 500) {
                throw error;
            }

            if (attempt < maxRetries) {
                const delay = baseDelay * Math.pow(2, attempt - 1);
                console.log(`  ⚠️ API attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms...`);
                await sleep(delay);
            }
        }
    }
    throw lastError;
}

// ============ PUMPPORTAL API ============

const PUMPPORTAL_BASE = "https://pumpportal.fun/api";

/**
 * Claim creator fees via PumpPortal Lightning API
 * 
 * @param {string} pool - "pump" or "meteora-dbc"
 * @param {string|null} mint - Token mint (required for meteora-dbc, optional for pump)
 * @returns {Promise<{signature: string|null, error: string|null}>}
 * 
 * Note: pump.fun claims all creator fees at once, so mint is optional
 * For meteora-dbc, mint is required
 */
async function claimCreatorFee(pool = "pump", mint = null) {
    return withRetry(async () => {
        const payload = {
            action: "collectCreatorFee",
            priorityFee: 0.000001,
            pool: pool
        };

        // Only include mint if specified (required for meteora-dbc)
        if (mint) {
            payload.mint = mint;
        }

        const response = await axios.post(
            `${PUMPPORTAL_BASE}/trade?api-key=${config.pumpPortalApiKey}`,
            payload,
            {
                headers: {
                    "Content-Type": "application/json"
                },
                timeout: 30000
            }
        );

        // Response contains tx signature or error
        if (response.data.signature) {
            return { signature: response.data.signature, error: null };
        } else if (response.data.error) {
            return { signature: null, error: response.data.error };
        }

        return { signature: response.data, error: null };
    }, 3, 2000).catch(error => {
        const errorMsg = error.response?.data?.error || error.response?.data || error.message;
        console.error(`PumpPortal API error: ${errorMsg}`);
        return { signature: null, error: errorMsg };
    });
}

// ============ DEXSCREENER API ============

const DEXSCREENER_BASE = "https://api.dexscreener.com";

/**
 * Get token market data from DexScreener
 * Rate limit: 300 requests per minute
 * 
 * @param {string} tokenAddress - Token mint address
 * @returns {Promise<{
 *   priceUsd: number,
 *   priceNative: number,
 *   volume24h: number,
 *   priceChange24h: number,
 *   liquidity: number,
 *   fdv: number,
 *   marketCap: number
 * }|null>}
 */
async function getTokenMarketData(tokenAddress) {
    return withRetry(async () => {
        const response = await axios.get(
            `${DEXSCREENER_BASE}/tokens/v1/solana/${tokenAddress}`,
            { timeout: 10000 }
        );

        // Response contains array of pairs for this token
        const pairs = response.data;

        if (!pairs || pairs.length === 0) {
            return null;
        }

        // Get the pair with highest liquidity (usually the main pool)
        const mainPair = pairs.reduce((best, pair) => {
            const liq = parseFloat(pair.liquidity?.usd || 0);
            const bestLiq = parseFloat(best.liquidity?.usd || 0);
            return liq > bestLiq ? pair : best;
        }, pairs[0]);

        return {
            priceUsd: parseFloat(mainPair.priceUsd || 0),
            priceNative: parseFloat(mainPair.priceNative || 0),
            volume24h: parseFloat(mainPair.volume?.h24 || 0),
            priceChange24h: parseFloat(mainPair.priceChange?.h24 || 0),
            liquidity: parseFloat(mainPair.liquidity?.usd || 0),
            fdv: parseFloat(mainPair.fdv || 0),
            marketCap: parseFloat(mainPair.marketCap || 0),
            pairAddress: mainPair.pairAddress,
            dexId: mainPair.dexId,
            txns24h: {
                buys: mainPair.txns?.h24?.buys || 0,
                sells: mainPair.txns?.h24?.sells || 0
            }
        };
    }, 3, 1000).catch(error => {
        console.error(`DexScreener API error for ${tokenAddress}: ${error.message}`);
        return null;
    });
}

/**
 * Get market data for multiple tokens (batch)
 * Up to 30 addresses per request
 * 
 * @param {string[]} tokenAddresses - Array of token mint addresses
 * @returns {Promise<Map<string, object>>}
 */
async function getMultipleTokensMarketData(tokenAddresses) {
    const results = new Map();

    // DexScreener allows up to 30 addresses per request
    const BATCH_SIZE = 30;

    for (let i = 0; i < tokenAddresses.length; i += BATCH_SIZE) {
        const batch = tokenAddresses.slice(i, i + BATCH_SIZE);
        const addressList = batch.join(",");

        try {
            const response = await withRetry(async () => {
                return await axios.get(
                    `${DEXSCREENER_BASE}/tokens/v1/solana/${addressList}`,
                    { timeout: 15000 }
                );
            }, 3, 1000);

            // Group pairs by token address
            for (const pair of response.data || []) {
                const addr = pair.baseToken?.address;
                if (addr && !results.has(addr)) {
                    results.set(addr, {
                        priceUsd: parseFloat(pair.priceUsd || 0),
                        priceNative: parseFloat(pair.priceNative || 0),
                        volume24h: parseFloat(pair.volume?.h24 || 0),
                        priceChange24h: parseFloat(pair.priceChange?.h24 || 0),
                        liquidity: parseFloat(pair.liquidity?.usd || 0),
                        fdv: parseFloat(pair.fdv || 0),
                        marketCap: parseFloat(pair.marketCap || 0)
                    });
                }
            }

            // Rate limit: wait 200ms between batch requests
            if (i + BATCH_SIZE < tokenAddresses.length) {
                await sleep(200);
            }
        } catch (error) {
            console.error(`DexScreener batch error: ${error.message}`);
        }
    }

    return results;
}

/**
 * Search for token pairs on DexScreener
 * 
 * @param {string} query - Search query (token name, symbol, or address)
 * @returns {Promise<array>}
 */
async function searchTokenPairs(query) {
    return withRetry(async () => {
        const response = await axios.get(
            `${DEXSCREENER_BASE}/latest/dex/search?q=${encodeURIComponent(query)}`,
            { timeout: 10000 }
        );

        return response.data.pairs || [];
    }, 3, 1000).catch(error => {
        console.error(`DexScreener search error: ${error.message}`);
        return [];
    });
}

// ============ UTILITY ============

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    // Utilities
    withRetry,

    // PumpPortal
    claimCreatorFee,

    // DexScreener
    getTokenMarketData,
    getMultipleTokensMarketData,
    searchTokenPairs
};
