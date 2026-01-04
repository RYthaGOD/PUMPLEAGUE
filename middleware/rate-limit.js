/**
 * Rate Limiting Middleware
 * Enforces per-API-key rate limits based on tier
 */

const { getDb } = require('../db/schema');
const apiKeys = require('../db/api-keys');

// In-memory store for rate limiting (for production, use Redis)
const rateLimitStore = new Map();
const MAX_RATE_LIMIT_ENTRIES = 10000; // Prevent unbounded growth

/**
 * Clean up old entries from rate limit store
 * Runs periodically to prevent memory leaks
 */
function cleanupRateLimitStore() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    for (const [key, data] of rateLimitStore.entries()) {
        // Remove entries older than 1 minute
        data.requests = data.requests.filter(timestamp => timestamp > oneMinuteAgo);

        if (data.requests.length === 0) {
            rateLimitStore.delete(key);
        }
    }

    // If still too large, evict oldest entries (LRU)
    if (rateLimitStore.size > MAX_RATE_LIMIT_ENTRIES) {
        const entriesToRemove = rateLimitStore.size - MAX_RATE_LIMIT_ENTRIES;
        const keys = Array.from(rateLimitStore.keys()).slice(0, entriesToRemove);
        keys.forEach(key => rateLimitStore.delete(key));
    }
}

// Run cleanup every 30 seconds (store reference for potential cleanup)
const cleanupInterval = setInterval(cleanupRateLimitStore, 30000);
cleanupInterval.unref(); // Don't prevent process from exiting

/**
 * Rate limiting middleware
 * Enforces limits based on API key tier
 */
function rateLimitByKey(req, res, next) {
    // Skip rate limiting if no API key (public endpoints have their own limits)
    if (!req.apiKey) {
        return publicRateLimit(req, res, next);
    }

    const keyId = req.apiKey.keyId;
    const limit = req.apiKey.rateLimit;
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Get or create rate limit data for this key
    if (!rateLimitStore.has(keyId)) {
        rateLimitStore.set(keyId, {
            requests: [],
            limit: limit
        });
    }

    const data = rateLimitStore.get(keyId);

    // Remove requests older than 1 minute
    data.requests = data.requests.filter(timestamp => timestamp > oneMinuteAgo);

    // Check if limit exceeded
    if (data.requests.length >= limit) {
        const oldestRequest = data.requests[0];
        const resetAt = new Date(oldestRequest + 60000);
        const retryAfter = Math.ceil((resetAt - now) / 1000);

        return res.status(429)
            .set({
                'X-RateLimit-Limit': limit,
                'X-RateLimit-Remaining': 0,
                'X-RateLimit-Reset': resetAt.toISOString(),
                'Retry-After': retryAfter
            })
            .json({
                error: 'Too Many Requests',
                message: `Rate limit exceeded. Limit: ${limit} requests per minute.`,
                retryAfter: retryAfter,
                resetAt: resetAt.toISOString()
            });
    }

    // Add current request
    data.requests.push(now);

    // Set rate limit headers
    res.set({
        'X-RateLimit-Limit': limit,
        'X-RateLimit-Remaining': limit - data.requests.length,
        'X-RateLimit-Reset': new Date(now + 60000).toISOString()
    });

    next();
}

/**
 * Public rate limit (for unauthenticated requests)
 * Uses IP address as identifier
 */
function publicRateLimit(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress;
    const limit = 60; // 60 requests per minute for public
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    const key = `public:${ip}`;

    if (!rateLimitStore.has(key)) {
        rateLimitStore.set(key, {
            requests: [],
            limit: limit
        });
    }

    const data = rateLimitStore.get(key);
    data.requests = data.requests.filter(timestamp => timestamp > oneMinuteAgo);

    if (data.requests.length >= limit) {
        const oldestRequest = data.requests[0];
        const resetAt = new Date(oldestRequest + 60000);
        const retryAfter = Math.ceil((resetAt - now) / 1000);

        return res.status(429)
            .set({
                'X-RateLimit-Limit': limit,
                'X-RateLimit-Remaining': 0,
                'X-RateLimit-Reset': resetAt.toISOString(),
                'Retry-After': retryAfter
            })
            .json({
                error: 'Too Many Requests',
                message: `Rate limit exceeded. Limit: ${limit} requests per minute for public access.`,
                retryAfter: retryAfter,
                resetAt: resetAt.toISOString()
            });
    }

    data.requests.push(now);

    res.set({
        'X-RateLimit-Limit': limit,
        'X-RateLimit-Remaining': limit - data.requests.length,
        'X-RateLimit-Reset': new Date(now + 60000).toISOString()
    });

    next();
}

/**
 * Get current rate limit status for a key
 * @param {string} keyId - API key ID
 * @returns {object} - { limit, remaining, resetAt }
 */
function getRateLimitStatus(keyId) {
    if (!rateLimitStore.has(keyId)) {
        return null;
    }

    const data = rateLimitStore.get(keyId);
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Clean up old requests
    data.requests = data.requests.filter(timestamp => timestamp > oneMinuteAgo);

    return {
        limit: data.limit,
        remaining: data.limit - data.requests.length,
        resetAt: new Date(now + 60000).toISOString(),
        current: data.requests.length
    };
}

/**
 * Reset rate limit for a specific key (admin function)
 * @param {string} keyId - API key ID
 */
function resetRateLimit(keyId) {
    rateLimitStore.delete(keyId);
}

module.exports = {
    rateLimitByKey,
    publicRateLimit,
    getRateLimitStatus,
    resetRateLimit
};
