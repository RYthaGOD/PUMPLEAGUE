const store = require("../db/store");

/**
 * Get Hall of Fame - top performing tokens across all rounds
 */
function getHallOfFame(limit = 20) {
    const data = store.getHallOfFame(limit);

    return data.map((entry, index) => ({
        rank: index + 1,
        tokenMint: entry.token_mint,
        tokenShort: entry.token_mint.slice(0, 8) + '...',
        totalWins: entry.total_wins,
        totalTop3: entry.total_top3,
        totalFeesEarned: entry.total_fees_earned?.toFixed(4) || '0',
        avgScore: entry.avg_score?.toFixed(2) || '0',
        lastWinRound: entry.last_win_round,
        updatedAt: entry.updated_at
    }));
}

/**
 * Get historical performance for a specific token
 */
function getTokenHistory(tokenMint) {
    // Query all rounds this token participated in
    const rounds = store.getRoundHistory(100); // Last 100 rounds
    const tokenRounds = [];

    for (const round of rounds) {
        const tokens = store.getRoundTokens(round.round_id);
        const tokenData = tokens.find(t => t.token_mint === tokenMint);

        if (tokenData) {
            tokenRounds.push({
                roundId: round.round_id,
                rank: tokenData.rank,
                score: tokenData.score?.toFixed(2) || '0',
                claimedFees: tokenData.claimed_fees?.toFixed(4) || '0',
                holderCount: tokenData.holder_count,
                timestamp: round.created_at
            });
        }
    }

    return {
        tokenMint,
        totalParticipations: tokenRounds.length,
        wins: tokenRounds.filter(r => r.rank === 1).length,
        top3Finishes: tokenRounds.filter(r => r.rank <= 3).length,
        history: tokenRounds
    };
}

/**
 * Get round history
 */
function getRoundHistory(limit = 10) {
    const rounds = store.getRoundHistory(limit);

    return rounds.map(r => ({
        roundId: r.round_id,
        status: r.status,
        snapshotSlot: r.snapshot_slot,
        totalFeesClaimed: r.total_fees_claimed?.toFixed(4) || '0',
        totalPaidOut: r.total_paid_out?.toFixed(4) || '0',
        createdAt: r.created_at,
        completedAt: r.completed_at
    }));
}

/**
 * Generate formatted Hall of Fame display
 */
function formatHallOfFame(limit = 10) {
    const hof = getHallOfFame(limit);

    let output = `\n🏆 PUMPLEAGUE HALL OF FAME 🏆\n`;
    output += `${'─'.repeat(50)}\n`;

    const medals = ['🥇', '🥈', '🥉'];

    for (const entry of hof) {
        const medal = entry.rank <= 3 ? medals[entry.rank - 1] : `#${entry.rank}`;
        output += `${medal} ${entry.tokenShort} | ${entry.totalWins} wins | ${entry.totalFeesEarned} SOL earned\n`;
    }

    output += `${'─'.repeat(50)}\n`;

    return output;
}

module.exports = {
    getHallOfFame,
    getTokenHistory,
    getRoundHistory,
    formatHallOfFame
};
