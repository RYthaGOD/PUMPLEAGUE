# PumpLeague 🏆

**Complete Automated Token Competition Protocol for Pump.fun**

PumpLeague runs fair, transparent, and automated token competitions on Solana. It claims creator fees, ranks tokens by multi-metric scoring, detects fraud, and distributes rewards to holders—all verifiable on-chain.

## Quick Start

```bash
# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your wallet keys and API key

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

## Architecture

```
pumpleague/
├─ config.js              # All configuration
├─ index.js               # Main round orchestrator
├─ cli.js                 # Command-line interface
├─ db/
│   ├─ schema.js          # SQLite tables
│   └─ store.js           # Data access layer
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
└─ RULES.md               # Official competition rules
```

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

## Security

⚠️ **Never commit `.env` or secret keys!**

- Store `ARENA_WALLET_SECRET` as JSON array: `[1,2,3...]`
- Use devnet for testing
- Run `npm run dry-run` first

## License

MIT
