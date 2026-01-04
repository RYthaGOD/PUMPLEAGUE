/**
 * Access Codes Module
 * 
 * Manages access codes for gated entry to the platform.
 * Fixed to use schema.js instead of non-existent database.js
 */

const { query, queryOne, run, getDb } = require('./schema');
const crypto = require('crypto');

// Initialize the access_codes table
const initAccessCodes = () => {
    run(`
        CREATE TABLE IF NOT EXISTS access_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            type TEXT DEFAULT 'standard',
            uses_remaining INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME
        )
    `);

    // Create a default master code for testing if none exist
    const result = queryOne("SELECT count(*) as count FROM access_codes");

    if (result && result.count === 0) {
        // "ARENA-ALPHA" | Unlimited uses (9999) | Expires in 1 year
        const nextYear = new Date();
        nextYear.setFullYear(nextYear.getFullYear() + 1);
        run(`
            INSERT INTO access_codes (code, type, uses_remaining, expires_at)
            VALUES (?, ?, ?, ?)
        `, ['ARENA-ALPHA', 'admin', 9999, nextYear.toISOString()]);
        console.log('Initialized default access code: ARENA-ALPHA');
    }
};

// Validate and consume a code
const validateAccessCode = (code) => {
    try {
        const accessCode = queryOne(`
            SELECT * FROM access_codes 
            WHERE code = ? 
            AND uses_remaining > 0 
            AND (expires_at IS NULL OR expires_at > datetime('now'))
        `, [code]);

        if (!accessCode) {
            return { valid: false, message: 'Invalid or expired code.' };
        }

        // Decrement use count
        run(`
            UPDATE access_codes 
            SET uses_remaining = uses_remaining - 1 
            WHERE id = ?
        `, [accessCode.id]);

        // Generate secure session token using crypto instead of weak Math.random
        const token = `gladiator_${Date.now()}_${crypto.randomBytes(16).toString('hex')}`;

        return {
            valid: true,
            type: accessCode.type,
            token
        };

    } catch (error) {
        console.error('Error validating access code:', error);
        return { valid: false, message: 'System error.' };
    }
};

/**
 * Create a new access code
 */
const createAccessCode = (code, type = 'standard', uses = 1, expiresInDays = 30) => {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    run(`
        INSERT INTO access_codes (code, type, uses_remaining, expires_at)
        VALUES (?, ?, ?, ?)
    `, [code, type, uses, expiresAt.toISOString()]);

    return { success: true, code, type, uses, expiresAt };
};

/**
 * Generate a random access code
 */
const generateAccessCode = (type = 'standard', uses = 1, expiresInDays = 30) => {
    const code = `ARENA-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    return createAccessCode(code, type, uses, expiresInDays);
};

module.exports = {
    initAccessCodes,
    validateAccessCode,
    createAccessCode,
    generateAccessCode
};
