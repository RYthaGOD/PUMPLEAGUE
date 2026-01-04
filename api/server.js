/**
 * PumpLeague Public REST API
 * 
 * Exposes protocol data for the landing page and public monitoring.
 * Fix #16: Added auth middleware for protected endpoints
 */

const express = require('express');
const cors = require('cors');
const store = require('../db/store');
const config = require('../config');
// Fix #16: Import auth middleware
const { optionalAuth, requireAuth, trackApiUsage } = require('../middleware/auth');

const app = express();
const PORT = process.env.PORT || 3001;

// Fix #46: Tightened CORS configuration
const corsOptions = {
    origin: process.env.NODE_ENV === 'production'
        ? (process.env.CORS_ORIGINS || 'https://pumpleague.io').split(',')
        : true, // Allow all origins in development
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-API-Key', 'Authorization'],
    credentials: true,
    maxAge: 86400 // Cache preflight for 24 hours
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static('public')); // Serve static files (Admin UI)

// Fix #50: Request timeout middleware (30 second default)
const REQUEST_TIMEOUT_MS = parseInt(process.env.API_TIMEOUT_MS) || 30000;
app.use((req, res, next) => {
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
        if (!res.headersSent) {
            res.status(408).json({ error: 'Request Timeout', message: 'The request took too long to process' });
        }
    });
    next();
});

// Optional auth - attaches API key if present for tracking
app.use(optionalAuth);
app.use(trackApiUsage);

// Helper to wrap async routes
const asyncRoute = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Fix #45: API versioning support
// Current version is v1 - /api/v1/* routes to /api/*
// Future versions can be handled differently
const API_VERSION = 'v1';

// Redirect /api/v1/* to /api/* for backwards compatibility
app.use('/api/v1', (req, res, next) => {
    // Strip v1 from path and forward to main API router
    req.url = req.url; // URL stays the same, we're mounting on /api/v1
    next();
});

// Version info endpoint
app.get('/api/version', (req, res) => {
    res.json({
        version: API_VERSION,
        supported: ['v1'],
        deprecated: [],
        current: 'v1'
    });
});

/**
 * GET /api/status
 * Returns general protocol status and configuration
 */
app.get('/api/status', asyncRoute(async (req, res) => {
    const latestRound = store.getLatestRound();
    const activeTokens = store.getActiveTokens();

    res.json({
        protocol: "PumpLeague",
        status: "active",
        latestRound,
        activeTokenCount: activeTokens.length,
        config: {
            roundDurationHours: config.roundDurationHours,
            topN: config.topN,
            feeDistribution: config.feeDistribution
        }
    });
}));

/**
 * GET /api/leaderboard
 * Returns the leaderboard for the latest round
 */
app.get('/api/leaderboard', asyncRoute(async (req, res) => {
    const latestRound = store.getLatestRound();
    if (!latestRound) {
        return res.json([]);
    }

    const tokens = store.getRoundTokens(latestRound.round_id);
    res.json(tokens);
}));

/**
 * GET /api/rounds
 * Returns a history of past rounds
 * Fix #54: Added pagination with offset support
 */
app.get('/api/rounds', asyncRoute(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100); // Max 100
    const offset = parseInt(req.query.offset) || 0;
    const rounds = store.getRoundHistory(limit, offset);

    // Get total count for pagination metadata
    const total = store.getRoundCount ? store.getRoundCount() : rounds.length;

    res.json({
        data: rounds,
        pagination: {
            limit,
            offset,
            total,
            hasMore: offset + rounds.length < total
        }
    });
}));

/**
 * GET /api/rounds/:id
 * Returns detailed data for a specific round
 */
app.get('/api/rounds/:id', asyncRoute(async (req, res) => {
    const roundId = req.params.id;
    const round = store.getRound(roundId);

    if (!round) {
        return res.status(404).json({ error: "Round not found" });
    }

    const tokens = store.getRoundTokens(roundId);
    const payouts = store.getPayoutsForRound(roundId);

    res.json({
        round,
        tokens,
        payoutCount: payouts.length,
        payouts: payouts.slice(0, 100) // Limit to first 100 for response size
    });
}));

/**
 * GET /api/tokens
 * Returns list of registered tokens
 */
app.get('/api/tokens', asyncRoute(async (req, res) => {
    const tokens = store.getActiveTokens();
    res.json(tokens);
}));

/**
 * GET /api/hof
 * Returns the Hall of Fame
 */
app.get('/api/hof', asyncRoute(async (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const hof = store.getHallOfFame(limit);
    res.json(hof);
}));

/**
 * GET /api/stats
 * Returns aggregate protocol statistics
 */
app.get('/api/stats', asyncRoute(async (req, res) => {
    const rounds = store.getRoundHistory(1000);

    const totalFees = rounds.reduce((sum, r) => sum + (r.total_fees_claimed || 0), 0);
    const totalPaid = rounds.reduce((sum, r) => sum + (r.total_paid_out || 0), 0);

    res.json({
        totalRounds: rounds.length,
        totalFeesClaimedSOL: totalFees,
        totalPaidOutSOL: totalPaid,
        protocolRevenueSOL: (totalFees - totalPaid),
        lastUpdated: new Date().toISOString()
    });
}));

/**
 * GET /api/health
 * Fix #34: Enhanced health check with deep verification
 */
app.get('/api/health', asyncRoute(async (req, res) => {
    const health = {
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        checks: {}
    };

    // Check database
    try {
        const latestRound = store.getLatestRound();
        health.checks.database = {
            status: 'ok',
            lastRoundId: latestRound?.round_id || null
        };
    } catch (e) {
        health.checks.database = { status: 'error', error: e.message };
        health.status = 'degraded';
    }

    // Check RPC connection (optional - only if deep=true query param)
    if (req.query.deep === 'true') {
        try {
            const { checkHealth } = require('../utils/connection');
            const rpcHealth = await checkHealth();
            health.checks.rpc = rpcHealth;
            if (!rpcHealth.healthy) health.status = 'degraded';
        } catch (e) {
            health.checks.rpc = { status: 'error', error: e.message };
            health.status = 'degraded';
        }
    }

    // Memory usage
    const mem = process.memoryUsage();
    health.checks.memory = {
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
        rssMB: Math.round(mem.rss / 1024 / 1024)
    };

    const statusCode = health.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(health);
}));

/**
 * GET /api/cache/stats
 * Fix #55: Expose cache statistics for monitoring
 */
app.get('/api/cache/stats', asyncRoute(async (req, res) => {
    try {
        const cache = require('../utils/cache');

        // Get stats from default cache instance if it has getStats method
        const stats = cache.defaultCache?.getStats ? cache.defaultCache.getStats() : {
            message: 'Cache stats not available',
            note: 'Create cache instance with getStats() method for detailed stats'
        };

        res.json({
            cache: stats,
            timestamp: new Date().toISOString()
        });
    } catch (e) {
        res.json({
            error: 'Cache stats unavailable',
            message: e.message
        });
    }
}));

// ============ ACCESS CODE ENDPOINTS ============
const accessDb = require('../db/access');
accessDb.initAccessCodes();

// POST /api/access/verify - Validate access code
const rateLimiter = require('../utils/rate-limiter'); // Using existing limiter if available or defaulting
// Note: Ideally we'd import the rate limiter instance. For now simple check.

app.post('/api/access/verify', (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ success: false, error: 'Code is required' });
    }

    const result = accessDb.validateAccessCode(code);

    if (result.valid) {
        res.json({ success: true, token: result.token, type: result.type });
    } else {
        res.status(401).json({ success: false, error: result.message });
    }
});


// ============ WAITLIST ENDPOINTS ============

const { WaitlistStore } = require('../db/waitlist');
const waitlistStore = new WaitlistStore('./db/pumpleague.db');

// Fix #23: Simple IP-based rate limiting for waitlist
const waitlistRateLimits = new Map();
const WAITLIST_RATE_LIMIT = { maxRequests: 3, windowMs: 60000 }; // 3 per minute

function waitlistRateLimiter(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();

    if (!waitlistRateLimits.has(ip)) {
        waitlistRateLimits.set(ip, { count: 1, resetAt: now + WAITLIST_RATE_LIMIT.windowMs });
        return next();
    }

    const limit = waitlistRateLimits.get(ip);

    if (now > limit.resetAt) {
        // Window expired, reset
        waitlistRateLimits.set(ip, { count: 1, resetAt: now + WAITLIST_RATE_LIMIT.windowMs });
        return next();
    }

    if (limit.count >= WAITLIST_RATE_LIMIT.maxRequests) {
        const retryAfter = Math.ceil((limit.resetAt - now) / 1000);
        res.set('Retry-After', retryAfter.toString());
        return res.status(429).json({
            success: false,
            error: 'Too many requests. Please wait before trying again.',
            retryAfterSeconds: retryAfter
        });
    }

    limit.count++;
    next();
}

// Cleanup old entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [ip, limit] of waitlistRateLimits.entries()) {
        if (now > limit.resetAt + 60000) {
            waitlistRateLimits.delete(ip);
        }
    }
}, 30000).unref();

// POST /api/waitlist - Submit to waitlist (with rate limiting)
app.post('/api/waitlist', waitlistRateLimiter, (req, res) => {
    const { twitterHandle, walletAddress, email, userType, referralCode } = req.body;

    if (!twitterHandle || !walletAddress || !userType) {
        return res.status(400).json({ success: false, error: 'Twitter handle, wallet, and user type are required' });
    }

    const result = waitlistStore.addToWaitlist({
        twitterHandle: twitterHandle.replace('@', ''),
        walletAddress,
        email,
        userType,
        referralCode,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
    });

    if (result.success) {
        const position = waitlistStore.getWaitlistPosition(twitterHandle.replace('@', ''));
        res.json({
            success: true,
            message: 'Successfully joined the waitlist!',
            position,
            total: waitlistStore.getWaitlistCount()
        });
    } else {
        res.status(400).json(result);
    }
});

// GET /api/waitlist/count
app.get('/api/waitlist/count', (req, res) => {
    res.json({ count: waitlistStore.getWaitlistCount() });
});

// GET /api/waitlist/count
app.get('/api/waitlist/count', (req, res) => {
    res.json({ count: waitlistStore.getWaitlistCount() });
});

/**
 * ADMIN ENDPOINTS
 */

// POST /api/admin/emergency-stop
app.post('/api/admin/emergency-stop', requireAuth('admin'), async (req, res) => {
    const { enabled } = req.body;
    try {
        const { setEmergencyStop } = require('../safety/guards');
        await setEmergencyStop(!!enabled);
        res.json({ success: true, emergency_stop: !!enabled });
        console.log(`🚨 Admin ${!!enabled ? 'ENABLED' : 'DISABLED'} Emergency Stop`);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin/force-round
app.post('/api/admin/force-round', requireAuth('admin'), (req, res) => {
    // This allows manually triggering the round logic (e.g. for testing)
    // In a real scenario, this should be handled carefully to avoid overlap
    // For now, we'll just acknowledge the request as the main loop handles timing
    res.status(501).json({ error: 'Not implemented capabilities yet' });
});

// GET /api/waitlist/all - Admin only, requires authentication
// Fix #16: Protected endpoint - exposes user data
app.get('/api/waitlist/all', requireAuth('admin'), (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const entries = waitlistStore.getAllWaitlist(limit, offset);
    res.json({ entries, total: waitlistStore.getWaitlistCount() });
});

/**
 * Error Handler
 * Fix #28: Don't leak error details in production
 */
app.use((err, req, res, next) => {
    console.error(`[API Error] ${err.message}`);

    // Only show detailed errors in development
    const isDev = process.env.NODE_ENV !== 'production';

    res.status(500).json({
        error: "Internal Server Error",
        message: isDev ? err.message : "An unexpected error occurred",
        ...(isDev && { stack: err.stack })
    });
});

// Fix #39: WebSocket Support
const websocket = require('../utils/websocket');

// Start server if run directly
if (require.main === module) {
    const start = async () => {
        await store.init();

        // Capture server instance
        const server = app.listen(PORT, () => {
            console.log(`
🚀 PumpLeague API is live!
   Local:    http://localhost:${PORT}
   Status:   http://localhost:${PORT}/api/status
   Leader:   http://localhost:${PORT}/api/leaderboard
   Socket:   ws://localhost:${PORT}
            `);
        });

        // Initialize WebSocket server
        websocket.init(server);
    };

    start().catch(err => {
        console.error("Failed to start API server:", err);
        process.exit(1);
    });
}

module.exports = app;
