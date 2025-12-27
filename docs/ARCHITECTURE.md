# PumpLeague System Architecture

## Overview
PumpLeague is an autonomous token competition protocol on Solana that runs 24-hour rounds, claims creator fees, scores tokens based on multiple metrics, and distributes SOL rewards to holders.

---

## System Components

### 1. Core Engine (`index.js`)
**Purpose:** Main orchestrator that manages the competition lifecycle

**Key Functions:**
- Initialize database and wallet
- Resume incomplete rounds on startup
- Schedule and execute 24-hour rounds
- Coordinate all subsystems

**Flow:**
```
START → Load Config → Init DB → Load Wallet → Resume Incomplete Rounds → Start Round Loop
```

---

### 2. Database Layer (`db/`)

#### `schema.js`
- Creates SQLite database with 6 tables
- Tables: `rounds`, `registered_tokens`, `token_snapshots`, `holders`, `payouts`, `fraud_flags`

#### `store.js`
- Data access layer with 40+ functions
- Handles all CRUD operations
- Manages round state transitions

**Key Tables:**
```sql
rounds: round_id, status, snapshot_slot, total_fees_claimed, total_paid_out
token_snapshots: round_id, token_mint, holder_count, total_supply, volume_24h
holders: round_id, token_mint, wallet_address, balance
payouts: round_id, wallet_address, amount_sol, tx_signature
```

---

### 3. Competition Lifecycle

#### Phase 1: Snapshot (`core/snapshot.js`)
**Trigger:** Every 24 hours (configurable)

**Process:**
1. Create new round record
2. Fetch market data from DexScreener for all registered tokens
3. Index all token holders from Solana blockchain
4. Save snapshot to database

**Output:** Frozen state of all tokens at specific slot

```javascript
// Snapshot data structure
{
  roundId: "R20251225_1234567890",
  slot: 123456789,
  tokens: [
    {
      token_mint: "ABC...",
      holder_count: 1250,
      total_supply: 1000000000,
      volume_24h: 50000,
      liquidity: 25000
    }
  ]
}
```

#### Phase 2: Fee Claiming (`core/fees.js`)
**Trigger:** After snapshot completes

**Process:**
1. For each registered token, call PumpPortal API to claim creator fees
2. Measure arena wallet balance before/after each claim
3. Record actual SOL received per token
4. Mark tokens as "active" (claimed fees) or "passive" (monitoring only)

**Key Logic:**
```javascript
// Active tokens get 2x score boost
isActive = claimedFees > 0
```

#### Phase 3: Scoring (`game/scoring.js`)
**Trigger:** After fee claiming completes

**Process:**
1. Calculate composite score for each token:
   - **30%** Fees claimed
   - **25%** Holder count
   - **20%** 24h volume
   - **15%** Price stability
   - **10%** Growth rate

2. Apply fraud penalties (if detected)
3. Apply active boost (2x for fee-claiming tokens)
4. Normalize scores 0-100

**Formula:**
```javascript
score = (
  fees * 0.30 +
  holders * 0.25 +
  volume * 0.20 +
  stability * 0.15 +
  growth * 0.10
) * activeBoost * fraudPenalty
```

#### Phase 4: Fraud Detection (`game/antifraud.js`)
**Trigger:** During scoring phase

**Checks:**
- Top 3 wallets concentration > 80%
- Holder count < 20
- Fee-to-volume ratio suspicious
- AI analysis (if enabled)

**Penalties:**
- Concentration: 0.5x score
- Low holders: 0.7x score
- High risk: 0.3x score

#### Phase 5: Payout Distribution (`payout/executor.js`)
**Trigger:** After scoring completes

**Process:**
1. Rank tokens by final score
2. Select top N winners (default: 3)
3. Calculate fee distribution:
   - 85% → Token holders (proportional to holdings)
   - 10% → Arena wallet
   - 5% → Next round prize pool

4. Execute SOL transfers to all qualifying holders
5. Generate proof-of-payout with transaction signatures

**Safety Checks:**
- Max payout per holder: 10 SOL
- Max payout per round: 100 SOL
- Min payout: 5000 lamports (skip dust)
- Never drain arena below 0.5 SOL

#### Phase 6: Proof Generation (`payout/proof.js`)
**Trigger:** After payouts complete

**Output:** JSON proof file with:
- Round metadata
- Winner list with scores
- All payout transactions
- Solana Explorer links

---

### 4. External Integrations

#### DexScreener (`external/dexscreener.js`)
**Purpose:** Real-time market data

**Endpoints:**
- `/tokens/v1/solana/{mint}` - Single token
- `/tokens/v1/solana/{mint1},{mint2},...` - Batch (up to 30)

**Data Retrieved:**
- Price (USD)
- 24h volume
- 24h price change
- Liquidity
- Market cap

**Rate Limits:** 300 requests/minute

#### PumpPortal (`external/pumpportal.js`)
**Purpose:** Token metadata and fee claiming

**Endpoints:**
- `/api/data/token-info?mint={mint}` - Metadata
- `/api/trade` - Fee claiming (via `external/api.js`)

**Fee Claiming:**
```javascript
POST /api/trade?api-key={key}
{
  "action": "collectCreatorFee",
  "pool": "pump",
  "mint": "token_address" // optional for pump.fun
}
```

#### Gemini AI (`ai/gemini.js`)
**Purpose:** Autonomous commentary and fraud analysis

**Capabilities:**
- Generate round completion tweets
- Analyze tokens for fraud risk
- Provide market commentary
- Quality-score new tokens for auto-registration

**Model:** `gemini-2.0-flash`

---

### 5. Autonomous Agent (`ai/agent.js`)

**Decision Loop:** Runs every 30 minutes

**Actions:**
1. **Round Completion Handler**
   - Generate AI commentary about winners
   - Post tweet (if autopilot enabled)
   - Pitch passive tokens to join

2. **Daily Summary**
   - Aggregate all completed rounds
   - Post daily recap

3. **Token Discovery** (`discovery/trend.js`)
   - Search DexScreener for trending tokens
   - AI quality assessment (1-10 score)
   - Auto-register if score ≥ 7
   - Limit: 20 tokens/day

**Memory System:** (`ai/memory.js`)
- Persistent JSON storage
- Tracks last actions, flagged wallets, events
- Prevents duplicate tweets

---

### 6. API Server (`api/server.js`)

**Endpoints:**
```
GET  /api/status          - Protocol health
GET  /api/leaderboard     - Current round rankings
GET  /api/rounds          - Round history
GET  /api/rounds/:id      - Specific round details
GET  /api/hof             - Hall of fame (all-time winners)
GET  /api/proof/:roundId  - Payout proof
GET  /api/stats           - Aggregate statistics
```

**Frontend:** Serves static files from `/public`

---

### 7. API Authentication System (`db/api-keys.js`, `middleware/auth.js`)

**Purpose:** Secure API access with tiered permissions

#### API Key Tiers

| Tier | Rate Limit | Permissions |
|------|------------|-------------|
| `public` | 100/hour | Read-only public endpoints |
| `integration` | 1000/hour | Full API access, webhook management |
| `admin` | 5000/hour | Key management, system configuration |

#### Key Storage

```sql
CREATE TABLE api_keys (
    key_id TEXT PRIMARY KEY,
    key_hash TEXT NOT NULL,        -- SHA256 hash of API key
    name TEXT NOT NULL,
    tier TEXT NOT NULL,
    rate_limit INTEGER DEFAULT 1000,
    is_active INTEGER DEFAULT 1,
    created_at INTEGER,
    last_used_at INTEGER,
    metadata TEXT                  -- JSON
);

CREATE TABLE api_usage (
    id INTEGER PRIMARY KEY,
    key_id TEXT,
    endpoint TEXT,
    method TEXT,
    status_code INTEGER,
    ip_address TEXT,
    user_agent TEXT,
    timestamp INTEGER
);
```

#### Authentication Flow

```
Request → Extract X-API-Key header 
        → Hash key with SHA256 
        → Lookup in database 
        → Check is_active 
        → Check rate limit 
        → Attach key details to request 
        → Continue to route handler
```

#### Middleware Stack

```javascript
requireAuth(tier) = [
    authenticateApiKey,   // Validate key exists and is active
    requireTier(tier),    // Check permission tier
    trackApiUsage         // Log request for analytics
];
```

---

### 8. Webhook System (`db/webhooks.js`, `utils/webhook-delivery.js`)

**Purpose:** Real-time event notifications to external services

#### Supported Events

| Event | Trigger | Payload |
|-------|---------|---------|
| `round.started` | New round begins | Round ID, start time |
| `round.completed` | Round finishes | Winners, totals, payouts |
| `token.registered` | New token added | Token details |
| `token.deactivated` | Token removed | Token mint, reason |
| `payout.sent` | Payment executed | Holder, amount, tx signature |
| `fraud.detected` | Suspicious activity | Token, flags, penalty |

#### Webhook Registration

```sql
CREATE TABLE webhooks (
    webhook_id TEXT PRIMARY KEY,
    key_id TEXT NOT NULL,          -- Owner API key
    url TEXT NOT NULL,
    secret TEXT NOT NULL,          -- HMAC signing key
    events TEXT NOT NULL,          -- JSON array
    is_active INTEGER DEFAULT 1,
    created_at INTEGER,
    metadata TEXT
);
```

#### Signature Verification

All webhook payloads are signed with HMAC-SHA256:

```javascript
const signature = 'sha256=' + crypto
    .createHmac('sha256', webhookSecret)
    .update(JSON.stringify(payload))
    .digest('hex');

// Sent as X-Webhook-Signature header
```

#### Retry Policy

```javascript
const RETRY_SCHEDULE = [
    0,           // Immediate
    60 * 1000,   // 1 minute
    5 * 60 * 1000,    // 5 minutes
    30 * 60 * 1000,   // 30 minutes
    2 * 60 * 60 * 1000 // 2 hours (final)
];

const MAX_ATTEMPTS = 5;
```

#### Delivery Tracking

```sql
CREATE TABLE webhook_deliveries (
    id INTEGER PRIMARY KEY,
    webhook_id TEXT,
    event_type TEXT,
    payload TEXT,              -- JSON
    status TEXT,               -- pending, delivered, failed
    http_status INTEGER,
    attempts INTEGER DEFAULT 0,
    error_message TEXT,
    response_time_ms INTEGER,
    created_at INTEGER,
    last_attempt_at INTEGER
);
```

#### Delivery Flow

```
Event Triggered 
    → Get all webhooks subscribed to event type
    → For each webhook:
        → Generate payload with event data
        → Sign with HMAC-SHA256
        → POST to webhook URL
        → Log delivery result
        → If failed and attempts < 5:
            → Queue for retry with backoff
```

---

### 9. Smart Caching System (`utils/cache.js`)

**Purpose:** Reduce external API calls while maintaining data freshness

#### Cache Tiers

| Cache Type | TTL | Max Size | Use Case |
|------------|-----|----------|----------|
| `marketData` | 30 seconds | 100 | Real-time prices, volume |
| `metadata` | 1 hour | 500 | Token names, symbols |
| `aiResponses` | 5 minutes | 50 | AI commentary |
| `batchRequests` | 10 seconds | 20 | Deduplication |

#### LRU Eviction

When cache reaches max size, least recently used entries are evicted:

```javascript
evictLRU(cacheType) {
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, entry] of cache.entries()) {
        if (entry.lastAccess < oldestTime) {
            oldestTime = entry.lastAccess;
            oldestKey = key;
        }
    }

    if (oldestKey) cache.delete(oldestKey);
}
```

#### Cache Entry Structure

```javascript
{
    value: <cached data>,
    timestamp: 1703689200000,    // When cached
    lastAccess: 1703689250000   // Last read time
}
```

#### Statistics

```javascript
cache.getStats()
// Returns:
{
    hits: 1250,
    misses: 47,
    evictions: 12,
    hitRate: "96.4%",
    sizes: {
        marketData: 45,
        metadata: 123,
        aiResponses: 8,
        batchRequests: 0
    }
}
```

#### Automatic Cleanup

Background interval runs every 60 seconds to clear expired entries.

---

### 10. Waitlist System (`db/waitlist.js`)

**Purpose:** Collect early access signups before public launch

#### Schema

```sql
CREATE TABLE waitlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    twitter_handle TEXT NOT NULL UNIQUE,
    wallet_address TEXT NOT NULL UNIQUE,
    email TEXT,
    user_type TEXT NOT NULL,        -- 'holder', 'creator', 'developer'
    referral_code TEXT,
    submitted_at INTEGER NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    verified INTEGER DEFAULT 0,
    notified INTEGER DEFAULT 0
);

CREATE INDEX idx_waitlist_submitted ON waitlist(submitted_at DESC);
CREATE INDEX idx_waitlist_verified ON waitlist(verified, submitted_at DESC);
```

#### User Types

| Type | Description |
|------|-------------|
| `holder` | Token holder interested in earning rewards |
| `creator` | Token creator wanting to register tokens |
| `developer` | Developer wanting API access |

#### Functions

```javascript
// Add new signup
addToWaitlist({ twitterHandle, walletAddress, email, userType, referralCode })

// Get position in queue
getWaitlistPosition(twitterHandle)  // Returns position number

// Admin functions
getWaitlistCount()
getAllWaitlist(limit, offset)
verifyEntry(id)
markNotified(id)
checkExists(twitterHandle, walletAddress)
```

#### Duplicate Prevention

Unique constraints on both `twitter_handle` and `wallet_address` prevent duplicate signups.

---

### 11. Frontend (`public/`)

#### `index.html`
- Gladiator Arena themed UI
- Champion's Podium (top 3)
- Live Warboard (leaderboard table)
- Hall of Heroes
- AI Commissioner commentary

#### `app.js`
- Polls API every 15 seconds
- Renders dynamic data
- Handles podium ordering (2, 1, 3)

#### `styles.css`
- Iron/Gold/Crimson color palette
- Glassmorphism effects
- Responsive design

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    24-Hour Timer                        │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  SNAPSHOT: Freeze competition state                     │
│  - Fetch DexScreener data (price, volume, liquidity)    │
│  - Index all holders from Solana                        │
│  - Save to database                                     │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  FEE CLAIMING: Harvest creator fees                     │
│  - Call PumpPortal for each token                       │
│  - Measure SOL delta                                    │
│  - Mark active/passive                                  │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  SCORING: Calculate rankings                            │
│  - Composite score (fees, holders, volume, etc.)        │
│  - Fraud detection & penalties                          │
│  - Active boost (2x for fee claimers)                   │
│  - Normalize 0-100                                      │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  PAYOUT: Distribute rewards                             │
│  - Top N winners selected                               │
│  - 85% to holders, 10% arena, 5% prize pool            │
│  - Execute Solana transactions                          │
│  - Generate proof                                       │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  AI AGENT: Post-round actions                           │
│  - Generate commentary                                  │
│  - Post tweet (if enabled)                              │
│  - Update memory                                        │
└─────────────────────────────────────────────────────────┘
```

---

## Configuration (`config.js`)

### Critical Settings
```javascript
roundDurationHours: 24        // Competition cycle
topN: 3                       // Number of winners
minArenaBalanceSOL: 0.5       // Safety threshold
```

### Fee Distribution
```javascript
toHolders: 0.85    // 85%
toArena: 0.10      // 10%
toPrizePool: 0.05  // 5%
```

### Scoring Weights
```javascript
fees: 0.30         // 30%
holders: 0.25      // 25%
volume: 0.20       // 20%
stability: 0.15    // 15%
growth: 0.10       // 10%
```

---

## Security Measures

1. **Wallet Protection**
   - Private keys in environment variables only
   - Never drain below minimum balance
   - Transaction signing via Solana SDK

2. **Payout Safety**
   - Max per holder: 10 SOL
   - Max per round: 100 SOL
   - Skip dust payments (< 5000 lamports)

3. **Fraud Prevention**
   - Concentration limits
   - Minimum holder requirements
   - AI risk assessment
   - Penalty multipliers

4. **API Protection**
   - Retry logic with exponential backoff
   - Rate limiting
   - Error handling and fallbacks

---

## Error Recovery

### Incomplete Rounds
On startup, system checks for incomplete rounds and resumes from last checkpoint:
- `pending` → Resume snapshot
- `snapshot_complete` → Resume fee claiming
- `fees_claimed` → Resume scoring
- `scored` → Resume payouts

### API Failures
- DexScreener: Falls back to PumpPortal metadata
- PumpPortal: Logs error, continues with other tokens
- Gemini AI: Silently fails, continues protocol

### Transaction Failures
- Logged to database
- Payout marked as failed
- Can be retried manually

---

## Monitoring & Observability

### Console Logs
- Round lifecycle events
- Fee claiming results
- Payout confirmations
- AI actions

### Database Queries
```sql
-- Check round status
SELECT * FROM rounds ORDER BY created_at DESC LIMIT 1;

-- View leaderboard
SELECT * FROM token_snapshots 
WHERE round_id = 'R...' 
ORDER BY score DESC;

-- Audit payouts
SELECT * FROM payouts WHERE round_id = 'R...';
```

### API Endpoints
- `/api/status` - Real-time health check
- `/api/stats` - Aggregate metrics

---

## Deployment Checklist

1. ✅ Configure `.env` with all API keys
2. ✅ Fund arena wallet (min 0.5 SOL)
3. ✅ Register production tokens
4. ✅ Run `node test/production_audit.js`
5. ✅ Start with `npm start`
6. ✅ Monitor first round completion
7. ✅ Verify payout proofs

---

*Last Updated: 2025-12-27*
