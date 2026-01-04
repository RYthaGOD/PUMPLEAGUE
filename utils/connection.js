/**
 * Shared Solana RPC Connection Pool
 * 
 * Centralized connection management to avoid creating multiple Connection instances
 * across the codebase. Provides connection reuse and health monitoring.
 */

const { Connection } = require("@solana/web3.js");
const config = require("../config");

// Singleton connections
let mainConnection = null;
let confirmedConnection = null;

/**
 * Get main connection with 'confirmed' commitment
 * @returns {Connection}
 */
function getConnection() {
    if (!mainConnection) {
        mainConnection = new Connection(config.solanaRpcUrl, {
            commitment: 'confirmed',
            confirmTransactionInitialTimeout: 60000,
            disableRetryOnRateLimit: false
        });
        console.log(`[RPC] Initialized main connection to ${config.solanaRpcUrl.slice(0, 30)}...`);
    }
    return mainConnection;
}

/**
 * Get connection with specific commitment level
 * @param {string} commitment - 'processed' | 'confirmed' | 'finalized'
 * @returns {Connection}
 */
function getConnectionWithCommitment(commitment = 'confirmed') {
    if (commitment === 'confirmed') {
        return getConnection();
    }

    // For other commitment levels, create on-demand
    return new Connection(config.solanaRpcUrl, {
        commitment,
        confirmTransactionInitialTimeout: 60000
    });
}

/**
 * Check RPC connection health
 * @returns {Promise<{healthy: boolean, latencyMs: number, slot?: number, error?: string}>}
 */
async function checkHealth() {
    const start = Date.now();
    try {
        const conn = getConnection();
        const slot = await conn.getSlot();
        const latencyMs = Date.now() - start;

        return {
            healthy: true,
            latencyMs,
            slot,
            rpcUrl: config.solanaRpcUrl.slice(0, 30) + '...'
        };
    } catch (error) {
        return {
            healthy: false,
            latencyMs: Date.now() - start,
            error: error.message
        };
    }
}

/**
 * Get current slot
 * @returns {Promise<number>}
 */
async function getCurrentSlot() {
    const conn = getConnection();
    return await conn.getSlot();
}

/**
 * Get account balance in SOL
 * @param {PublicKey} pubkey 
 * @returns {Promise<number>}
 */
async function getBalanceSOL(pubkey) {
    const conn = getConnection();
    const lamports = await conn.getBalance(pubkey);
    return lamports / 1e9;
}

/**
 * Reset connections (for testing or recovery)
 */
function resetConnections() {
    mainConnection = null;
    confirmedConnection = null;
    console.log('[RPC] Connections reset');
}

module.exports = {
    getConnection,
    getConnectionWithCommitment,
    checkHealth,
    getCurrentSlot,
    getBalanceSOL,
    resetConnections
};
