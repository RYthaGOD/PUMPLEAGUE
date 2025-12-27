/**
 * Rate Limiter
 * 
 * Token bucket algorithm with per-service limits
 */

class RateLimiter {
    constructor() {
        this.buckets = {
            // DexScreener: 300 requests/minute
            dexscreener: {
                capacity: 300,
                tokens: 300,
                refillRate: 5, // tokens per second (300/60)
                lastRefill: Date.now(),
                queue: []
            },

            // Gemini AI: 60 requests/minute (free tier)
            gemini: {
                capacity: 60,
                tokens: 60,
                refillRate: 1, // tokens per second (60/60)
                lastRefill: Date.now(),
                queue: []
            },

            // PumpPortal: Conservative limit
            pumpportal: {
                capacity: 30,
                tokens: 30,
                refillRate: 0.5, // tokens per second (30/60)
                lastRefill: Date.now(),
                queue: []
            }
        };

        // Start refill interval
        this.startRefill();
    }

    /**
     * Refill tokens based on elapsed time
     */
    refill(service) {
        const bucket = this.buckets[service];
        if (!bucket) return;

        const now = Date.now();
        const elapsed = (now - bucket.lastRefill) / 1000; // seconds
        const tokensToAdd = elapsed * bucket.refillRate;

        bucket.tokens = Math.min(bucket.capacity, bucket.tokens + tokensToAdd);
        bucket.lastRefill = now;
    }

    /**
     * Try to acquire a token
     */
    async acquire(service, cost = 1) {
        const bucket = this.buckets[service];
        if (!bucket) {
            // Unknown service, allow immediately
            return true;
        }

        this.refill(service);

        if (bucket.tokens >= cost) {
            bucket.tokens -= cost;
            return true;
        }

        // Not enough tokens, calculate wait time
        const tokensNeeded = cost - bucket.tokens;
        const waitMs = (tokensNeeded / bucket.refillRate) * 1000;

        console.log(`⏳ Rate limit: waiting ${Math.ceil(waitMs / 1000)}s for ${service}...`);

        await this.sleep(waitMs);

        // Try again after waiting
        this.refill(service);
        if (bucket.tokens >= cost) {
            bucket.tokens -= cost;
            return true;
        }

        return false;
    }

    /**
     * Execute function with rate limiting
     */
    async execute(service, fn, cost = 1) {
        await this.acquire(service, cost);
        return await fn();
    }

    /**
     * Get current token counts
     */
    getStatus() {
        const status = {};
        for (const [service, bucket] of Object.entries(this.buckets)) {
            this.refill(service);
            status[service] = {
                available: Math.floor(bucket.tokens),
                capacity: bucket.capacity,
                percentage: Math.floor((bucket.tokens / bucket.capacity) * 100)
            };
        }
        return status;
    }

    /**
     * Start periodic refill
     */
    startRefill() {
        setInterval(() => {
            for (const service of Object.keys(this.buckets)) {
                this.refill(service);
            }
        }, 1000); // Refill every second
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Singleton instance
const rateLimiter = new RateLimiter();

module.exports = rateLimiter;
