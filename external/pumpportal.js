/**
 * PumpPortal Data Client
 * 
 * Used to fetch metadata for tokens specifically on pump.fun
 */

const { withRetry } = require('./api');
const cache = require('../utils/cache');
const rateLimiter = require('../utils/rate-limiter');

/**
 * Fetch token metadata from PumpPortal
 * @param {string} mint - Token mint address
 */
async function getTokenMetadata(mint) {
    // Check cache first (metadata rarely changes)
    const cached = cache.get('metadata', mint);
    if (cached) return cached;

    const url = `https://pumpportal.fun/api/data/token-info?mint=${mint}`;

    try {
        const metadata = await rateLimiter.execute('pumpportal', async () => {
            return await withRetry(async () => {
                const response = await fetch(url);
                if (!response.ok) {
                    // If not found, it might be on another platform or not indexed yet
                    if (response.status === 404) return null;
                    throw new Error(`PumpPortal API returned ${response.status}`);
                }

                const data = await response.json();

                // Format to match our internal expectation
                return {
                    mint: data.mint,
                    name: data.name,
                    symbol: data.symbol,
                    description: data.description,
                    image: data.image,
                    twitter: data.twitter,
                    telegram: data.telegram,
                    website: data.website
                };
            }, 3, 1000);
        });

        // Cache for 1 hour
        if (metadata) {
            cache.set('metadata', mint, metadata);
        }

        return metadata;
    } catch (error) {
        // Silent fail for 404/not found as this is often a fallback
        return null;
    }
}

module.exports = {
    getTokenMetadata
};
