# PumpLeague 🏆

**Complete Automated Token Competition Protocol for Pump.fun**

PumpLeague runs fair, transparent, and automated token competitions on Solana. It claims creator fees, ranks tokens by multi-metric scoring, detects fraud, and distributes rewards to holders—all verifiable on-chain.

[![GitHub](https://img.shields.io/badge/GitHub-RYthaGOD%2FPUMPLEAGUE-blue)](https://github.com/RYthaGOD/PUMPLEAGUE)

## Quick Start

```bash
# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your wallet keys and API keys

# Register tokens
node cli.js register <token_mint_address>

# Run a single round (dry run)
npm run dry-run

# Run live
npm start
```

## Features

### ✅ Core Infrastructure
- **Round Snapshots** — Holders frozen at specific slot, no gaming after snapshot
- **Full Holder Indexing** — All holders, not just top 20
- **Fee Delta Accounting** — Measures actual SOL change, not API trust
- **SQLite Persistence** — Survives crashes, restarts

### ✅ Money Safety
- **Idempotency** — No double payouts on restart
- **Circuit Breakers** — Caps per holder, per round, emergency stop
- **Balance Floor** — Never drains arena wallet below minimum
- **Dry Run Mode** — Test without spending SOL

### ✅ Game Design
- **Multi-Metric Scoring** — 5 weighted factors, not just fees
- **Anti-Fraud Detection** — Concentration checks, wash trading detection
- **Penalty System** — Suspicious tokens penalized, not just removed

### ✅ Transparency
- **Proof-of-Payout** — Every tx has Solscan link
- **Public Accounting** — Fee breakdown per round
- **Hall of Fame** — Historical performance tracking

### ✅ AI Agent (NEW)
- **Autonomous Decision Engine** — Runs 24/7, posts commentary, analyzes fraud
- **Smart Discovery** — Auto-discovers trending tokens
- **Twitter Integration** — Auto-posts round results and daily summaries
- **Gemini-Powered** — Uses Gemini 2.0 for intelligent analysis

### ✅ REST API (NEW)
- **Public Endpoints** — Status, leaderboard, rounds, stats
- **API Key Authentication** — Tiered access (public, integration, admin)
- **Rate Limiting** — Protects against abuse
- **Usage Tracking** — Monitor API consumption

### ✅ Webhooks (NEW)
- **Real-time Events** — Get notified on round completion, payouts, etc.
- **HMAC Signatures** — Secure payload verification
- **Auto-retry** — Failed deliveries retry with exponential backoff
- **Delivery Logs** — Full audit trail

### ✅ Smart Caching (NEW)
- **Multi-tier Cache** — Different TTLs for market data, metadata, AI responses
- **LRU Eviction** — Automatic memory management
- **Hit Rate Monitoring** — Track cache efficiency

### ✅ Waitlist System (NEW)
- **Early Access Signups** — Collect Twitter handle, wallet, user type
- **Position Tracking** — Users see their waitlist position
- **Admin Dashboard** — Manage and verify entries

## Architecture

```
pumpleague/
├─ config.js              # All configuration
├─ index.js               # Main round orchestrator
├─ cli.js                 # Command-line interface
├─ api/
│   └─ server.js          # REST API server
├─ ai/
│   ├─ agent.js           # Autonomous AI agent
│   ├─ gemini.js          # Gemini API integration
│   └─ memory.js          # Agent memory/state
├─ db/
│   ├─ schema.js          # SQLite tables
│   ├─ store.js           # Data access layer
│   ├─ api-keys.js        # API key management
│   ├─ webhooks.js        # Webhook registrations
│   ├─ waitlist.js        # Waitlist entries
│   └─ access.js          # Access code system
├─ core/
│   ├─ snapshot.js        # Round snapshot system
│   ├─ indexer.js         # Full holder indexing
│   ├─ fees.js            # Fee delta accounting
│   └─ registration.js    # Token opt-in
├─ safety/
│   ├─ idempotency.js     # Double-pay prevention
│   └─ guards.js          # Circuit breakers
├─ game/
│   ├─ scoring.js         # Multi-metric ranking
│   └─ antifraud.js       # Wash trading detection
├─ payout/
│   ├─ executor.js        # Safe payout execution
│   ├─ accounting.js      # Fee transparency
│   └─ proof.js           # On-chain proof
├─ social/
│   ├─ twitter.js         # Announcements
│   └─ history.js         # Hall of Fame
├─ middleware/
│   ├─ auth.js            # API authentication
│   └─ rate-limit.js      # Rate limiting
├─ utils/
│   ├─ cache.js           # Smart caching system
│   ├─ webhook-delivery.js # Webhook dispatcher
│   └─ sse.js             # Server-sent events
├─ discovery/
│   └─ trend.js           # Trending token discovery
├─ external/
│   ├─ api.js             # External API client
│   ├─ dexscreener.js     # DexScreener integration
│   └─ pumpportal.js      # PumpPortal integration
├─ public/                # Frontend assets
└─ docs/                  # Documentation
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Protocol status and config |
| `/api/leaderboard` | GET | Current round rankings |
| `/api/rounds` | GET | Round history |
| `/api/rounds/:id` | GET | Specific round details |
| `/api/tokens` | GET | Registered tokens |
| `/api/hof` | GET | Hall of Fame |
| `/api/stats` | GET | Aggregate statistics |
| `/api/health` | GET | Health check |
| `/api/waitlist` | POST | Join waitlist |
| `/api/waitlist/count` | GET | Waitlist count |

See [docs/API_REFERENCE.md](docs/API_REFERENCE.md) for full documentation.

## CLI Commands

```bash
# Token Management
node cli.js register <mint> [creator] [name] [symbol]
node cli.js deactivate <mint>
node cli.js tokens

# Status & History
node cli.js status
node cli.js history 10
node cli.js round [roundId]

# Verification
node cli.js proof [roundId]
node cli.js export [roundId]

# Hall of Fame
node cli.js hof 10
node cli.js token-history <mint>

# API Key Management
node cli.js create-api-key <name> <tier>
node cli.js list-api-keys
node cli.js revoke-api-key <keyId>
```

## Configuration

All settings in `config.js`:

| Setting | Default | Description |
|---------|---------|-------------|
| `roundDurationHours` | 24 | Hours between rounds |
| `topN` | 3 | Number of winning tokens |
| `feeDistribution.toHolders` | 85% | Holder payout share |
| `feeDistribution.toArena` | 10% | Arena fee |
| `safetyLimits.maxPayoutPerHolderSOL` | 10 | Max per holder |
| `safetyLimits.maxPayoutPerRoundSOL` | 100 | Max per round |

## Scoring Weights

| Metric | Weight |
|--------|--------|
| Claimed Fees | 30% |
| Holder Count | 25% |
| 24h Volume | 20% |
| Price Stability | 15% |
| Growth Rate | 10% |

## Environment Variables

```env
# Required
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
ARENA_WALLET_SECRET=[1,2,3...]
PUMPPORTAL_API_KEY=your_key

# AI (optional)
AI_ENABLED=true
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-2.0-flash
AI_AUTOPILOT_MODE=SEMI_AUTO

# Twitter (optional)
TWITTER_ENABLED=false
TWITTER_API_KEY=
TWITTER_API_SECRET=
TWITTER_ACCESS_TOKEN=
TWITTER_ACCESS_TOKEN_SECRET=
```

## Security

⚠️ **Never commit `.env` or secret keys!**

- Store `ARENA_WALLET_SECRET` as JSON array: `[1,2,3...]`
- Use devnet for testing
- Run `npm run dry-run` first
- API keys are hashed before storage
- Webhook secrets use HMAC-SHA256 signatures

## Documentation

- [API Reference](docs/API_REFERENCE.md) — Full REST API documentation
- [Architecture](docs/ARCHITECTURE.md) — System design and data flow
- [Cache Monitoring](docs/CACHE_MONITORING.md) — Cache performance guide

## License

MIT
