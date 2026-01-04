const store = require("../db/store");

// Fix #49: Support multiple block explorers
const EXPLORERS = {
    solscan: {
        name: 'Solscan',
        txUrl: (sig) => `https://solscan.io/tx/${sig}`,
        addressUrl: (addr) => `https://solscan.io/address/${addr}`,
        tokenUrl: (mint) => `https://solscan.io/token/${mint}`
    },
    solana: {
        name: 'Solana Explorer',
        txUrl: (sig) => `https://explorer.solana.com/tx/${sig}`,
        addressUrl: (addr) => `https://explorer.solana.com/address/${addr}`,
        tokenUrl: (mint) => `https://explorer.solana.com/address/${mint}`
    },
    solanafm: {
        name: 'SolanaFM',
        txUrl: (sig) => `https://solana.fm/tx/${sig}`,
        addressUrl: (addr) => `https://solana.fm/address/${addr}`,
        tokenUrl: (mint) => `https://solana.fm/address/${mint}`
    }
};

const DEFAULT_EXPLORER = process.env.BLOCK_EXPLORER || 'solscan';

function getExplorer(name = DEFAULT_EXPLORER) {
    return EXPLORERS[name] || EXPLORERS.solscan;
}

const SOLSCAN_BASE = "https://solscan.io/tx"; // Legacy fallback

/**
 * Redact address for privacy (keep first 4 and last 4 chars)
 */
function redactAddress(address) {
    if (!address || address.length < 12) return '***';
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/**
 * Generate proof-of-payout for a round
 * Returns verifiable on-chain links
 * Fix #26: Added redactAddresses option for privacy
 */
function generatePayoutProof(roundId, options = { redactAddresses: false }) {
    const payouts = store.getPayoutsForRound(roundId);

    return {
        roundId,
        count: payouts.length,
        totalSOL: payouts.reduce((acc, p) => acc + p.amount_sol, 0),
        payouts: payouts.map(p => ({
            holder: options.redactAddresses ? redactAddress(p.holder_address) : p.holder_address,
            holderShort: p.holder_address.slice(0, 8) + '...',
            amount: `${p.amount_sol.toFixed(6)} SOL`,
            tx: p.tx_signature,
            txShort: p.tx_signature.slice(0, 16) + '...',
            explorerUrl: `${SOLSCAN_BASE}/${p.tx_signature}`,
            timestamp: p.confirmed_at
        }))
    };
}

/**
 * Generate shareable payout card (markdown format)
 */
function generatePayoutCard(roundId, tokenMint, topHolders = 5) {
    const round = store.getRound(roundId);
    const payouts = store.getPayoutsForRound(roundId)
        .filter(p => p.token_mint === tokenMint)
        .slice(0, topHolders);

    const token = store.getRoundTokens(roundId)
        .find(t => t.token_mint === tokenMint);

    if (!token) return null;

    const totalPaid = payouts.reduce((acc, p) => acc + p.amount_sol, 0);

    let card = `
🏆 **PumpLeague Round ${roundId}**

📦 Token: \`${tokenMint.slice(0, 12)}...\`
🏅 Rank: #${token.rank}
💰 Fees Claimed: ${token.claimed_fees?.toFixed(4) || 0} SOL
👥 Holders Paid: ${payouts.length}
💸 Total Distributed: ${totalPaid.toFixed(4)} SOL

**Top Payouts:**
`;

    for (const p of payouts) {
        card += `• ${p.holder_address.slice(0, 8)}... → ${p.amount_sol.toFixed(6)} SOL [🔗](${SOLSCAN_BASE}/${p.tx_signature})\n`;
    }

    card += `\n✅ Verified on-chain | Snapshot slot: ${round.snapshot_slot}`;

    return card.trim();
}

/**
 * Generate JSON export for external verification
 */
function exportPayoutData(roundId) {
    const round = store.getRound(roundId);
    const tokens = store.getRoundTokens(roundId);
    const payouts = store.getPayoutsForRound(roundId);

    return {
        protocol: 'PumpLeague',
        version: '1.0.0',
        roundId,
        snapshotSlot: round.snapshot_slot,
        snapshotTimestamp: round.snapshot_timestamp,
        tokens: tokens.map(t => ({
            mint: t.token_mint,
            rank: t.rank,
            score: t.score,
            claimedFees: t.claimed_fees,
            holderCount: t.holder_count
        })),
        payouts: payouts.map(p => ({
            holder: p.holder_address,
            token: p.token_mint,
            amountSOL: p.amount_sol,
            txSignature: p.tx_signature,
            timestamp: p.confirmed_at
        })),
        exportedAt: new Date().toISOString()
    };
}

module.exports = {
    generatePayoutProof,
    generatePayoutCard,
    exportPayoutData
};
