const { Connection } = require("@solana/web3.js");
const config = require("../config");
const { run, queryOne } = require("../db/schema");

const connection = new Connection(config.solanaRpcUrl, "confirmed");

// Fix #44: Load emergency stop from database if persisted
let EMERGENCY_STOP = config.safetyLimits.emergencyStop;

function loadEmergencyStopState() {
    try {
        const state = queryOne('SELECT value FROM system_state WHERE key = ?', ['emergency_stop']);
        if (state?.value === 'true') {
            EMERGENCY_STOP = true;
            console.warn('⚠️  Emergency stop was active - restoring state');
        }
    } catch (e) {
        // Table might not exist yet, that's ok
    }
}

function saveEmergencyStopState(active) {
    try {
        run(`INSERT OR REPLACE INTO system_state (key, value, updated_at) VALUES (?, ?, datetime('now'))`,
            ['emergency_stop', active ? 'true' : 'false']);
    } catch (e) {
        console.error('Failed to persist emergency stop state:', e.message);
    }
}

// Try to load state on module init
loadEmergencyStopState();

/**
 * Check all safety guards before a payout
 * Throws if any guard fails
 */
async function checkSafetyGuards(roundState, payoutAmountSOL, arenaWalletPubkey) {
    const limits = config.safetyLimits;

    // 1. Emergency stop
    if (EMERGENCY_STOP) {
        throw new SafetyError('EMERGENCY_STOP', '🚨 Emergency stop is active. All payouts halted.');
    }

    // 2. Per-holder limit
    if (payoutAmountSOL > limits.maxPayoutPerHolderSOL) {
        throw new SafetyError(
            'MAX_HOLDER_PAYOUT',
            `Payout ${payoutAmountSOL.toFixed(4)} SOL exceeds per-holder limit of ${limits.maxPayoutPerHolderSOL} SOL`
        );
    }

    // 3. Per-round limit
    const projectedTotal = roundState.totalPaid + payoutAmountSOL;
    if (projectedTotal > limits.maxPayoutPerRoundSOL) {
        throw new SafetyError(
            'MAX_ROUND_PAYOUT',
            `Round payout limit of ${limits.maxPayoutPerRoundSOL} SOL would be exceeded`
        );
    }

    // 4. Transaction count limit
    if (roundState.txCount >= limits.maxTxPerRound) {
        throw new SafetyError(
            'MAX_TX_COUNT',
            `Transaction count limit of ${limits.maxTxPerRound} reached`
        );
    }

    // 5. Balance floor protection
    const arenaBalance = await connection.getBalance(arenaWalletPubkey);
    const arenaBalanceSOL = arenaBalance / 1e9;
    const projectedBalance = arenaBalanceSOL - payoutAmountSOL;

    if (projectedBalance < limits.minArenaBalanceSOL) {
        throw new SafetyError(
            'BALANCE_FLOOR',
            `Arena balance floor protection triggered. Current: ${arenaBalanceSOL.toFixed(4)} SOL, Min: ${limits.minArenaBalanceSOL} SOL`
        );
    }

    return true;
}

/**
 * Validate payout amount
 */
function validatePayoutAmount(lamports) {
    if (!Number.isInteger(lamports)) {
        throw new SafetyError('INVALID_LAMPORTS', 'Lamports must be an integer');
    }

    if (lamports < 0) {
        throw new SafetyError('NEGATIVE_LAMPORTS', 'Lamports cannot be negative');
    }

    if (lamports < config.safetyLimits.minPayoutLamports) {
        return false; // Skip dust, don't throw
    }

    return true;
}

/**
 * Custom error class for safety violations
 */
class SafetyError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'SafetyError';
        this.code = code;
    }
}

/**
 * Activate emergency stop
 * Fix #44: Persists to database
 */
function activateEmergencyStop(reason) {
    EMERGENCY_STOP = true;
    saveEmergencyStopState(true);
    console.error(`🚨 EMERGENCY STOP ACTIVATED: ${reason}`);
    return true;
}

/**
 * Deactivate emergency stop
 * Fix #44: Persists to database
 */
function deactivateEmergencyStop() {
    EMERGENCY_STOP = false;
    saveEmergencyStopState(false);
    console.log(`✅ Emergency stop deactivated`);
    return true;
}

/**
 * Get current safety status
 */
function getSafetyStatus() {
    return {
        emergencyStop: EMERGENCY_STOP,
        limits: config.safetyLimits
    };
}

module.exports = {
    checkSafetyGuards,
    validatePayoutAmount,
    activateEmergencyStop,
    deactivateEmergencyStop,
    getSafetyStatus,
    SafetyError
};
