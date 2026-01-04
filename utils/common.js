/**
 * Common Utilities for PumpLeague
 * Fix #52: Consolidated shared utility functions
 */

/**
 * Sleep for a specified number of milliseconds
 * Consolidated from multiple files where it was duplicated
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelayMs - Base delay in milliseconds
 * @returns {Promise<any>}
 */
async function retry(fn, maxRetries = 3, baseDelayMs = 1000) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (attempt < maxRetries) {
                const delay = baseDelayMs * Math.pow(2, attempt - 1);
                const jitter = Math.random() * delay * 0.1;
                await sleep(delay + jitter);
            }
        }
    }

    throw lastError;
}

/**
 * Format SOL amount with proper decimals
 * @param {number} lamports - Amount in lamports
 * @returns {string}
 */
function formatSOL(lamports) {
    return (lamports / 1e9).toFixed(6) + ' SOL';
}

/**
 * Truncate address for display
 * @param {string} address - Full address
 * @param {number} chars - Characters to show on each end
 * @returns {string}
 */
function truncateAddress(address, chars = 4) {
    if (!address || address.length < chars * 2 + 3) return address;
    return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Rate limiter token bucket
 */
class TokenBucket {
    constructor(maxTokens, refillRate) {
        this.maxTokens = maxTokens;
        this.tokens = maxTokens;
        this.refillRate = refillRate; // tokens per second
        this.lastRefill = Date.now();
    }

    refill() {
        const now = Date.now();
        const elapsed = (now - this.lastRefill) / 1000;
        this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
        this.lastRefill = now;
    }

    tryConsume(tokens = 1) {
        this.refill();
        if (this.tokens >= tokens) {
            this.tokens -= tokens;
            return true;
        }
        return false;
    }
}

module.exports = {
    sleep,
    retry,
    formatSOL,
    truncateAddress,
    TokenBucket
};
