const { query, queryOne, run, ensureInit } = require('./schema');
const config = require('../config');

// Ensure database is initialized before any operations
let initialized = false;
async function init() {
  if (!initialized) {
    await ensureInit();

    // Fix #37: Load scoring weights from DB
    try {
      const rows = query('SELECT * FROM scoring_config');
      if (rows.length > 0) {
        rows.forEach(r => {
          if (config.scoringWeights.hasOwnProperty(r.metric)) {
            config.scoringWeights[r.metric] = r.weight;
          }
        });
        console.log('⚖️  Loaded scoring weights from database');
      }
    } catch (e) {
      // Table might not exist yet during first run of migrations
      console.warn('ℹ️  Scoring config table not found or empty, using defaults');
    }

    initialized = true;
  }
}

// ============ ROUNDS ============

function createRound(roundId, snapshotSlot, snapshotTimestamp) {
  run(`
    INSERT INTO rounds (round_id, snapshot_slot, snapshot_timestamp, status)
    VALUES (?, ?, ?, 'pending')
  `, [roundId, snapshotSlot, snapshotTimestamp]);
}

function getRound(roundId) {
  return queryOne('SELECT * FROM rounds WHERE round_id = ?', [roundId]);
}

function getLatestRound() {
  return queryOne('SELECT * FROM rounds ORDER BY created_at DESC LIMIT 1');
}

function updateRoundStatus(roundId, status) {
  run('UPDATE rounds SET status = ? WHERE round_id = ?', [status, roundId]);
}

function completeRound(roundId, totalFees, totalPaid, arenaFee) {
  run(`
    UPDATE rounds 
    SET status = 'completed', 
        total_fees_claimed = ?,
        total_paid_out = ?,
        arena_fee = ?,
        completed_at = datetime('now')
    WHERE round_id = ?
  `, [totalFees, totalPaid, arenaFee, roundId]);
}

// ============ TOKENS ============

function registerToken(tokenMint, creatorWallet, name = null, symbol = null) {
  run(`
    INSERT OR REPLACE INTO registered_tokens (token_mint, creator_wallet, name, symbol, registered_at, active)
    VALUES (?, ?, ?, ?, datetime('now'), 1)
  `, [tokenMint, creatorWallet, name, symbol]);
}

function getActiveTokens() {
  return query('SELECT * FROM registered_tokens WHERE active = 1');
}

function deactivateToken(tokenMint) {
  run('UPDATE registered_tokens SET active = 0 WHERE token_mint = ?', [tokenMint]);
}

// ============ ROUND TOKENS ============

function saveTokenSnapshot(roundId, tokenMint, holderCount, totalSupply, liquidity, volume24h = 0, priceChange24h = 0) {
  run(`
    INSERT INTO round_tokens (round_id, token_mint, holder_count, total_supply, liquidity, volume_24h, price_change_24h)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [roundId, tokenMint, holderCount, totalSupply, liquidity, volume24h, priceChange24h]);
}

function updateTokenFees(roundId, tokenMint, preBalance, postBalance, claimedFees, isActive = 0) {
  run(`
    UPDATE round_tokens 
    SET pre_claim_balance = ?, post_claim_balance = ?, claimed_fees = ?, is_active = ?
    WHERE round_id = ? AND token_mint = ?
  `, [preBalance, postBalance, claimedFees, isActive, roundId, tokenMint]);
}

function updateTokenScore(roundId, tokenMint, score, rank, fraudFlags = null, penaltyMultiplier = 1.0) {
  run(`
    UPDATE round_tokens 
    SET score = ?, rank = ?, fraud_flags = ?, penalty_multiplier = ?
    WHERE round_id = ? AND token_mint = ?
  `, [score, rank, fraudFlags, penaltyMultiplier, roundId, tokenMint]);
}

function getRoundTokens(roundId) {
  return query('SELECT * FROM round_tokens WHERE round_id = ? ORDER BY rank ASC', [roundId]);
}

function getTopTokens(roundId, limit) {
  return query('SELECT * FROM round_tokens WHERE round_id = ? ORDER BY score DESC LIMIT ?', [roundId, limit]);
}

// ============ HOLDERS ============

function saveHolderSnapshot(roundId, tokenMint, holderAddress, tokenAccount, balance) {
  run(`
    INSERT OR REPLACE INTO round_holders (round_id, token_mint, holder_address, token_account, balance)
    VALUES (?, ?, ?, ?, ?)
  `, [roundId, tokenMint, holderAddress, tokenAccount, balance]);
}

function saveHoldersBatch(roundId, tokenMint, holders) {
  // Wrap in transaction for atomicity (#2 fix)
  run('BEGIN TRANSACTION');
  try {
    for (const h of holders) {
      run(`
        INSERT OR REPLACE INTO round_holders (round_id, token_mint, holder_address, token_account, balance)
        VALUES (?, ?, ?, ?, ?)
      `, [roundId, tokenMint, h.address, h.tokenAccount || null, h.balance]);
    }

    // Fix #53: Sync holder_count in round_tokens with actual count
    run(`
      UPDATE round_tokens 
      SET holder_count = ?
      WHERE round_id = ? AND token_mint = ?
    `, [holders.length, roundId, tokenMint]);

    run('COMMIT');
  } catch (error) {
    run('ROLLBACK');
    throw error;
  }
}

function getHoldersForToken(roundId, tokenMint) {
  return query(`
    SELECT * FROM round_holders 
    WHERE round_id = ? AND token_mint = ?
    ORDER BY balance DESC
  `, [roundId, tokenMint]);
}

function updateHolderPayout(roundId, tokenMint, holderAddress, sharePercent, payoutLamports, payoutSOL) {
  run(`
    UPDATE round_holders 
    SET share_percent = ?, payout_lamports = ?, payout_sol = ?
    WHERE round_id = ? AND token_mint = ? AND holder_address = ?
  `, [sharePercent, payoutLamports, payoutSOL, roundId, tokenMint, holderAddress]);
}

function markHolderPaid(roundId, tokenMint, holderAddress, txSignature) {
  run(`
    UPDATE round_holders 
    SET payout_tx = ?, paid_at = datetime('now')
    WHERE round_id = ? AND token_mint = ? AND holder_address = ?
  `, [txSignature, roundId, tokenMint, holderAddress]);
}

// ============ PAYOUTS ============

function recordPayout(roundId, tokenMint, holderAddress, amountSOL, txSignature) {
  run(`
    INSERT INTO payouts (round_id, token_mint, holder_address, amount_sol, tx_signature)
    VALUES (?, ?, ?, ?, ?)
  `, [roundId, tokenMint, holderAddress, amountSOL, txSignature]);
}

function getPayoutRecord(roundId, holderAddress) {
  return queryOne(`
    SELECT * FROM payouts WHERE round_id = ? AND holder_address = ?
  `, [roundId, holderAddress]);
}

function getPayoutsForRound(roundId) {
  return query('SELECT * FROM payouts WHERE round_id = ?', [roundId]);
}

function getTotalPaidForRound(roundId) {
  const result = queryOne('SELECT SUM(amount_sol) as total FROM payouts WHERE round_id = ?', [roundId]);
  return result?.total || 0;
}

// ============ HALL OF FAME ============

function updateHallOfFame(tokenMint, rank, feesEarned, score, roundId) {
  const existing = queryOne('SELECT * FROM hall_of_fame WHERE token_mint = ?', [tokenMint]);

  if (existing) {
    const wins = rank === 1 ? existing.total_wins + 1 : existing.total_wins;
    const top3 = rank <= 3 ? existing.total_top3 + 1 : existing.total_top3;
    const totalFees = existing.total_fees_earned + feesEarned;

    // Fix #21: Handle edge case where total_top3 was 0
    let avgScore;
    if (existing.total_top3 === 0) {
      avgScore = score; // First top3 finish, score is the average
    } else {
      avgScore = (existing.avg_score * existing.total_top3 + score) / (existing.total_top3 + 1);
    }

    run(`
      UPDATE hall_of_fame 
      SET total_wins = ?, total_top3 = ?, total_fees_earned = ?, avg_score = ?, 
          last_win_round = CASE WHEN ? = 1 THEN ? ELSE last_win_round END,
          updated_at = datetime('now')
      WHERE token_mint = ?
    `, [wins, top3, totalFees, avgScore, rank, roundId, tokenMint]);
  } else {
    run(`
      INSERT INTO hall_of_fame (token_mint, total_wins, total_top3, total_fees_earned, avg_score, last_win_round)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [tokenMint, rank === 1 ? 1 : 0, rank <= 3 ? 1 : 0, feesEarned, score, rank === 1 ? roundId : null]);
  }
}

function getHallOfFame(limit = 20) {
  return query(`
    SELECT * FROM hall_of_fame 
    ORDER BY total_wins DESC, total_fees_earned DESC 
    LIMIT ?
  `, [limit]);
}

// ============ UTILITIES ============

function generateRoundId() {
  const now = new Date();
  return `R${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${Date.now()}`;
}

// Fix #54: Support offset pagination
function getRoundHistory(limit = 10, offset = 0) {
  return query(`
    SELECT * FROM rounds 
    ORDER BY created_at DESC 
    LIMIT ? OFFSET ?
  `, [limit, offset]);
}

function getRoundCount() {
  const result = queryOne('SELECT COUNT(*) as count FROM rounds');
  return result?.count || 0;
}

module.exports = {
  init,
  // Rounds
  createRound,
  getRound,
  getLatestRound,
  updateRoundStatus,
  completeRound,
  // Tokens
  registerToken,
  getActiveTokens,
  deactivateToken,
  // Round Tokens
  saveTokenSnapshot,
  updateTokenFees,
  updateTokenScore,
  getRoundTokens,
  getTopTokens,
  // Holders
  saveHolderSnapshot,
  saveHoldersBatch,
  getHoldersForToken,
  updateHolderPayout,
  markHolderPaid,
  // Payouts
  recordPayout,
  getPayoutRecord,
  getPayoutsForRound,
  getTotalPaidForRound,
  // Hall of Fame
  updateHallOfFame,
  getHallOfFame,
  // Utilities
  generateRoundId,
  getRoundHistory,
  getRoundCount
};
