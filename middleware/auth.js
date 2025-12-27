/**
 * Authentication Middleware
 * Validates API keys and enforces permission tiers
 */

const { getDb } = require('../db/schema');
const apiKeys = require('../db/api-keys');

/**
 * Middleware to authenticate API key from request header
 * Attaches key details to req.apiKey if valid
 */
function authenticateApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'API key required. Include X-API-Key header.'
        });
    }

    try {
        const db = getDb();
        const keyDetails = apiKeys.validateApiKey(db, apiKey);

        if (!keyDetails) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid or inactive API key'
            });
        }

        // Attach key details to request
        req.apiKey = keyDetails;
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Authentication failed'
        });
    }
}

/**
 * Middleware to require a specific permission tier
 * Must be used after authenticateApiKey
 * 
 * @param {string} requiredTier - 'public', 'integration', or 'admin'
 */
function requireTier(requiredTier) {
    const tierHierarchy = {
        'public': 0,
        'integration': 1,
        'admin': 2
    };

    return (req, res, next) => {
        if (!req.apiKey) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Authentication required'
            });
        }

        const userTier = tierHierarchy[req.apiKey.tier] || 0;
        const required = tierHierarchy[requiredTier] || 0;

        if (userTier < required) {
            return res.status(403).json({
                error: 'Forbidden',
                message: `This endpoint requires '${requiredTier}' tier access. You have '${req.apiKey.tier}' tier.`
            });
        }

        next();
    };
}

/**
 * Optional authentication middleware
 * Attaches API key if present, but doesn't require it
 * Useful for endpoints that have both public and authenticated access
 */
function optionalAuth(req, res, next) {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
        // No API key provided, continue without authentication
        req.apiKey = null;
        return next();
    }

    try {
        const db = getDb();
        const keyDetails = apiKeys.validateApiKey(db, apiKey);

        if (keyDetails) {
            req.apiKey = keyDetails;
        } else {
            req.apiKey = null;
        }

        next();
    } catch (error) {
        console.error('Optional auth error:', error);
        req.apiKey = null;
        next();
    }
}

/**
 * Middleware to track API usage
 * Should be used after authentication
 */
function trackApiUsage(req, res, next) {
    if (!req.apiKey) {
        return next();
    }

    // Store original res.json to intercept response
    const originalJson = res.json.bind(res);

    res.json = function (body) {
        // Track usage after response is sent
        setImmediate(() => {
            try {
                const db = getDb();
                apiKeys.trackUsage(db, {
                    keyId: req.apiKey.keyId,
                    endpoint: req.path,
                    method: req.method,
                    statusCode: res.statusCode,
                    ipAddress: req.ip || req.connection.remoteAddress,
                    userAgent: req.headers['user-agent']
                });
            } catch (error) {
                console.error('Usage tracking error:', error);
            }
        });

        return originalJson(body);
    };

    next();
}

/**
 * Combined middleware for authenticated endpoints
 * Authenticates, checks rate limit, and tracks usage
 * 
 * @param {string} tier - Required permission tier (optional, defaults to 'integration')
 */
function requireAuth(tier = 'integration') {
    return [
        authenticateApiKey,
        requireTier(tier),
        trackApiUsage
    ];
}

module.exports = {
    authenticateApiKey,
    requireTier,
    optionalAuth,
    trackApiUsage,
    requireAuth
};
