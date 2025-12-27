/**
 * PumpLeague Public REST API
 * 
 * Exposes protocol data for the landing page and public monitoring.
 */

const express = require('express');
const cors = require('cors');
const store = require('../db/store');
const config = require('../config');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Helper to wrap async routes
const asyncRoute = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

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
 */
app.get('/api/rounds', asyncRoute(async (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const rounds = store.getRoundHistory(limit);
    res.json(rounds);
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
 * Basic health check
 */
app.get('/api/health', (req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
});

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

// POST /api/waitlist - Submit to waitlist
app.post('/api/waitlist', (req, res) => {
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

// GET /api/waitlist/all
app.get('/api/waitlist/all', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const entries = waitlistStore.getAllWaitlist(limit, offset);
    res.json({ entries, total: waitlistStore.getWaitlistCount() });
});

/**
 * Error Handler
 */
app.use((err, req, res, next) => {
    console.error(`[API Error] ${err.message}`);
    res.status(500).json({
        error: "Internal Server Error",
        message: err.message
    });
});

// Start server if run directly
if (require.main === module) {
    const start = async () => {
        await store.init();
        app.listen(PORT, () => {
            console.log(`
🚀 PumpLeague API is live!
   Local:    http://localhost:${PORT}
   Status:   http://localhost:${PORT}/api/status
   Leader:   http://localhost:${PORT}/api/leaderboard
            `);
        });
    };

    start().catch(err => {
        console.error("Failed to start API server:", err);
        process.exit(1);
    });
}

module.exports = app;
