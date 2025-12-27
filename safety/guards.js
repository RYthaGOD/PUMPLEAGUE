const { Connection } = require("@solana/web3.js");
const config = require("../config");

const connection = new Connection(config.solanaRpcUrl, "confirmed");

// Mutable emergency stop (can be set at runtime)
let EMERGENCY_STOP = config.safetyLimits.emergencyStop;

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
 */
function activateEmergencyStop(reason) {
    EMERGENCY_STOP = true;
    console.error(`🚨 EMERGENCY STOP ACTIVATED: ${reason}`);
    return true;
}

/**
 * Deactivate emergency stop
 */
function deactivateEmergencyStop() {
    EMERGENCY_STOP = false;
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
