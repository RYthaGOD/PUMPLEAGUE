const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const config = require('../config');

// Ensure db directory exists
const dbDir = path.dirname(config.dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let db = null;

// Schema SQL
const SCHEMA_SQL = `
  -- Rounds table
  CREATE TABLE IF NOT EXISTS rounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id TEXT UNIQUE NOT NULL,
    snapshot_slot INTEGER NOT NULL,
    snapshot_timestamp INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    total_fees_claimed REAL DEFAULT 0,
    total_paid_out REAL DEFAULT 0,
    arena_fee REAL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT
  );

  -- Token stats at snapshot time
  CREATE TABLE IF NOT EXISTS round_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id TEXT NOT NULL,
    token_mint TEXT NOT NULL,
    holder_count INTEGER DEFAULT 0,
    total_supply REAL DEFAULT 0,
    liquidity REAL DEFAULT 0,
    volume_24h REAL DEFAULT 0,
    price_change_24h REAL DEFAULT 0,
    pre_claim_balance REAL DEFAULT 0,
    post_claim_balance REAL DEFAULT 0,
    claimed_fees REAL DEFAULT 0,
    score REAL DEFAULT 0,
    rank INTEGER,
    fraud_flags TEXT,
    penalty_multiplier REAL DEFAULT 1.0,
    is_active INTEGER DEFAULT 0, -- 1 if fees successfully claimed
    FOREIGN KEY(round_id) REFERENCES rounds(round_id),
    UNIQUE(round_id, token_mint)
  );

  -- All holders snapshot
  CREATE TABLE IF NOT EXISTS round_holders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id TEXT NOT NULL,
    token_mint TEXT NOT NULL,
    holder_address TEXT NOT NULL,
    token_account TEXT,
    balance REAL NOT NULL,
    share_percent REAL DEFAULT 0,
    payout_lamports INTEGER DEFAULT 0,
    payout_sol REAL DEFAULT 0,
    payout_tx TEXT,
    paid_at TEXT,
    FOREIGN KEY(round_id) REFERENCES rounds(round_id),
    UNIQUE(round_id, token_mint, holder_address)
  );

  -- Registered tokens
  CREATE TABLE IF NOT EXISTS registered_tokens (
    token_mint TEXT PRIMARY KEY,
    creator_wallet TEXT,
    name TEXT,
    symbol TEXT,
    registered_at TEXT DEFAULT CURRENT_TIMESTAMP,
    active INTEGER DEFAULT 1
  );

  -- Payout history (for proof-of-payout)
  CREATE TABLE IF NOT EXISTS payouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id TEXT NOT NULL,
    token_mint TEXT NOT NULL,
    holder_address TEXT NOT NULL,
    amount_sol REAL NOT NULL,
    tx_signature TEXT UNIQUE NOT NULL,
    confirmed_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(round_id) REFERENCES rounds(round_id)
  );

  -- Hall of Fame (aggregated stats)
  CREATE TABLE IF NOT EXISTS hall_of_fame (
    token_mint TEXT PRIMARY KEY,
    total_wins INTEGER DEFAULT 0,
    total_top3 INTEGER DEFAULT 0,
    total_fees_earned REAL DEFAULT 0,
    avg_score REAL DEFAULT 0,
    last_win_round TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Create indexes for performance
  CREATE INDEX IF NOT EXISTS idx_rounds_status ON rounds(status);
  CREATE INDEX IF NOT EXISTS idx_round_tokens_round ON round_tokens(round_id);
  CREATE INDEX IF NOT EXISTS idx_round_holders_round ON round_holders(round_id);
  CREATE INDEX IF NOT EXISTS idx_payouts_round ON payouts(round_id);
`;

/**
 * Initialize the database (async)
 */
async function initDatabase() {
  if (db) return db;

  const SQL = await initSqlJs();

  // Load existing database or create new
  if (fs.existsSync(config.dbPath)) {
    const buffer = fs.readFileSync(config.dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Run schema
  db.run(SCHEMA_SQL);

  // Migration: Add is_active to round_tokens if not exists
  try {
    db.run("ALTER TABLE round_tokens ADD COLUMN is_active INTEGER DEFAULT 0;");
    console.log("🛠️ Mirgrated: Added is_active to round_tokens");
  } catch (e) {
    // Column likely already exists
  }

  // Initialize API keys and webhooks tables
  const apiKeys = require('./api-keys');
  const webhooks = require('./webhooks');

  apiKeys.initApiKeysTables(db);
  webhooks.initWebhooksTables(db);

  saveDatabase();

  console.log('✅ Database schema initialized (including API keys & webhooks)');
  return db;
}

/**
 * Save database to file
 */
function saveDatabase() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(config.dbPath, buffer);
}

/**
 * Get database instance (sync, must be initialized first)
 */
function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Helper: Run a query and return results
 */
function query(sql, params = []) {
  const result = getDb().exec(sql, params);
  if (result.length === 0) return [];

  const columns = result[0].columns;
  return result[0].values.map(row => {
    const obj = {};
    columns.forEach((col, i) => obj[col] = row[i]);
    return obj;
  });
}

/**
 * Helper: Run a query and return first row
 */
function queryOne(sql, params = []) {
  const results = query(sql, params);
  return results[0] || null;
}

/**
 * Helper: Run a statement (INSERT/UPDATE/DELETE)
 */
function run(sql, params = []) {
  getDb().run(sql, params);
  saveDatabase();
  return { changes: getDb().getRowsModified() };
}

// Auto-initialize on first require
let initPromise = null;

function ensureInit() {
  if (!initPromise) {
    initPromise = initDatabase();
  }
  return initPromise;
}

module.exports = {
  initDatabase,
  ensureInit,
  getDb,
  query,
  queryOne,
  run,
  saveDatabase
};
