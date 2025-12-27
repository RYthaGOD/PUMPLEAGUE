/**
 * Agent Memory Module
 * 
 * Persists AI context and learned insights across rounds.
 */

const { query, queryOne, run } = require('../db/schema');

/**
 * Initialize memory table if it doesn't exist
 */
function initMemory() {
    run(`
        CREATE TABLE IF NOT EXISTS agent_memory (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

/**
 * Set a memory value
 */
function set(key, value) {
    const valStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
    run(`
        INSERT OR REPLACE INTO agent_memory (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
    `, [key, valStr]);
}

/**
 * Get a memory value
 */
function get(key) {
    const row = queryOne('SELECT value FROM agent_memory WHERE key = ?', [key]);
    if (!row) return null;
    try {
        return JSON.parse(row.value);
    } catch {
        return row.value;
    }
}

/**
 * Record a notable event in history
 */
function recordEvent(type, data) {
    const history = get('event_history') || [];
    history.push({
        type,
        data,
        timestamp: new Date().toISOString()
    });

    // Keep last 100 events
    set('event_history', history.slice(-100));
}

/**
 * Track a suspected sybil/fraud wallet across rounds
 */
function flagWallet(address, reason) {
    const flags = get('flagged_wallets') || {};
    if (!flags[address]) {
        flags[address] = { count: 1, reasons: [reason], firstSeen: new Date().toISOString() };
    } else {
        flags[address].count++;
        if (!flags[address].reasons.includes(reason)) {
            flags[address].reasons.push(reason);
        }
    }
    set('flagged_wallets', flags);
}

module.exports = {
    init: initMemory,
    set,
    get,
    recordEvent,
    flagWallet
};
