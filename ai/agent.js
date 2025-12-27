/**
 * PumpLeague Autonomous Agent
 * 
 * The main decision-making engine that runs 24/7.
 */

const deepseek = require('./gemini');
const memory = require('./memory');
const config = require('../config');
const store = require('../db/store');
const { postTweet } = require('../social/twitter');
const discovery = require('../discovery/trend');

class PumpLeagueAgent {
    constructor() {
        this.mode = config.ai.autopilotMode || 'SEMI_AUTO';
        this.name = "PumpLeague Commissioner";
        this.isEvaluating = false;
    }

    /**
     * Log with timestamp
     */
    log(msg) {
        const time = new Date().toISOString();
        console.log(`[Agent ${time}] ${msg}`);
    }

    /**
     * Start the agent
     */
    async start() {
        this.log(`🤖 Starting PumpLeague Agent (Mode: ${this.mode})...`);
        memory.init();

        // Register initial start event
        memory.recordEvent('agent_startup', { mode: this.mode });

        this.runDecisionLoop();
    }

    /**
     * Main decision loop (runs periodically)
     */
    async runDecisionLoop() {
        // Every 30 minutes, check if there's anything to do
        setInterval(async () => {
            if (this.isEvaluating) {
                this.log("⚠️ Evaluation already in progress, skipping this cycle.");
                return;
            }

            try {
                this.isEvaluating = true;
                await this.evaluateState();
            } catch (error) {
                this.log(`❌ Loop error: ${error.message}`);
            } finally {
                this.isEvaluating = false;
            }
        }, 30 * 60 * 1000);

        // Run immediately on start
        try {
            this.isEvaluating = true;
            await this.evaluateState();
        } finally {
            this.isEvaluating = false;
        }
    }

    /**
     * Evaluate the protocol state and take actions
     */
    async evaluateState() {
        const latestRound = store.getLatestRound();
        if (!latestRound) return;

        this.log(`Evaluating state for round ${latestRound.round_id} (${latestRound.status})...`);

        // Action 1: Post round commentary if recently completed
        if (latestRound.status === 'completed') {
            const lastTweetedRound = memory.get('last_tweeted_round');
            if (lastTweetedRound !== latestRound.round_id) {
                await this.handleRoundCompletion(latestRound);
            }
        }

        // Action 2: Check for daily summary
        await this.checkDailySummary();

        // Action 3: Smart Discovery
        if (config.ai.enabled) {
            await discovery.discoverTrending();
        }
    }

    /**
     * Handle actions when a round completes
     */
    async handleRoundCompletion(round) {
        this.log(`Handling round completion for ${round.round_id}...`);

        const tokens = store.getRoundTokens(round.round_id);
        const topTokens = tokens.slice(0, 5);
        const passiveHotTokens = tokens.filter(t => !t.is_active && t.volume_24h > 10000).slice(0, 3);

        // 1. Generate AI Commentary for winners
        const commentary = await deepseek.generateRoundTweet(round, topTokens);

        if (commentary) {
            this.log(`AI Commentary: ${commentary}`);

            if (this.mode === 'FULL_AUTO' || this.mode === 'SEMI_AUTO') {
                await postTweet(commentary);
            }
        }

        // 2. Generate target tweets for passive tokens (if any)
        for (const target of passiveHotTokens) {
            const pitchPrompt = `Generate a persuasive tweet to a token creator on Solana.
                Token: ${target.symbol || target.token_mint.slice(0, 8)}
                Volume: $${target.volume_24h.toFixed(0)}
                Issue: They are in 'Monitoring' mode but could be paying their holders in SOL if they join PumpLeague.
                Wallet to set as recipient: ${config.arenaWallet.publicKey}
                Tone: Professional, bullish, and community-focused. Keep it under 240 chars.`;

            const pitch = await deepseek.chat([{ role: "user", content: pitchPrompt }]);
            if (pitch && (this.mode === 'FULL_AUTO')) {
                this.log(`Pitched passive token: ${target.token_mint}`);
                await postTweet(pitch);
            }
        }

        memory.set('last_tweeted_round', round.round_id);
        memory.recordEvent('round_commentary_posted', { roundId: round.round_id });
    }

    /**
     * Generate daily roundup if not done today
     */
    async checkDailySummary() {
        const today = new Date().toISOString().split('T')[0];
        const lastSummaryDate = memory.get('last_daily_summary_date');

        if (lastSummaryDate !== today) {
            this.log(`Generating daily summary for ${today}...`);

            const rounds = store.getRoundHistory(10);
            // Filter to today's completed rounds
            const todayRounds = rounds.filter(r => r.completed_at && r.completed_at.startsWith(today));

            if (todayRounds.length > 0) {
                const totalPaid = todayRounds.reduce((sum, r) => sum + (r.total_paid_out || 0), 0);
                const summaryPrompt = `Generate a daily recap for PumpLeague on ${today}.
                    Total Rounds: ${todayRounds.length}
                    Total Distributed: ${totalPaid.toFixed(2)} SOL
                    
                    Mention that the arena is active and protecting holders.`;

                const summary = await deepseek.chat([{ role: "user", content: summaryPrompt }]);

                if (summary) {
                    await postTweet(summary);
                    memory.set('last_daily_summary_date', today);
                    memory.recordEvent('daily_summary_posted', { date: today, rounds: todayRounds.length });
                }
            }
        }
    }

    /**
     * Adjudicate suspicious activity (called from scoring/fraud module)
     */
    async adjudicateFraud(tokenData, holders, flags) {
        this.log(`Adjudicating fraud for ${tokenData.token_mint}...`);

        const assessment = await deepseek.analyzeTokenFraud(tokenData, holders, flags);
        if (assessment) {
            this.log(`AI Fraud Assessment: ${assessment}`);

            // If HIGH risk, record in memory to watch this token/creator
            if (assessment.includes('HIGH')) {
                memory.flagWallet(tokenData.creator_wallet, "AI_FLAGGED_HIGH_RISK");
                memory.recordEvent('token_flagged_high_risk', { mint: tokenData.token_mint, assessment });
            }

            return assessment;
        }
        return null;
    }
}

// Singleton
const agent = new PumpLeagueAgent();

module.exports = agent;
