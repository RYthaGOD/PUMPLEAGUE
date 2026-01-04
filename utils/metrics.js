/**
 * Metrics Collection Module
 * Fix #38: Collect and expose operational metrics
 */

const store = require('../db/store');

// In-memory metrics storage
const metrics = {
    rounds: {
        total: 0,
        successful: 0,
        failed: 0,
        lastDurationMs: 0,
        avgDurationMs: 0
    },
    payouts: {
        total: 0,
        totalSOL: 0,
        failed: 0
    },
    api: {
        requests: 0,
        errors: 0,
        avgLatencyMs: 0
    },
    system: {
        startTime: Date.now(),
        lastRoundAt: null
    }
};

// Running averages
let roundDurations = [];
let apiLatencies = [];
const MAX_SAMPLES = 100;

/**
 * Record a round completion
 */
function recordRound(durationMs, success = true) {
    metrics.rounds.total++;
    if (success) {
        metrics.rounds.successful++;
    } else {
        metrics.rounds.failed++;
    }

    metrics.rounds.lastDurationMs = durationMs;
    metrics.system.lastRoundAt = new Date().toISOString();

    // Calculate rolling average
    roundDurations.push(durationMs);
    if (roundDurations.length > MAX_SAMPLES) {
        roundDurations.shift();
    }
    metrics.rounds.avgDurationMs = Math.round(
        roundDurations.reduce((a, b) => a + b, 0) / roundDurations.length
    );
}

/**
 * Record a payout
 */
function recordPayout(amountSOL, success = true) {
    metrics.payouts.total++;
    metrics.payouts.totalSOL += amountSOL;
    if (!success) {
        metrics.payouts.failed++;
    }
}

/**
 * Record an API request
 */
function recordApiRequest(latencyMs, isError = false) {
    metrics.api.requests++;
    if (isError) {
        metrics.api.errors++;
    }

    // Calculate rolling average latency
    apiLatencies.push(latencyMs);
    if (apiLatencies.length > MAX_SAMPLES) {
        apiLatencies.shift();
    }
    metrics.api.avgLatencyMs = Math.round(
        apiLatencies.reduce((a, b) => a + b, 0) / apiLatencies.length
    );
}

/**
 * Get current metrics snapshot
 */
function getMetrics() {
    const mem = process.memoryUsage();

    return {
        ...metrics,
        system: {
            ...metrics.system,
            uptime: Math.round((Date.now() - metrics.system.startTime) / 1000),
            memoryMB: {
                heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
                heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
                rss: Math.round(mem.rss / 1024 / 1024)
            }
        },
        timestamp: new Date().toISOString()
    };
}

/**
 * Reset metrics (for testing)
 */
function resetMetrics() {
    metrics.rounds = { total: 0, successful: 0, failed: 0, lastDurationMs: 0, avgDurationMs: 0 };
    metrics.payouts = { total: 0, totalSOL: 0, failed: 0 };
    metrics.api = { requests: 0, errors: 0, avgLatencyMs: 0 };
    roundDurations = [];
    apiLatencies = [];
}

module.exports = {
    recordRound,
    recordPayout,
    recordApiRequest,
    getMetrics,
    resetMetrics
};
