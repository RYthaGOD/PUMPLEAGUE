# External API Reference

## PumpPortal API

**Base URL:** `https://pumpportal.fun/api`

### Authentication
API key passed as query parameter: `?api-key=YOUR_KEY`

### Claim Creator Fees

```javascript
POST /trade?api-key={API_KEY}

{
  "action": "collectCreatorFee",
  "priorityFee": 0.000001,
  "pool": "pump",        // "pump" or "meteora-dbc"
  "mint": "TOKEN_MINT"   // Optional for pump, required for meteora-dbc
}
```

**Response:**
- Success: `{ "signature": "tx_signature_here" }`
- Error: `{ "error": "error message" }`

**Notes:**
- pump.fun claims ALL creator fees at once (mint optional)
- Meteora DBC requires specific token mint

**Fees:**
- Lightning API: 1% per trade
- Local API: 0.5% per trade

---

## DexScreener API

**Base URL:** `https://api.dexscreener.com`

### Get Token Data (Single)
```
GET /tokens/v1/solana/{tokenAddress}
```

### Get Token Data (Batch - up to 30)
```
GET /tokens/v1/solana/{address1},{address2},{address3}
```

**Response fields:**
```json
{
  "priceUsd": "0.001234",
  "priceNative": "0.0000123",
  "volume": { "h24": 50000 },
  "priceChange": { "h24": 5.5 },
  "liquidity": { "usd": 100000 },
  "fdv": 1000000,
  "marketCap": 500000,
  "txns": { "h24": { "buys": 100, "sells": 50 } }
}
```

**Rate limits:**
- 300 requests/minute for token endpoints
- 60 requests/minute for profile endpoints

---

## Usage in PumpLeague

| Module | API Used |
|--------|----------|
| `core/fees.js` | PumpPortal (claim fees) |
| `core/snapshot.js` | DexScreener (market data) |
| `external/api.js` | Both APIs |

### Config Required (.env)
```
PUMPPORTAL_API_KEY=your_key_here
```
