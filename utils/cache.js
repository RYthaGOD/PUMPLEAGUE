/**
 * Smart Cache System
 * 
 * Multi-tier caching with TTL to reduce API calls while maintaining data freshness
 */

class SmartCache {
    constructor() {
        this.caches = {
            // Market data (short TTL - 30 seconds for real-time feel)
            marketData: new Map(),
            marketDataTTL: 30 * 1000,

            // Token metadata (long TTL - 1 hour, rarely changes)
            metadata: new Map(),
            metadataTTL: 60 * 60 * 1000,

            // AI responses (medium TTL - 5 minutes, context-dependent)
            aiResponses: new Map(),
            aiResponsesTTL: 5 * 60 * 1000,

            // Batch requests (very short TTL - 10 seconds, for deduplication)
            batchRequests: new Map(),
            batchRequestsTTL: 10 * 1000
        };

        // Track cache stats
        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0
        };

        // Max cache sizes (LRU eviction)
        this.maxSizes = {
            marketData: 100,
            metadata: 500,
            aiResponses: 50,
            batchRequests: 20
        };

        // Start cleanup interval
        this.startCleanup();
    }

    /**
     * Get cached value if fresh
     */
    get(cacheType, key) {
        const cache = this.caches[cacheType];
        if (!cache) return null;

        const entry = cache.get(key);
        if (!entry) {
            this.stats.misses++;
            return null;
        }

        const ttl = this.caches[`${cacheType}TTL`];
        const age = Date.now() - entry.timestamp;

        if (age > ttl) {
            // Expired
            cache.delete(key);
            this.stats.misses++;
            return null;
        }

        this.stats.hits++;
        entry.lastAccess = Date.now();
        return entry.value;
    }

    /**
     * Set cache value
     */
    set(cacheType, key, value) {
        const cache = this.caches[cacheType];
        if (!cache) return;

        // LRU eviction if at max size
        const maxSize = this.maxSizes[cacheType];
        if (cache.size >= maxSize) {
            this.evictLRU(cacheType);
        }

        cache.set(key, {
            value,
            timestamp: Date.now(),
            lastAccess: Date.now()
        });
    }

    /**
     * Evict least recently used entry
     */
    evictLRU(cacheType) {
        const cache = this.caches[cacheType];
        let oldestKey = null;
        let oldestTime = Infinity;

        for (const [key, entry] of cache.entries()) {
            if (entry.lastAccess < oldestTime) {
                oldestTime = entry.lastAccess;
                oldestKey = key;
            }
        }

        if (oldestKey) {
            cache.delete(oldestKey);
            this.stats.evictions++;
        }
    }

    /**
     * Clear expired entries
     */
    cleanup() {
        for (const [cacheType, cache] of Object.entries(this.caches)) {
            if (typeof cache !== 'object' || !(cache instanceof Map)) continue;

            const ttl = this.caches[`${cacheType}TTL`];
            if (!ttl) continue;

            const now = Date.now();
            for (const [key, entry] of cache.entries()) {
                if (now - entry.timestamp > ttl) {
                    cache.delete(key);
                }
            }
        }
    }

    /**
     * Start periodic cleanup
     */
    startCleanup() {
        this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000); // Every minute
        this.cleanupInterval.unref(); // Don't prevent process from exiting
    }

    /**
     * Stop cleanup interval (for graceful shutdown)
     */
    stopCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    /**
     * Get cache statistics
     */
    getStats() {
        const total = this.stats.hits + this.stats.misses;
        const hitRate = total > 0 ? (this.stats.hits / total * 100).toFixed(1) : 0;

        return {
            ...this.stats,
            hitRate: `${hitRate}%`,
            sizes: Object.fromEntries(
                Object.entries(this.caches)
                    .filter(([k, v]) => v instanceof Map)
                    .map(([k, v]) => [k, v.size])
            )
        };
    }

    /**
     * Clear all caches
     */
    clear() {
        for (const cache of Object.values(this.caches)) {
            if (cache instanceof Map) {
                cache.clear();
            }
        }
        this.stats = { hits: 0, misses: 0, evictions: 0 };
    }
}

// Singleton instance
const cache = new SmartCache();

module.exports = cache;
