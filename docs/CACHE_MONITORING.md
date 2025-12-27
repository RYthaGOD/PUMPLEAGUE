/**
 * Cache & Rate Limiter Monitoring Endpoint
 * Add this to api/server.js
 */

// GET /api/cache-stats - Cache and rate limiter statistics
app.get('/api/cache-stats', (req, res) => {
    const cache = require('../utils/cache');
    const rateLimiter = require('../utils/rate-limiter');

    res.json({
        cache: cache.getStats(),
        rateLimiter: rateLimiter.getStatus(),
        timestamp: new Date().toISOString()
    });
});
