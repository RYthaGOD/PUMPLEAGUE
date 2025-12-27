const config = require("../config");
const store = require("../db/store");

/**
 * Generate transparent accounting report for a round
 */
function generateRoundAccounting(roundId) {
    const round = store.getRound(roundId);
    if (!round) return null;

    const tokens = store.getRoundTokens(roundId);
    const payouts = store.getPayoutsForRound(roundId);

    const totalFeesClaimed = tokens.reduce((acc, t) => acc + (t.claimed_fees || 0), 0);
    const totalPaidOut = payouts.reduce((acc, p) => acc + p.amount_sol, 0);

    // Calculate distribution based on config
    const distribution = config.feeDistribution;
    const expectedHolderPayout = totalFeesClaimed * distribution.toHolders;
    const arenaFee = totalFeesClaimed * distribution.toArena;
    const prizePoolContribution = totalFeesClaimed * distribution.toPrizePool;

    return {
        roundId,
        status: round.status,
        snapshotSlot: round.snapshot_slot,
        snapshotTimestamp: new Date(round.snapshot_timestamp).toISOString(),

        // Raw numbers
        totalFeesClaimed,
        totalPaidOut,
        arenaFee,
        prizePoolContribution,

        // Distribution breakdown
        distribution: {
            toHolders: {
                percentage: `${distribution.toHolders * 100}%`,
                expected: expectedHolderPayout,
                actual: totalPaidOut,
                difference: totalPaidOut - expectedHolderPayout
            },
            toArena: {
                percentage: `${distribution.toArena * 100}%`,
                amount: arenaFee
            },
            toPrizePool: {
                percentage: `${distribution.toPrizePool * 100}%`,
                amount: prizePoolContribution
            }
        },

        // Token breakdown
        tokens: tokens.map(t => ({
            mint: t.token_mint,
            rank: t.rank,
            score: t.score?.toFixed(2) || '0',
            claimedFees: t.claimed_fees?.toFixed(4) || '0',
            holderCount: t.holder_count,
            penalized: t.penalty_multiplier < 1,
            fraudFlags: t.fraud_flags || null
        })),

        // Payout summary
        payoutSummary: {
            count: payouts.length,
            totalSOL: totalPaidOut,
            avgPayoutSOL: payouts.length > 0 ? totalPaidOut / payouts.length : 0
        },

        createdAt: round.created_at,
        completedAt: round.completed_at
    };
}

/**
 * Generate simple summary for public display
 */
function getPublicSummary(roundId) {
    const accounting = generateRoundAccounting(roundId);
    if (!accounting) return null;

    return {
        round: roundId,
        totalClaimed: `${accounting.totalFeesClaimed.toFixed(4)} SOL`,
        totalDistributed: `${accounting.totalPaidOut.toFixed(4)} SOL`,
        holdersPaid: accounting.payoutSummary.count,
        arenaFee: `${accounting.arenaFee.toFixed(4)} SOL`,
        topTokens: accounting.tokens.slice(0, 3).map(t => ({
            mint: t.mint.slice(0, 8) + '...',
            rank: t.rank,
            fees: `${t.claimedFees} SOL`
        }))
    };
}

module.exports = {
    generateRoundAccounting,
    getPublicSummary
};
