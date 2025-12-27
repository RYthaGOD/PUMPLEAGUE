const db = require('./database');

// Initialize the access_codes table
const initAccessCodes = () => {
    const stmt = db.prepare(`
        CREATE TABLE IF NOT EXISTS access_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            type TEXT DEFAULT 'standard', -- 'standard', 'vip', 'admin'
            uses_remaining INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME
        )
    `);
    stmt.run();

    // Create a default master code for testing if none exist
    const checkStmt = db.prepare("SELECT count(*) as count FROM access_codes");
    const result = checkStmt.get();

    if (result.count === 0) {
        const insert = db.prepare(`
            INSERT INTO access_codes (code, type, uses_remaining, expires_at)
            VALUES (?, ?, ?, ?)
        `);
        // "ARENA-ALPHA" | Unlimited uses (9999) | Expires in 1 year
        const nextYear = new Date();
        nextYear.setFullYear(nextYear.getFullYear() + 1);
        insert.run('ARENA-ALPHA', 'admin', 9999, nextYear.toISOString());
        console.log('Initialized default access code: ARENA-ALPHA');
    }
};

// Validate and consume a code
const validateAccessCode = (code) => {
    try {
        const stmt = db.prepare(`
            SELECT * FROM access_codes 
            WHERE code = ? 
            AND uses_remaining > 0 
            AND (expires_at IS NULL OR expires_at > datetime('now'))
        `);
        const accessCode = stmt.get(code);

        if (!accessCode) {
            return { valid: false, message: 'Invalid or expired code.' };
        }

        // Decrement use count
        const update = db.prepare(`
            UPDATE access_codes 
            SET uses_remaining = uses_remaining - 1 
            WHERE id = ?
        `);
        update.run(accessCode.id);

        return {
            valid: true,
            type: accessCode.type,
            token: `gladiator_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` // Simple session token
        };

    } catch (error) {
        console.error('Error validating access code:', error);
        return { valid: false, message: 'System error.' };
    }
};

module.exports = {
    initAccessCodes,
    validateAccessCode
};
