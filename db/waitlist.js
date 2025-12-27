/**
 * Waitlist Database Schema
 * Stores early access signups for PumpLeague
 */

const Database = require('better-sqlite3');
const path = require('path');

function initWaitlistSchema(db) {
    // Create waitlist table
    db.exec(`
        CREATE TABLE IF NOT EXISTS waitlist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            twitter_handle TEXT NOT NULL,
            wallet_address TEXT NOT NULL,
            email TEXT,
            user_type TEXT NOT NULL,
            referral_code TEXT,
            submitted_at INTEGER NOT NULL,
            ip_address TEXT,
            user_agent TEXT,
            verified INTEGER DEFAULT 0,
            notified INTEGER DEFAULT 0,
            UNIQUE(twitter_handle),
            UNIQUE(wallet_address)
        )
    `);

    // Create index for faster lookups
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_waitlist_submitted 
        ON waitlist(submitted_at DESC)
    `);

    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_waitlist_verified 
        ON waitlist(verified, submitted_at DESC)
    `);

    console.log('✅ Waitlist schema initialized');
}

// Waitlist data access functions
class WaitlistStore {
    constructor(dbPath) {
        this.db = new Database(dbPath);
        initWaitlistSchema(this.db);
    }

    addToWaitlist(data) {
        const stmt = this.db.prepare(`
            INSERT INTO waitlist (
                twitter_handle, 
                wallet_address, 
                email,
                user_type,
                referral_code,
                submitted_at,
                ip_address,
                user_agent
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        try {
            const result = stmt.run(
                data.twitterHandle,
                data.walletAddress,
                data.email || null,
                data.userType,
                data.referralCode || null,
                Date.now(),
                data.ipAddress || null,
                data.userAgent || null
            );
            return { success: true, id: result.lastInsertRowid };
        } catch (error) {
            if (error.message.includes('UNIQUE constraint')) {
                return { success: false, error: 'Twitter handle or wallet already registered' };
            }
            return { success: false, error: error.message };
        }
    }

    getWaitlistCount() {
        const stmt = this.db.prepare('SELECT COUNT(*) as count FROM waitlist');
        return stmt.get().count;
    }

    getWaitlistPosition(twitterHandle) {
        const stmt = this.db.prepare(`
            SELECT COUNT(*) + 1 as position 
            FROM waitlist 
            WHERE submitted_at < (
                SELECT submitted_at 
                FROM waitlist 
                WHERE twitter_handle = ?
            )
        `);
        return stmt.get(twitterHandle)?.position || null;
    }

    getAllWaitlist(limit = 100, offset = 0) {
        const stmt = this.db.prepare(`
            SELECT 
                id,
                twitter_handle,
                wallet_address,
                email,
                user_type,
                submitted_at,
                verified,
                notified
            FROM waitlist
            ORDER BY submitted_at ASC
            LIMIT ? OFFSET ?
        `);
        return stmt.all(limit, offset);
    }

    verifyEntry(id) {
        const stmt = this.db.prepare('UPDATE waitlist SET verified = 1 WHERE id = ?');
        return stmt.run(id);
    }

    markNotified(id) {
        const stmt = this.db.prepare('UPDATE waitlist SET notified = 1 WHERE id = ?');
        return stmt.run(id);
    }

    checkExists(twitterHandle, walletAddress) {
        const stmt = this.db.prepare(`
            SELECT id FROM waitlist 
            WHERE twitter_handle = ? OR wallet_address = ?
        `);
        return stmt.get(twitterHandle, walletAddress) !== undefined;
    }
}

module.exports = { initWaitlistSchema, WaitlistStore };
