/**
 * Webhooks Database Module
 * Manages webhook registration, delivery tracking, and retry logic
 */

const crypto = require('crypto');

/**
 * Initialize webhooks tables
 * @param {object} db - SQL.js database instance
 */
function initWebhooksTables(db) {
    // Webhooks table
    db.run(`
        CREATE TABLE IF NOT EXISTS webhooks (
            webhook_id TEXT PRIMARY KEY,
            key_id TEXT NOT NULL,
            url TEXT NOT NULL,
            events TEXT NOT NULL,
            secret TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            metadata TEXT,
            FOREIGN KEY (key_id) REFERENCES api_keys(key_id)
        )
    `);

    // Webhook deliveries table
    db.run(`
        CREATE TABLE IF NOT EXISTS webhook_deliveries (
            delivery_id INTEGER PRIMARY KEY AUTOINCREMENT,
            webhook_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            payload TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('pending', 'delivered', 'failed', 'retrying')),
            http_status INTEGER,
            attempts INTEGER NOT NULL DEFAULT 0,
            max_attempts INTEGER NOT NULL DEFAULT 3,
            next_retry_at TEXT,
            delivered_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            error_message TEXT,
            response_time_ms INTEGER,
            FOREIGN KEY (webhook_id) REFERENCES webhooks(webhook_id)
        )
    `);

    // Create indexes
    db.run(`CREATE INDEX IF NOT EXISTS idx_webhooks_key_id ON webhooks(key_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(is_active)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_deliveries_webhook_id ON webhook_deliveries(webhook_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_deliveries_status ON webhook_deliveries(status)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_deliveries_retry ON webhook_deliveries(next_retry_at)`);
}

/**
 * Generate a webhook secret for signature verification
 * @returns {string} - Webhook secret in format: whsec_<random_hex>
 */
function generateWebhookSecret() {
    const randomBytes = crypto.randomBytes(32);
    return `whsec_${randomBytes.toString('hex')}`;
}

/**
 * Register a new webhook
 * @param {object} db - Database instance
 * @param {object} params - Webhook parameters
 * @param {string} params.keyId - API key ID that owns this webhook
 * @param {string} params.url - Webhook URL (must be HTTPS in production)
 * @param {array} params.events - Array of event types to subscribe to
 * @param {object} params.metadata - Optional metadata
 * @returns {object} - { webhookId, url, events, secret }
 */
function registerWebhook(db, { keyId, url, events, metadata = {} }) {
    // Validate URL
    if (!url || !url.startsWith('http')) {
        throw new Error('Invalid webhook URL');
    }

    // In production, require HTTPS
    if (process.env.NODE_ENV === 'production' && !url.startsWith('https://')) {
        throw new Error('Webhook URL must use HTTPS in production');
    }

    // Validate events
    const validEvents = [
        'round.started',
        'round.snapshot_complete',
        'round.fees_claimed',
        'round.scored',
        'round.completed',
        'token.registered',
        'leaderboard.updated'
    ];

    const invalidEvents = events.filter(e => !validEvents.includes(e));
    if (invalidEvents.length > 0) {
        throw new Error(`Invalid event types: ${invalidEvents.join(', ')}`);
    }

    const webhookId = `webhook_${crypto.randomBytes(16).toString('hex')}`;
    const secret = generateWebhookSecret();

    db.run(
        `INSERT INTO webhooks (webhook_id, key_id, url, events, secret, metadata)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [webhookId, keyId, url, JSON.stringify(events), secret, JSON.stringify(metadata)]
    );

    return {
        webhookId,
        url,
        events,
        secret, // Only returned once at creation
        createdAt: new Date().toISOString()
    };
}

/**
 * Get webhooks for a specific API key
 * @param {object} db - Database instance
 * @param {string} keyId - API key ID
 * @param {boolean} includeInactive - Include inactive webhooks
 * @returns {array} - Array of webhook objects
 */
function getWebhooksByKey(db, keyId, includeInactive = false) {
    const query = includeInactive
        ? `SELECT webhook_id, url, events, is_active, created_at, updated_at, metadata
           FROM webhooks WHERE key_id = ? ORDER BY created_at DESC`
        : `SELECT webhook_id, url, events, is_active, created_at, updated_at, metadata
           FROM webhooks WHERE key_id = ? AND is_active = 1 ORDER BY created_at DESC`;

    const result = db.exec(query, [keyId]);

    if (!result.length || !result[0].values.length) {
        return [];
    }

    return result[0].values.map(row => {
        const [webhookId, url, events, isActive, createdAt, updatedAt, metadata] = row;
        return {
            webhookId,
            url,
            events: JSON.parse(events),
            isActive: Boolean(isActive),
            createdAt,
            updatedAt,
            metadata: metadata ? JSON.parse(metadata) : {}
        };
    });
}

/**
 * Get webhooks subscribed to a specific event type
 * @param {object} db - Database instance
 * @param {string} eventType - Event type to filter by
 * @returns {array} - Array of webhook objects with secrets for delivery
 */
function getWebhooksForEvent(db, eventType) {
    const result = db.exec(
        `SELECT webhook_id, url, events, secret
         FROM webhooks
         WHERE is_active = 1`,
        []
    );

    if (!result.length || !result[0].values.length) {
        return [];
    }

    // Filter webhooks that are subscribed to this event
    return result[0].values
        .map(row => {
            const [webhookId, url, events, secret] = row;
            return {
                webhookId,
                url,
                events: JSON.parse(events),
                secret
            };
        })
        .filter(webhook => webhook.events.includes(eventType));
}

/**
 * Log a webhook delivery attempt
 * @param {object} db - Database instance
 * @param {object} params - Delivery details
 * @param {string} params.webhookId - Webhook ID
 * @param {string} params.eventType - Event type
 * @param {object} params.payload - Event payload
 * @param {string} params.status - Delivery status: 'pending', 'delivered', 'failed', 'retrying'
 * @param {number} params.httpStatus - HTTP status code
 * @param {number} params.attempts - Number of attempts
 * @param {string} params.errorMessage - Error message if failed
 * @param {number} params.responseTimeMs - Response time in milliseconds
 * @returns {number} - Delivery ID
 */
function logDelivery(db, { webhookId, eventType, payload, status, httpStatus, attempts = 1, errorMessage = null, responseTimeMs = null }) {
    const result = db.run(
        `INSERT INTO webhook_deliveries 
         (webhook_id, event_type, payload, status, http_status, attempts, error_message, response_time_ms, delivered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            webhookId,
            eventType,
            JSON.stringify(payload),
            status,
            httpStatus,
            attempts,
            errorMessage,
            responseTimeMs,
            status === 'delivered' ? new Date().toISOString() : null
        ]
    );

    return result.lastInsertRowid;
}

/**
 * Update a delivery attempt
 * @param {object} db - Database instance
 * @param {number} deliveryId - Delivery ID
 * @param {object} updates - Fields to update
 */
function updateDelivery(db, deliveryId, updates) {
    const { status, httpStatus, attempts, errorMessage, responseTimeMs, nextRetryAt } = updates;

    const fields = [];
    const values = [];

    if (status) {
        fields.push('status = ?');
        values.push(status);

        if (status === 'delivered') {
            fields.push('delivered_at = datetime("now")');
        }
    }
    if (httpStatus !== undefined) {
        fields.push('http_status = ?');
        values.push(httpStatus);
    }
    if (attempts !== undefined) {
        fields.push('attempts = ?');
        values.push(attempts);
    }
    if (errorMessage !== undefined) {
        fields.push('error_message = ?');
        values.push(errorMessage);
    }
    if (responseTimeMs !== undefined) {
        fields.push('response_time_ms = ?');
        values.push(responseTimeMs);
    }
    if (nextRetryAt !== undefined) {
        fields.push('next_retry_at = ?');
        values.push(nextRetryAt);
    }

    if (fields.length === 0) return;

    values.push(deliveryId);

    db.run(
        `UPDATE webhook_deliveries SET ${fields.join(', ')} WHERE delivery_id = ?`,
        values
    );
}

/**
 * Get delivery logs for a webhook
 * @param {object} db - Database instance
 * @param {string} webhookId - Webhook ID
 * @param {number} limit - Maximum number of logs to return
 * @returns {array} - Array of delivery log objects
 */
function getDeliveryLogs(db, webhookId, limit = 50) {
    const result = db.exec(
        `SELECT delivery_id, event_type, status, http_status, attempts, 
                created_at, delivered_at, error_message, response_time_ms
         FROM webhook_deliveries
         WHERE webhook_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
        [webhookId, limit]
    );

    if (!result.length || !result[0].values.length) {
        return [];
    }

    return result[0].values.map(row => {
        const [deliveryId, eventType, status, httpStatus, attempts, createdAt, deliveredAt, errorMessage, responseTimeMs] = row;
        return {
            deliveryId,
            eventType,
            status,
            httpStatus,
            attempts,
            createdAt,
            deliveredAt,
            errorMessage,
            responseTimeMs
        };
    });
}

/**
 * Get failed deliveries that need retry
 * @param {object} db - Database instance
 * @returns {array} - Array of failed delivery objects with webhook details
 */
function getFailedDeliveries(db) {
    const result = db.exec(
        `SELECT d.delivery_id, d.webhook_id, d.event_type, d.payload, d.attempts, d.max_attempts,
                w.url, w.secret
         FROM webhook_deliveries d
         JOIN webhooks w ON d.webhook_id = w.webhook_id
         WHERE d.status IN ('failed', 'retrying')
           AND d.attempts < d.max_attempts
           AND (d.next_retry_at IS NULL OR d.next_retry_at <= datetime('now'))
           AND w.is_active = 1
         ORDER BY d.created_at ASC
         LIMIT 100`,
        []
    );

    if (!result.length || !result[0].values.length) {
        return [];
    }

    return result[0].values.map(row => {
        const [deliveryId, webhookId, eventType, payload, attempts, maxAttempts, url, secret] = row;
        return {
            deliveryId,
            webhookId,
            eventType,
            payload: JSON.parse(payload),
            attempts,
            maxAttempts,
            url,
            secret
        };
    });
}

/**
 * Get delivery statistics for a webhook
 * @param {object} db - Database instance
 * @param {string} webhookId - Webhook ID
 * @returns {object} - Delivery statistics
 */
function getDeliveryStats(db, webhookId) {
    // Total deliveries
    const totalResult = db.exec(
        `SELECT COUNT(*) as total FROM webhook_deliveries WHERE webhook_id = ?`,
        [webhookId]
    );
    const total = totalResult[0]?.values[0]?.[0] || 0;

    // Deliveries by status
    const statusResult = db.exec(
        `SELECT status, COUNT(*) as count
         FROM webhook_deliveries
         WHERE webhook_id = ?
         GROUP BY status`,
        [webhookId]
    );

    const byStatus = {};
    statusResult[0]?.values.forEach(row => {
        byStatus[row[0]] = row[1];
    });

    // Average response time
    const avgTimeResult = db.exec(
        `SELECT AVG(response_time_ms) as avg_time
         FROM webhook_deliveries
         WHERE webhook_id = ? AND status = 'delivered'`,
        [webhookId]
    );
    const avgResponseTime = avgTimeResult[0]?.values[0]?.[0] || 0;

    // Recent deliveries (last 24 hours)
    const recentResult = db.exec(
        `SELECT COUNT(*) as recent
         FROM webhook_deliveries
         WHERE webhook_id = ? AND created_at > datetime('now', '-24 hours')`,
        [webhookId]
    );
    const recent24h = recentResult[0]?.values[0]?.[0] || 0;

    // Success rate
    const successRate = total > 0 ? ((byStatus.delivered || 0) / total) * 100 : 0;

    return {
        total,
        byStatus,
        avgResponseTime: Math.round(avgResponseTime),
        recent24h,
        successRate: Math.round(successRate * 100) / 100
    };
}

/**
 * Remove a webhook
 * @param {object} db - Database instance
 * @param {string} webhookId - Webhook ID
 * @param {string} keyId - API key ID (for authorization)
 * @returns {boolean} - True if removed, false if not found or unauthorized
 */
function removeWebhook(db, webhookId, keyId) {
    // Verify ownership
    const checkResult = db.exec(
        `SELECT webhook_id FROM webhooks WHERE webhook_id = ? AND key_id = ?`,
        [webhookId, keyId]
    );

    if (!checkResult.length || !checkResult[0].values.length) {
        return false;
    }

    // Soft delete (set inactive)
    const result = db.run(
        `UPDATE webhooks SET is_active = 0, updated_at = datetime('now') WHERE webhook_id = ?`,
        [webhookId]
    );

    return result.changes > 0;
}

/**
 * Delete a webhook permanently
 * @param {object} db - Database instance
 * @param {string} webhookId - Webhook ID
 * @param {string} keyId - API key ID (for authorization)
 * @returns {boolean} - True if deleted, false if not found or unauthorized
 */
function deleteWebhook(db, webhookId, keyId) {
    // Verify ownership
    const checkResult = db.exec(
        `SELECT webhook_id FROM webhooks WHERE webhook_id = ? AND key_id = ?`,
        [webhookId, keyId]
    );

    if (!checkResult.length || !checkResult[0].values.length) {
        return false;
    }

    // Delete deliveries first
    db.run(`DELETE FROM webhook_deliveries WHERE webhook_id = ?`, [webhookId]);

    // Delete webhook
    const result = db.run(`DELETE FROM webhooks WHERE webhook_id = ?`, [webhookId]);

    return result.changes > 0;
}

/**
 * Get webhook details including secret (for testing)
 * @param {object} db - Database instance
 * @param {string} webhookId - Webhook ID
 * @param {string} keyId - API key ID (for authorization)
 * @returns {object|null} - Webhook details with secret, or null if not found
 */
function getWebhookWithSecret(db, webhookId, keyId) {
    const result = db.exec(
        `SELECT webhook_id, url, events, secret, is_active, created_at, metadata
         FROM webhooks
         WHERE webhook_id = ? AND key_id = ?`,
        [webhookId, keyId]
    );

    if (!result.length || !result[0].values.length) {
        return null;
    }

    const [id, url, events, secret, isActive, createdAt, metadata] = result[0].values[0];

    return {
        webhookId: id,
        url,
        events: JSON.parse(events),
        secret,
        isActive: Boolean(isActive),
        createdAt,
        metadata: metadata ? JSON.parse(metadata) : {}
    };
}

module.exports = {
    initWebhooksTables,
    registerWebhook,
    getWebhooksByKey,
    getWebhooksForEvent,
    logDelivery,
    updateDelivery,
    getDeliveryLogs,
    getFailedDeliveries,
    getDeliveryStats,
    removeWebhook,
    deleteWebhook,
    getWebhookWithSecret
};
