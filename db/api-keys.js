/**
 * API Keys Database Module
 * Manages API key creation, validation, and usage tracking
 */

const crypto = require('crypto');

/**
 * Initialize API keys tables
 * @param {object} db - SQL.js database instance
 */
function initApiKeysTables(db) {
    // API Keys table
    db.run(`
        CREATE TABLE IF NOT EXISTS api_keys (
            key_id TEXT PRIMARY KEY,
            api_key_hash TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            tier TEXT NOT NULL CHECK(tier IN ('public', 'integration', 'admin')),
            rate_limit_per_minute INTEGER NOT NULL DEFAULT 60,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            last_used_at TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            metadata TEXT
        )
    `);

    // API Key Usage tracking table
    db.run(`
        CREATE TABLE IF NOT EXISTS api_key_usage (
            usage_id INTEGER PRIMARY KEY AUTOINCREMENT,
            key_id TEXT NOT NULL,
            endpoint TEXT NOT NULL,
            method TEXT NOT NULL,
            status_code INTEGER,
            timestamp TEXT NOT NULL DEFAULT (datetime('now')),
            ip_address TEXT,
            user_agent TEXT,
            FOREIGN KEY (key_id) REFERENCES api_keys(key_id)
        )
    `);

    // Create indexes for performance
    db.run(`CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(api_key_hash)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_usage_key_id ON api_key_usage(key_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON api_key_usage(timestamp)`);
}

/**
 * Generate a secure API key
 * @returns {string} - API key in format: api_key_<random_hex>
 */
function generateApiKey() {
    const randomBytes = crypto.randomBytes(32);
    return `api_key_${randomBytes.toString('hex')}`;
}

/**
 * Hash an API key for storage
 * @param {string} apiKey - Plain text API key
 * @returns {string} - SHA256 hash of the key
 */
function hashApiKey(apiKey) {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Create a new API key
 * @param {object} db - Database instance
 * @param {object} params - Key parameters
 * @param {string} params.name - Descriptive name for the key
 * @param {string} params.tier - Permission tier: 'public', 'integration', or 'admin'
 * @param {object} params.metadata - Optional metadata (JSON object)
 * @returns {object} - { keyId, apiKey, tier, rateLimit }
 */
function createApiKey(db, { name, tier = 'integration', metadata = {} }) {
    if (!['public', 'integration', 'admin'].includes(tier)) {
        throw new Error(`Invalid tier: ${tier}. Must be 'public', 'integration', or 'admin'`);
    }

    // Set rate limits based on tier
    const rateLimits = {
        public: 60,
        integration: 300,
        admin: 999999 // Effectively unlimited
    };

    const keyId = `key_${crypto.randomBytes(16).toString('hex')}`;
    const apiKey = generateApiKey();
    const apiKeyHash = hashApiKey(apiKey);
    const rateLimit = rateLimits[tier];

    db.run(
        `INSERT INTO api_keys (key_id, api_key_hash, name, tier, rate_limit_per_minute, metadata)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [keyId, apiKeyHash, name, tier, rateLimit, JSON.stringify(metadata)]
    );

    return {
        keyId,
        apiKey, // Only returned once at creation
        tier,
        rateLimit,
        createdAt: new Date().toISOString()
    };
}

/**
 * Validate an API key and return key details
 * @param {object} db - Database instance
 * @param {string} apiKey - Plain text API key to validate
 * @returns {object|null} - Key details if valid, null otherwise
 */
function validateApiKey(db, apiKey) {
    if (!apiKey || !apiKey.startsWith('api_key_')) {
        return null;
    }

    const apiKeyHash = hashApiKey(apiKey);

    const result = db.exec(
        `SELECT key_id, name, tier, rate_limit_per_minute, created_at, last_used_at, metadata
         FROM api_keys
         WHERE api_key_hash = ? AND is_active = 1`,
        [apiKeyHash]
    );

    if (!result.length || !result[0].values.length) {
        return null;
    }

    const row = result[0].values[0];
    const [keyId, name, tier, rateLimit, createdAt, lastUsedAt, metadata] = row;

    // Update last_used_at timestamp
    db.run(
        `UPDATE api_keys SET last_used_at = datetime('now') WHERE key_id = ?`,
        [keyId]
    );

    return {
        keyId,
        name,
        tier,
        rateLimit,
        createdAt,
        lastUsedAt,
        metadata: metadata ? JSON.parse(metadata) : {}
    };
}

/**
 * Track API key usage
 * @param {object} db - Database instance
 * @param {object} params - Usage details
 * @param {string} params.keyId - API key ID
 * @param {string} params.endpoint - Endpoint path
 * @param {string} params.method - HTTP method
 * @param {number} params.statusCode - Response status code
 * @param {string} params.ipAddress - Client IP address
 * @param {string} params.userAgent - Client user agent
 */
function trackUsage(db, { keyId, endpoint, method, statusCode, ipAddress, userAgent }) {
    db.run(
        `INSERT INTO api_key_usage (key_id, endpoint, method, status_code, ip_address, user_agent)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [keyId, endpoint, method, statusCode, ipAddress, userAgent]
    );
}

/**
 * Get usage statistics for an API key
 * @param {object} db - Database instance
 * @param {string} keyId - API key ID
 * @param {number} hours - Number of hours to look back (default: 24)
 * @returns {object} - Usage statistics
 */
function getUsageStats(db, keyId, hours = 24) {
    // Total requests
    const totalResult = db.exec(
        `SELECT COUNT(*) as total FROM api_key_usage WHERE key_id = ?`,
        [keyId]
    );
    const total = totalResult[0]?.values[0]?.[0] || 0;

    // Recent requests (last N hours) - using parameterized modifier
    // Note: SQLite doesn't support parameterized interval modifiers, so we validate hours is a safe integer
    const safeHours = Math.max(1, Math.min(8760, Math.floor(Number(hours) || 24))); // Clamp to 1-8760 hours (1 year max)
    const recentResult = db.exec(
        `SELECT COUNT(*) as recent 
         FROM api_key_usage 
         WHERE key_id = ? AND timestamp > datetime('now', '-' || ? || ' hours')`,
        [keyId, safeHours]
    );
    const recent = recentResult[0]?.values[0]?.[0] || 0;

    // Requests by endpoint (top 10)
    const endpointsResult = db.exec(
        `SELECT endpoint, COUNT(*) as count
         FROM api_key_usage
         WHERE key_id = ?
         GROUP BY endpoint
         ORDER BY count DESC
         LIMIT 10`,
        [keyId]
    );

    const endpoints = endpointsResult[0]?.values.map(row => ({
        endpoint: row[0],
        count: row[1]
    })) || [];

    // Requests by status code
    const statusResult = db.exec(
        `SELECT status_code, COUNT(*) as count
         FROM api_key_usage
         WHERE key_id = ?
         GROUP BY status_code
         ORDER BY count DESC`,
        [keyId]
    );

    const statusCodes = statusResult[0]?.values.map(row => ({
        statusCode: row[0],
        count: row[1]
    })) || [];

    // Current rate (requests in last minute)
    const currentRateResult = db.exec(
        `SELECT COUNT(*) as rate
         FROM api_key_usage
         WHERE key_id = ? AND timestamp > datetime('now', '-1 minute')`,
        [keyId]
    );
    const currentRate = currentRateResult[0]?.values[0]?.[0] || 0;

    return {
        total,
        recent,
        currentRate,
        endpoints,
        statusCodes
    };
}

/**
 * List all API keys
 * @param {object} db - Database instance
 * @param {boolean} includeInactive - Include inactive keys
 * @returns {array} - Array of API key objects (without the actual key)
 */
function listApiKeys(db, includeInactive = false) {
    const query = includeInactive
        ? `SELECT key_id, name, tier, rate_limit_per_minute, created_at, last_used_at, is_active, metadata
           FROM api_keys ORDER BY created_at DESC`
        : `SELECT key_id, name, tier, rate_limit_per_minute, created_at, last_used_at, is_active, metadata
           FROM api_keys WHERE is_active = 1 ORDER BY created_at DESC`;

    const result = db.exec(query);

    if (!result.length || !result[0].values.length) {
        return [];
    }

    return result[0].values.map(row => {
        const [keyId, name, tier, rateLimit, createdAt, lastUsedAt, isActive, metadata] = row;
        return {
            keyId,
            name,
            tier,
            rateLimit,
            createdAt,
            lastUsedAt,
            isActive: Boolean(isActive),
            metadata: metadata ? JSON.parse(metadata) : {}
        };
    });
}

/**
 * Revoke an API key
 * @param {object} db - Database instance
 * @param {string} keyId - API key ID to revoke
 * @returns {boolean} - True if revoked, false if not found
 */
function revokeApiKey(db, keyId) {
    const result = db.run(
        `UPDATE api_keys SET is_active = 0 WHERE key_id = ?`,
        [keyId]
    );

    return result.changes > 0;
}

/**
 * Delete an API key permanently
 * @param {object} db - Database instance
 * @param {string} keyId - API key ID to delete
 * @returns {boolean} - True if deleted, false if not found
 */
function deleteApiKey(db, keyId) {
    // Delete usage records first
    db.run(`DELETE FROM api_key_usage WHERE key_id = ?`, [keyId]);

    // Delete the key
    const result = db.run(`DELETE FROM api_keys WHERE key_id = ?`, [keyId]);

    return result.changes > 0;
}

/**
 * Check if a key has exceeded its rate limit
 * @param {object} db - Database instance
 * @param {string} keyId - API key ID
 * @returns {object} - { allowed: boolean, limit: number, current: number, resetAt: string }
 */
function checkRateLimit(db, keyId) {
    // Get the key's rate limit
    const keyResult = db.exec(
        `SELECT rate_limit_per_minute FROM api_keys WHERE key_id = ?`,
        [keyId]
    );

    if (!keyResult.length || !keyResult[0].values.length) {
        return { allowed: false, limit: 0, current: 0, resetAt: null };
    }

    const limit = keyResult[0].values[0][0];

    // Count requests in the last minute
    const usageResult = db.exec(
        `SELECT COUNT(*) as count
         FROM api_key_usage
         WHERE key_id = ? AND timestamp > datetime('now', '-1 minute')`,
        [keyId]
    );

    const current = usageResult[0]?.values[0]?.[0] || 0;
    const allowed = current < limit;

    // Calculate reset time (start of next minute)
    const now = new Date();
    const resetAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
        now.getHours(), now.getMinutes() + 1, 0, 0);

    return {
        allowed,
        limit,
        current,
        resetAt: resetAt.toISOString()
    };
}

module.exports = {
    initApiKeysTables,
    createApiKey,
    validateApiKey,
    trackUsage,
    getUsageStats,
    listApiKeys,
    revokeApiKey,
    deleteApiKey,
    checkRateLimit
};
