/**
 * Gemini AI Client
 * 
 * Powered by Google Generative AI (Gemini).
 * This is the new "brain" of the PumpLeague autonomous agent.
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require("../config");
const rateLimiter = require("../utils/rate-limiter");

// System Persoanlity
const SYSTEM_PROMPT = `You are the PumpLeague Agent, an autonomous AI entity that runs the PumpLeague protocol on Solana.
PumpLeague is a token competition where tokens claim fees and distribute rewards to holders.

Your personality is:
- Professional yet degenerate-friendly (uses some crypto slang like "LFG", "bullish", "rug-protected")
- Highly analytical and data-driven
- Transparent and provable (always mentions on-chain data)
- Competitive and engaging

Your goals are:
1. Maximize protocol transparency
2. Engage the community with insightful market commentary
3. Detect and publicly call out fraud
4. Manage the protocol autonomously`;

class GeminiClient {
    constructor() {
        // Use either explicit GEMINI_API_KEY or fallback to DEEPSEEK_API_KEY if the user just swapped it
        const apiKey = process.env.GEMINI_API_KEY || config.ai.apiKey;

        if (!config.ai.enabled || !apiKey) {
            this.enabled = false;
            return;
        }

        this.enabled = true;
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({
            model: config.ai.model || "gemini-1.5-flash",
            systemInstruction: SYSTEM_PROMPT
        });
    }

    /**
     * Generate a chat completion with retry logic
     */
    async chat(messages, options = {}) {
        if (!this.enabled) {
            console.warn("[AI] Gemini is disabled. Check config and API key.");
            return null;
        }

        const { withRetry } = require('../external/api');

        try {
            // Rate limit AI requests
            return await rateLimiter.execute('gemini', async () => {
                return await withRetry(async () => {
                    // Convert message format to Gemini (Google) format
                    // Note: systemInstruction is handled in constructor for modern Gemini models
                    const userMessage = messages.find(m => m.role === 'user')?.content || "";

                    const result = await this.model.generateContent(userMessage);
                    const response = await result.response;
                    return response.text();
                }, 3, 2000);
            });
        } catch (error) {
            // Handle quota errors gracefully
            if (error.message && error.message.includes('429')) {
                console.warn(`[AI] Quota exceeded, will retry later`);
            } else {
                console.error(`[AI] Gemini Error after retries: ${error.message}`);
            }
            return null;
        }
    }

    /**
     * Generate a tweet about a round
     */
    async generateRoundTweet(roundData, leaderboard) {
        const prompt = `Generate an engaging tweet about the completion of PumpLeague Round ${roundData.round_id}.
            Leaderboard:
            ${leaderboard.map(t => `${t.rank || '#'}. ${(t.token_mint || t.tokenMint || '').slice(0, 8)} - Score: ${t.score}, Fees: ${t.claimedFees || t.claimed_fees || 0} SOL`).join('\n')}
            
            Total Paid Out: ${roundData.total_paid_out || 0} SOL
            
            Focus on the winners and the protocol's transparency. Keep it under 280 chars.`;

        return this.chat([{ role: "user", content: prompt }]);
    }

    /**
     * Analyze a token for potential fraud
     */
    async analyzeTokenFraud(tokenData, holders, existingFlags) {
        const prompt = `Analyze this token for suspicious activity.
            Token: ${tokenData.token_mint}
            Symbol: ${tokenData.symbol}
            Volume 24h: $${tokenData.volume_24h}
            Liquidity: $${tokenData.liquidity}
            Holders indexed: ${holders.length}
            Existing fraud flags: ${existingFlags.join(', ') || 'None'}
            
            Top holder concentration: ${holders.slice(0, 3).reduce((acc, h) => acc + h.balance, 0) / (tokenData.total_supply || 1) * 100}% in top 3 wallets.
            
            Return a brief AI assessment of the risk level (LOW/MEDIUM/HIGH) and a one-sentence rationale.`;

        return this.chat([{ role: "user", content: prompt }]);
    }

    /**
     * Generate market commentary
     */
    async generateMarketCommentary(topTokens) {
        const prompt = `Analyze the current PumpLeague leaders and provide a brief market commentary.
            Top Tokens: ${topTokens.map(t => (t.token_mint || '').slice(0, 8)).join(', ')}
            
            What's trending? Is it a meme-driven round or utility-driven? Use a professional crypto-analyst tone.`;

        return this.chat([{ role: "user", content: prompt }]);
    }
}

// Singleton instance
const gemini = new GeminiClient();

module.exports = gemini;
