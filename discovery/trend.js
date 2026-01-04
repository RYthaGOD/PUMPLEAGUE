/**
 * Token Discovery Module
 * 
 * Automatically finds and registers trending tokens on Pump.fun/Solana.
 */

const dexscreener = require('../external/dexscreener');
const pumpportal = require('../external/pumpportal');
const store = require('../db/store');
const config = require('../config');
const gemini = require('../ai/gemini');
const memory = require('../ai/memory');

class TokenDiscovery {
    /**
     * Discover and auto-register trending tokens
     */
    async discoverTrending() {
        // 0. Check daily limit
        const today = new Date().toISOString().split('T')[0];
        const dailyCountKey = `registrations_${today}`;
        const dailyCount = memory.get(dailyCountKey) || 0;
        const MAX_DAILY = 20;

        if (dailyCount >= MAX_DAILY) {
            console.log(`[Discovery] Daily registration limit reached (${MAX_DAILY}). Skipping.`);
            return;
        }

        console.log(`🔍 Scanning for trending tokens... (Today: ${dailyCount}/${MAX_DAILY})`);

        try {
            // Fix #48: Expanded discovery - search multiple sources
            const dexscreenerApi = require('../external/api');

            // Search multiple categories
            const searchTerms = ['pump.fun', 'solana meme', 'sol'];
            let allPairs = [];

            for (const term of searchTerms) {
                try {
                    const pairs = await dexscreenerApi.searchTokenPairs(term);
                    allPairs = allPairs.concat(pairs);
                } catch (e) {
                    console.log(`   ⚠️ Search for "${term}" failed: ${e.message}`);
                }
            }

            // Remove duplicates by pair address
            const seenPairs = new Set();
            allPairs = allPairs.filter(p => {
                if (seenPairs.has(p.pairAddress)) return false;
                seenPairs.add(p.pairAddress);
                return true;
            });

            // 2. Filter for promising candidates
            const candidates = allPairs.filter(p => {
                const liq = parseFloat(p.liquidity?.usd || 0);
                const vol = parseFloat(p.volume?.h24 || 0);
                const age = p.pairCreatedAt ? (Date.now() - p.pairCreatedAt) / (1000 * 60 * 60 * 24) : 999;
                // Prefer newer tokens with good volume but not too new (>1 day old)
                return liq > 2000 && vol > 5000 && age > 1 && age < 30;
            }).slice(0, 5);

            console.log(`   Found ${candidates.length} candidates after basic filtering.`);

            for (const candidate of candidates) {
                const mint = candidate.baseToken?.address;
                if (!mint) continue;

                // Check if already registered
                const active = store.getActiveTokens();
                if (active.some(t => t.token_mint === mint)) continue;

                // 3. AI Evaluation
                console.log(`   🤖 Gemini Evaluating ${candidate.baseToken.symbol} (${mint.slice(0, 8)})...`);
                const qualityScore = await this.evaluateQuality(candidate);

                if (qualityScore >= 7) {
                    console.log(`   ✅ Auto-registering ${candidate.baseToken.symbol} (Score: ${qualityScore})`);

                    // Fetch full metadata if available
                    let name = candidate.baseToken.name;
                    let symbol = candidate.baseToken.symbol;

                    if (!name || symbol === 'Unknown') {
                        const meta = await pumpportal.getTokenMetadata(mint);
                        if (meta) {
                            name = meta.name || name;
                            symbol = meta.symbol || symbol;
                        }
                    }

                    // Fix #17: Mark auto-discovered tokens properly
                    store.registerToken(
                        mint,
                        null, // No verified creator for auto-discovered tokens
                        name,
                        symbol
                    );

                    memory.recordEvent('token_auto_registered', {
                        mint,
                        symbol: symbol,
                        score: qualityScore
                    });

                    // Update daily counter
                    memory.set(dailyCountKey, (memory.get(dailyCountKey) || 0) + 1);
                }
            }
        } catch (error) {
            console.error(`[Discovery] Error: ${error.message}`);
        }
    }

    /**
     * Use AI to evaluate if a token is worth registering
     */
    async evaluateQuality(pair) {
        const prompt = `Evaluate if this Solana token is a high-quality candidate for a trading competition.
            Token: ${pair.baseToken.name} (${pair.baseToken.symbol})
            Liquidity: $${pair.liquidity?.usd}
            Volume 24h: $${pair.volume?.h24}
            FDV: $${pair.fdv}
            
            Return ONLY a number from 1 to 10, where 10 is extremely high quality and 1 is a likely rug/low effort.
            Quality means: High engagement, decent liquidity, realistic name/symbol.`;

        const response = await gemini.chat([{ role: "user", content: prompt }]);
        const score = parseInt(response?.trim().match(/\d+/)?.[0]);
        return isNaN(score) ? 0 : score;
    }
}

const discovery = new TokenDiscovery();

module.exports = discovery;
