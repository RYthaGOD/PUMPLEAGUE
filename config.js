require('dotenv').config();

module.exports = {
    // Solana Network
    solanaRpcUrl: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",

    // Arena Wallet (for payouts)
    arenaWallet: {
        get publicKey() {
            try {
                const { Keypair } = require('@solana/web3.js');
                const secret = this.secretKey;
                if (!secret || secret.length === 0) return process.env.ARENA_WALLET_PUBKEY || "YOUR_ARENA_WALLET_PUBKEY";

                let kp;
                if (secret.length === 64) {
                    try { kp = Keypair.fromSecretKey(secret); }
                    catch (e) { kp = Keypair.fromSeed(secret.slice(0, 32)); }
                } else if (secret.length === 32) {
                    kp = Keypair.fromSeed(secret);
                }
                return kp ? kp.publicKey.toBase58() : (process.env.ARENA_WALLET_PUBKEY || "YOUR_ARENA_WALLET_PUBKEY");
            } catch (e) {
                return process.env.ARENA_WALLET_PUBKEY || "YOUR_ARENA_WALLET_PUBKEY";
            }
        },
        get secretKey() {
            const secret = process.env.ARENA_WALLET_SECRET;
            if (!secret) return new Uint8Array();

            try {
                let decoded;
                // Try JSON array format [1,2,3...]
                if (secret.trim().startsWith('[')) {
                    decoded = Uint8Array.from(JSON.parse(secret));
                } else {
                    // Try Base58 format
                    const bs58 = require('bs58').default;
                    decoded = bs58.decode(secret);
                }
                return decoded;
            } catch (e) {
                console.error("❌ Error parsing ARENA_WALLET_SECRET:", e.message);
                return new Uint8Array();
            }
        }
    },

    // Round Configuration
    roundDurationHours: 24,
    topN: 3,

    // Fee Distribution (must sum to 1.0)
    feeDistribution: {
        toHolders: 0.85,      // 85% to token holders
        toArena: 0.10,        // 10% arena fee
        toPrizePool: 0.05     // 5% to next prize pool
    },

    // Scoring Weights (must sum to 1.0)
    scoringWeights: {
        fees: 0.30,           // 30% claimed fees
        holders: 0.25,        // 25% unique holder count
        volume: 0.20,         // 20% 24h volume
        stability: 0.15,      // 15% price stability
        growth: 0.10          // 10% growth rate
    },

    // Safety Limits
    safetyLimits: {
        maxPayoutPerHolderSOL: 10,
        maxPayoutPerRoundSOL: 100,
        maxTxPerRound: 500,
        minArenaBalanceSOL: 0.5,  // Never drain below this
        minPayoutLamports: 5000,  // Skip dust payouts
        emergencyStop: false
    },

    // Anti-Fraud Thresholds
    antifraud: {
        minHolderCount: 20,
        maxConcentration: 0.80,   // Top 3 can't hold > 80%
        maxFeeToVolumeRatio: 0.10
    },

    // External APIs
    pumpPortalApiKey: process.env.PUMPPORTAL_API_KEY || "YOUR_PUMPFUN_API_KEY",

    // Database
    dbPath: "./db/pumpleague.db",

    // Optional Twitter Integration (OAuth 1.0a User Context)
    twitter: {
        enabled: process.env.TWITTER_ENABLED === 'true',
        apiKey: process.env.TWITTER_API_KEY,
        apiSecret: process.env.TWITTER_API_SECRET,
        accessToken: process.env.TWITTER_ACCESS_TOKEN,
        accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET
    },

    // AI Configuration (Gemini)
    ai: {
        enabled: process.env.AI_ENABLED === 'true',
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
        autopilotMode: process.env.AI_AUTOPILOT_MODE || 'SEMI_AUTO',
        maxTweetsPerHour: parseInt(process.env.AI_MAX_TWEETS_PER_HOUR) || 3
    }
};
