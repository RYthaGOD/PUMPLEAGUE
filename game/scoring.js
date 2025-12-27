const config = require("../config");
const store = require("../db/store");

/**
 * Calculate dynamic bounds from round data
 * This ensures normalization is fair relative to actual values
 */
function calculateDynamicBounds(tokens, holders) {
    const fees = tokens.map(t => t.claimed_fees || 0);
    const holderCounts = tokens.map(t => holders[t.token_mint]?.length || 0);
    const volumes = tokens.map(t => t.volume_24h || 0);

    return {
        feeMin: Math.min(...fees),
        feeMax: Math.max(...fees) || 1, // Avoid division by zero
        holderMin: Math.min(...holderCounts),
        holderMax: Math.max(...holderCounts) || 100,
        volumeMin: Math.min(...volumes),
        volumeMax: Math.max(...volumes) || 1000
    };
}

/**
 * Calculate composite score for a token
 * Uses multiple metrics to prevent gaming
 */
function calculateScore(tokenStats, holders, bounds) {
    const weights = config.scoringWeights;

    // Normalize metrics to 0-100 scale using dynamic bounds
    const feeScore = normalize(
        tokenStats.claimed_fees || 0,
        bounds.feeMin,
        bounds.feeMax
    );
    const holderScore = normalize(
        holders.length,
        bounds.holderMin,
        bounds.holderMax
    );
    const volumeScore = normalize(
        tokenStats.volume_24h || 0,
        bounds.volumeMin,
        bounds.volumeMax
    );

    // Stability: less volatile = higher score
    const priceChange = Math.abs(tokenStats.price_change_24h || 0);
    const stabilityScore = 100 - Math.min(priceChange, 100);

    // Growth: positive change is good (capped)
    const growthScore = Math.max(0, Math.min(tokenStats.price_change_24h || 0, 100));

    // Weighted composite score
    let rawScore = (
        feeScore * weights.fees +
        holderScore * weights.holders +
        volumeScore * weights.volume +
        stabilityScore * weights.stability +
        growthScore * weights.growth
    );

    // Active Status Multiplier: Give it a bump if it's contributing fees
    if (tokenStats.is_active) {
        rawScore *= 1.5; // 50% boost for being an active partner
    }

    return {
        rawScore,
        breakdown: {
            fees: feeScore,
            holders: holderScore,
            volume: volumeScore,
            stability: stabilityScore,
            growth: growthScore
        }
    };
}

/**
 * Normalize a value to 0-100 scale
 */
function normalize(value, min, max) {
    if (max === min) return 50;
    const normalized = ((value - min) / (max - min)) * 100;
    return Math.max(0, Math.min(100, normalized));
}

/**
 * Rank all tokens in a round
 */
async function rankTokens(roundId) {
    const tokens = store.getRoundTokens(roundId);

    // Pre-fetch all holders for dynamic bounds calculation
    const holdersMap = {};
    for (const token of tokens) {
        holdersMap[token.token_mint] = store.getHoldersForToken(roundId, token.token_mint);
    }

    // Calculate dynamic bounds from actual data
    const bounds = calculateDynamicBounds(tokens, holdersMap);
    console.log(`\n📊 Dynamic bounds: Fees ${bounds.feeMin.toFixed(4)}-${bounds.feeMax.toFixed(4)} SOL | Holders ${bounds.holderMin}-${bounds.holderMax} | Vol $${bounds.volumeMin.toFixed(0)}-$${bounds.volumeMax.toFixed(0)}`);

    const scoredTokens = [];

    for (const token of tokens) {
        const holders = holdersMap[token.token_mint];

        // Calculate base score with dynamic bounds
        const scoreResult = calculateScore(token, holders, bounds);
        let score = scoreResult.rawScore;

        // Check for fraud and apply penalty
        const { detectFraud } = require("./antifraud");
        const fraudResult = await detectFraud(token, holders);

        if (fraudResult.isSuspicious) {
            score *= fraudResult.penaltyMultiplier;
        }

        scoredTokens.push({
            ...token,
            score,
            scoreBreakdown: scoreResult.breakdown,
            fraudFlags: fraudResult.flags,
            penaltyMultiplier: fraudResult.penaltyMultiplier,
            holderCount: holders.length
        });
    }

    // Sort by score descending
    scoredTokens.sort((a, b) => b.score - a.score);

    // Assign ranks and update database
    scoredTokens.forEach((token, index) => {
        const rank = index + 1;
        store.updateTokenScore(
            roundId,
            token.token_mint,
            token.score,
            rank,
            token.fraudFlags.length > 0 ? token.fraudFlags.join(',') : null,
            token.penaltyMultiplier
        );
        token.rank = rank;
    });

    return scoredTokens;
}

/**
 * Get formatted leaderboard for display
 */
function getLeaderboard(roundId, limit = 10) {
    const tokens = store.getTopTokens(roundId, limit);

    return tokens.map((t, i) => ({
        rank: i + 1,
        tokenMint: t.token_mint,
        score: t.score?.toFixed(2) || '0.00',
        claimedFees: t.claimed_fees?.toFixed(4) || '0.0000',
        holderCount: t.holder_count || 0,
        fraudFlags: t.fraud_flags ? t.fraud_flags.split(',') : [],
        penalized: t.penalty_multiplier < 1,
        isActive: t.is_active === 1
    }));
}

module.exports = {
    calculateScore,
    calculateDynamicBounds,
    rankTokens,
    getLeaderboard,
    normalize
};
