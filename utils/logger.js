/**
 * Structured Logger for PumpLeague
 * Fix #32: Implements structured logging with levels, timestamps, and context
 */

const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    FATAL: 4
};

const LEVEL_NAMES = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];
const LEVEL_COLORS = {
    DEBUG: '\x1b[36m',  // Cyan
    INFO: '\x1b[32m',   // Green
    WARN: '\x1b[33m',   // Yellow
    ERROR: '\x1b[31m',  // Red
    FATAL: '\x1b[35m',  // Magenta
    RESET: '\x1b[0m'
};

// Current log level (can be set via env)
let currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

class Logger {
    constructor(context = 'app') {
        this.context = context;
    }

    /**
     * Format log entry
     */
    formatEntry(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const levelName = LEVEL_NAMES[level];

        const entry = {
            timestamp,
            level: levelName,
            context: this.context,
            message,
            ...(data && { data })
        };

        return entry;
    }

    /**
     * Output log to console with colors
     */
    output(level, message, data = null) {
        if (level < currentLevel) return;

        const entry = this.formatEntry(level, message, data);
        const levelName = LEVEL_NAMES[level];
        const color = LEVEL_COLORS[levelName];
        const reset = LEVEL_COLORS.RESET;

        const prefix = `${color}[${entry.timestamp}] [${levelName}] [${this.context}]${reset}`;

        if (data) {
            console.log(`${prefix} ${message}`, typeof data === 'object' ? JSON.stringify(data) : data);
        } else {
            console.log(`${prefix} ${message}`);
        }

        // Also return structured entry for potential future streaming
        return entry;
    }

    debug(message, data = null) {
        return this.output(LOG_LEVELS.DEBUG, message, data);
    }

    info(message, data = null) {
        return this.output(LOG_LEVELS.INFO, message, data);
    }

    warn(message, data = null) {
        return this.output(LOG_LEVELS.WARN, message, data);
    }

    error(message, data = null) {
        return this.output(LOG_LEVELS.ERROR, message, data);
    }

    fatal(message, data = null) {
        return this.output(LOG_LEVELS.FATAL, message, data);
    }

    /**
     * Log with timing (for performance tracking)
     */
    time(label) {
        this._timers = this._timers || {};
        this._timers[label] = Date.now();
    }

    timeEnd(label, message = null) {
        if (!this._timers?.[label]) return;
        const duration = Date.now() - this._timers[label];
        delete this._timers[label];
        this.info(message || `${label} completed`, { durationMs: duration });
        return duration;
    }

    /**
     * Create child logger with additional context
     */
    child(subContext) {
        return new Logger(`${this.context}:${subContext}`);
    }
}

/**
 * Set global log level
 */
function setLogLevel(level) {
    if (typeof level === 'string') {
        currentLevel = LOG_LEVELS[level.toUpperCase()] ?? LOG_LEVELS.INFO;
    } else {
        currentLevel = level;
    }
}

/**
 * Get current log level
 */
function getLogLevel() {
    return LEVEL_NAMES[currentLevel];
}

// Default logger instance
const defaultLogger = new Logger('pumpleague');

module.exports = {
    Logger,
    setLogLevel,
    getLogLevel,
    LOG_LEVELS,
    // Convenience methods on default logger
    debug: (msg, data) => defaultLogger.debug(msg, data),
    info: (msg, data) => defaultLogger.info(msg, data),
    warn: (msg, data) => defaultLogger.warn(msg, data),
    error: (msg, data) => defaultLogger.error(msg, data),
    fatal: (msg, data) => defaultLogger.fatal(msg, data),
    time: (label) => defaultLogger.time(label),
    timeEnd: (label, msg) => defaultLogger.timeEnd(label, msg),
    child: (ctx) => defaultLogger.child(ctx)
};
