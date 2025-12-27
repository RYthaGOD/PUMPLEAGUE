# PumpLeague Official Rules

> Version 1.0 | Effective immediately

## 1. Eligibility

### Token Registration
- Tokens must be registered before round snapshot to participate
- Registration is free and open to all Pump.fun tokens
- Creator wallet verification is encouraged but not required

### Minimum Requirements
- Token must have at least 20 unique holders at snapshot time
- Token must have non-zero trading activity

---

## 2. Scoring System

Tokens are ranked by a **composite score** calculated from 5 metrics:

| Metric | Weight | Description |
|--------|--------|-------------|
| Claimed Fees | 30% | SOL fees claimed during the round |
| Holder Count | 25% | Number of unique wallet holders |
| 24h Volume | 20% | Trading volume in last 24 hours |
| Price Stability | 15% | Less volatility = higher score |
| Growth Rate | 10% | Positive price change |

### Score Calculation
```
Score = (FeesNorm × 0.30) + (HoldersNorm × 0.25) + (VolumeNorm × 0.20) 
      + (StabilityNorm × 0.15) + (GrowthNorm × 0.10)
```

All metrics are normalized to a 0-100 scale before weighting.

---

## 3. Anti-Gaming Protections

Tokens may be **penalized** for suspicious activity:

| Flag | Condition | Penalty |
|------|-----------|---------|
| High Concentration | Top 3 wallets hold >80% | -20% score |
| Low Holder Count | Fewer than 20 holders | -20% score |
| Abnormal Fee Ratio | Fees/Volume > 10% | -20% score |
| Duplicate Balances | Many identical balances | -20% score |

**Disqualification:** Tokens with 3+ flags are disqualified from payouts.

---

## 4. Payout Distribution

### Fee Split
| Recipient | Percentage |
|-----------|------------|
| Token Holders | 85% |
| Arena Operations | 10% |
| Next Prize Pool | 5% |

### Holder Payouts
- Distributed proportionally based on token balance at snapshot
- Minimum payout: 5000 lamports (dust threshold)
- Maximum payout: 10 SOL per holder per round

### Round Limits
- Maximum per round: 100 SOL
- Maximum transactions: 500

---

## 5. Verification & Transparency

### All Payouts Are On-Chain
- Every payout has a verifiable Solana transaction signature
- Explorer links provided for all transactions
- Full accounting reports generated per round

### Snapshot Integrity
- Holder balances frozen at specific Solana slot
- Snapshot slot recorded in database
- Post-snapshot changes do not affect payouts

---

## 6. Disputes

### Contact
- Email: disputes@pumpleague.io
- Response time: 48 hours

### Process
1. Submit dispute with round ID and token mint
2. Provide evidence of error
3. Team reviews on-chain data
4. Decision issued within 5 business days

### Final Decision
All decisions by the PumpLeague team are final.

---

## 7. Changes to Rules

- Rules may be updated with 24-hour notice
- Major changes announced via official channels
- Historical rounds judged by rules in effect at time

---

*Last updated: December 2024*
