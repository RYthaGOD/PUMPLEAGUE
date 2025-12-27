const store = require("../db/store");

/**
 * Check if a holder can be paid for this round
 * Prevents double payouts on crash/restart
 */
function canPayHolder(roundId, holderAddress) {
    const existing = store.getPayoutRecord(roundId, holderAddress);
    return existing === null;
}

/**
 * Record a successful payout
 */
function recordPayout(roundId, tokenMint, holderAddress, amountSOL, txSignature) {
    store.recordPayout(roundId, tokenMint, holderAddress, amountSOL, txSignature);
    store.markHolderPaid(roundId, tokenMint, holderAddress, txSignature);
}

/**
 * Check if a round has been completed
 */
function isRoundComplete(roundId) {
    const round = store.getRound(roundId);
    return round?.status === 'completed';
}

/**
 * Check if fees have already been claimed for this round
 */
function hasClaimedFees(roundId) {
    const round = store.getRound(roundId);
    return ['fees_claimed', 'paying', 'completed'].includes(round?.status);
}

/**
 * Get round state for resumption after crash
 */
function getRoundState(roundId) {
    const round = store.getRound(roundId);
    if (!round) return null;

    const payouts = store.getPayoutsForRound(roundId);
    const tokens = store.getRoundTokens(roundId);

    return {
        round,
        status: round.status,
        totalPaid: payouts.reduce((acc, p) => acc + p.amount_sol, 0),
        txCount: payouts.length,
        paidHolders: new Set(payouts.map(p => p.holder_address)),
        tokens
    };
}

/**
 * Resume an incomplete round
 * Skips already-paid holders
 */
function getUnpaidHolders(roundId, tokenMint) {
    const paidHolders = store.getPayoutsForRound(roundId)
        .filter(p => p.token_mint === tokenMint)
        .map(p => p.holder_address);

    const allHolders = store.getHoldersForToken(roundId, tokenMint);

    return allHolders.filter(h => !paidHolders.includes(h.holder_address));
}

module.exports = {
    canPayHolder,
    recordPayout,
    isRoundComplete,
    hasClaimedFees,
    getRoundState,
    getUnpaidHolders
};
