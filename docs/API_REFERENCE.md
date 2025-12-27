# PumpLeague API Reference

Complete documentation for the PumpLeague REST API, including authentication, endpoints, webhooks, and integration guides.

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Rate Limiting](#rate-limiting)
- [Public Endpoints](#public-endpoints)
- [Authenticated Endpoints](#authenticated-endpoints)
- [Waitlist Endpoints](#waitlist-endpoints)
- [Webhooks](#webhooks)
- [External APIs](#external-apis)
- [Error Handling](#error-handling)

---

## Overview

**Base URL:** `http://localhost:3001` (development) or your production domain

**Content Type:** All requests and responses use `application/json`

**CORS:** Enabled for all origins

---

## Authentication

PumpLeague uses API key authentication with tiered access levels.

### API Key Tiers

| Tier | Description | Rate Limit |
|------|-------------|------------|
| `public` | Read-only access to public endpoints | 100/hour |
| `integration` | Full API access, webhook management | 1000/hour |
| `admin` | Administrative access, key management | 5000/hour |

### Using API Keys

Include your API key in the `X-API-Key` header:

```bash
curl -H "X-API-Key: api_key_abc123..." \
  https://api.pumpleague.com/api/status
```

### Creating API Keys

Use the CLI to create API keys:

```bash
# Create an integration-tier key
node cli.js create-api-key "MyApp Integration" integration

# Output:
# ✅ API Key Created
# Key ID: key_1234567890
# API Key: api_key_abc123def456... (save this - shown only once!)
# Tier: integration
# Rate Limit: 1000/hour
```

### Key Management Endpoints

```http
GET /api/keys
Authorization: Required (admin tier)
```

Lists all API keys (without revealing the actual key values).

```http
DELETE /api/keys/:keyId
Authorization: Required (admin tier)
```

Revokes an API key.

---

## Rate Limiting

Rate limits are enforced per API key. Exceeding the limit returns `429 Too Many Requests`.

**Response Headers:**
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 2025-12-27T19:00:00Z
```

---

## Public Endpoints

These endpoints are publicly accessible without authentication.

### GET /api/status

Returns protocol status and current configuration.

**Response:**
```json
{
  "protocol": "PumpLeague",
  "status": "active",
  "latestRound": {
    "round_id": "R20251227_1703689200",
    "status": "completed",
    "created_at": "2025-12-27T12:00:00.000Z",
    "completed_at": "2025-12-27T12:05:32.000Z",
    "total_fees_claimed": 2.5,
    "total_paid_out": 2.125
  },
  "activeTokenCount": 5,
  "config": {
    "roundDurationHours": 24,
    "topN": 3,
    "feeDistribution": {
      "toHolders": 0.85,
      "toArena": 0.10,
      "toCreator": 0.05
    }
  }
}
```

---

### GET /api/leaderboard

Returns the current round's token rankings.

**Response:**
```json
[
  {
    "token_mint": "abc123...",
    "symbol": "MEME",
    "name": "MemeCoin",
    "score": 87.5,
    "rank": 1,
    "fees_claimed": 1.2,
    "holder_count": 1500,
    "volume_24h": 50000,
    "price_change_24h": 15.5,
    "is_active": true,
    "fraud_penalty": 1.0
  },
  // ... more tokens
]
```

---

### GET /api/rounds

Returns round history.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 20 | Max rounds to return |

**Response:**
```json
[
  {
    "round_id": "R20251227_1703689200",
    "status": "completed",
    "created_at": "2025-12-27T12:00:00.000Z",
    "completed_at": "2025-12-27T12:05:32.000Z",
    "total_fees_claimed": 2.5,
    "total_paid_out": 2.125,
    "winner_count": 3
  }
]
```

---

### GET /api/rounds/:id

Returns detailed data for a specific round.

**Path Parameters:**
| Parameter | Description |
|-----------|-------------|
| `id` | Round ID (e.g., `R20251227_1703689200`) |

**Response:**
```json
{
  "round": {
    "round_id": "R20251227_1703689200",
    "status": "completed",
    "snapshot_slot": 123456789,
    "total_fees_claimed": 2.5,
    "total_paid_out": 2.125
  },
  "tokens": [
    {
      "token_mint": "abc123...",
      "symbol": "MEME",
      "score": 87.5,
      "rank": 1,
      "payout_amount": 0.85
    }
  ],
  "payoutCount": 150,
  "payouts": [
    {
      "holder_wallet": "xyz789...",
      "amount_sol": 0.05,
      "tx_signature": "sig123...",
      "status": "confirmed"
    }
  ]
}
```

---

### GET /api/tokens

Returns all registered tokens.

**Response:**
```json
[
  {
    "token_mint": "abc123...",
    "creator_wallet": "creator123...",
    "name": "MemeCoin",
    "symbol": "MEME",
    "is_active": true,
    "registered_at": "2025-12-20T10:00:00.000Z",
    "total_wins": 5,
    "total_fees_claimed": 12.5
  }
]
```

---

### GET /api/hof

Returns the Hall of Fame (all-time winners).

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 20 | Max entries to return |

**Response:**
```json
[
  {
    "token_mint": "abc123...",
    "symbol": "MEME",
    "total_wins": 10,
    "total_fees_claimed": 25.5,
    "total_distributed": 21.67,
    "first_win": "2025-12-01T00:00:00.000Z",
    "last_win": "2025-12-27T00:00:00.000Z"
  }
]
```

---

### GET /api/stats

Returns aggregate protocol statistics.

**Response:**
```json
{
  "totalRounds": 30,
  "totalFeesClaimedSOL": 75.5,
  "totalPaidOutSOL": 64.17,
  "protocolRevenueSOL": 11.33,
  "lastUpdated": "2025-12-27T18:00:00.000Z"
}
```

---

### GET /api/health

Basic health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "uptime": 86400
}
```

---

## Waitlist Endpoints

### POST /api/waitlist

Submit a new waitlist entry.

**Request Body:**
```json
{
  "twitterHandle": "@username",
  "walletAddress": "abc123...",
  "email": "user@example.com",
  "userType": "holder",
  "referralCode": "REF123"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `twitterHandle` | Yes | Twitter/X handle (with or without @) |
| `walletAddress` | Yes | Solana wallet address |
| `email` | No | Email address |
| `userType` | Yes | `holder`, `creator`, or `developer` |
| `referralCode` | No | Referral code |

**Response (Success):**
```json
{
  "success": true,
  "message": "Successfully joined the waitlist!",
  "position": 42,
  "total": 1500
}
```

**Response (Duplicate):**
```json
{
  "success": false,
  "error": "Twitter handle or wallet already registered"
}
```

---

### GET /api/waitlist/count

Returns the current waitlist count.

**Response:**
```json
{
  "count": 1500
}
```

---

### GET /api/waitlist/all

Returns all waitlist entries (admin use).

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 100 | Max entries to return |
| `offset` | integer | 0 | Pagination offset |

**Response:**
```json
{
  "entries": [
    {
      "id": 1,
      "twitter_handle": "username",
      "wallet_address": "abc123...",
      "email": "user@example.com",
      "user_type": "holder",
      "submitted_at": 1703689200000,
      "verified": 0,
      "notified": 0
    }
  ],
  "total": 1500
}
```

---

## Webhooks

Receive real-time notifications when events occur in PumpLeague.

### Supported Events

| Event Type | Description |
|------------|-------------|
| `round.started` | A new competition round has started |
| `round.completed` | A round has finished with payouts |
| `token.registered` | A new token was registered |
| `token.deactivated` | A token was deactivated |
| `payout.sent` | A payout was sent to a holder |
| `fraud.detected` | Suspicious activity was detected |

### Registering a Webhook

```http
POST /api/webhooks
Authorization: Required (integration tier)
```

**Request Body:**
```json
{
  "url": "https://your-server.com/webhook",
  "events": ["round.completed", "payout.sent"]
}
```

**Response:**
```json
{
  "webhookId": "whk_abc123",
  "url": "https://your-server.com/webhook",
  "events": ["round.completed", "payout.sent"],
  "secret": "whsec_xyz789..."
}
```

> ⚠️ **Save the secret!** It's only shown once and is required to verify webhook signatures.

### Webhook Payload

```json
{
  "id": "evt_123456",
  "type": "round.completed",
  "created": "2025-12-27T18:00:00.000Z",
  "data": {
    "round_id": "R20251227_1703689200",
    "total_fees_claimed": 2.5,
    "total_paid_out": 2.125,
    "winner_count": 3,
    "top_token": "abc123..."
  }
}
```

### Verifying Webhook Signatures

All webhooks include an `X-Webhook-Signature` header. Verify it to ensure the payload is authentic:

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

### Managing Webhooks

```http
GET /api/webhooks
Authorization: Required
```

Lists your registered webhooks.

```http
DELETE /api/webhooks/:id
Authorization: Required
```

Removes a webhook.

```http
GET /api/webhooks/:id/logs
Authorization: Required
```

Returns delivery logs for a webhook.

### Retry Policy

Failed webhook deliveries are automatically retried:
- Attempt 1: Immediate
- Attempt 2: After 1 minute
- Attempt 3: After 5 minutes
- Attempt 4: After 30 minutes
- Attempt 5: After 2 hours (final)

---

## External APIs

PumpLeague integrates with these external services:

### PumpPortal API

**Base URL:** `https://pumpportal.fun/api`

**Authentication:** API key as query parameter: `?api-key=YOUR_KEY`

#### Claim Creator Fees

```javascript
POST /trade?api-key={API_KEY}

{
  "action": "collectCreatorFee",
  "priorityFee": 0.000001,
  "pool": "pump",
  "mint": "TOKEN_MINT"
}
```

**Response:**
```json
{
  "signature": "tx_signature_here"
}
```

**Fees:**
- Lightning API: 1% per trade
- Local API: 0.5% per trade

---

### DexScreener API

**Base URL:** `https://api.dexscreener.com`

**Authentication:** None required

#### Get Token Data (Single)

```http
GET /tokens/v1/solana/{tokenAddress}
```

#### Get Token Data (Batch - up to 30)

```http
GET /tokens/v1/solana/{address1},{address2},{address3}
```

**Response Fields:**
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

**Rate Limits:**
- 300 requests/minute for token endpoints
- 60 requests/minute for profile endpoints

---

## Error Handling

### HTTP Status Codes

| Code | Description |
|------|-------------|
| `200` | Success |
| `400` | Bad Request - Invalid parameters |
| `401` | Unauthorized - Missing or invalid API key |
| `403` | Forbidden - Insufficient permissions |
| `404` | Not Found - Resource doesn't exist |
| `429` | Too Many Requests - Rate limit exceeded |
| `500` | Internal Server Error |

### Error Response Format

```json
{
  "error": "Error Type",
  "message": "Human-readable description of what went wrong"
}
```

### Common Errors

**Missing API Key:**
```json
{
  "error": "Unauthorized",
  "message": "API key required. Include X-API-Key header."
}
```

**Invalid API Key:**
```json
{
  "error": "Unauthorized",
  "message": "Invalid or inactive API key"
}
```

**Insufficient Permissions:**
```json
{
  "error": "Forbidden",
  "message": "This endpoint requires 'admin' tier access. You have 'integration' tier."
}
```

**Rate Limit Exceeded:**
```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Try again in 60 seconds."
}
```

---

## SDK Examples

### JavaScript/Node.js

```javascript
const axios = require('axios');

const pumpleague = axios.create({
  baseURL: 'https://api.pumpleague.com',
  headers: {
    'X-API-Key': process.env.PUMPLEAGUE_API_KEY
  }
});

// Get current leaderboard
const leaderboard = await pumpleague.get('/api/leaderboard');
console.log(leaderboard.data);

// Register a webhook
const webhook = await pumpleague.post('/api/webhooks', {
  url: 'https://my-server.com/webhook',
  events: ['round.completed']
});
console.log('Webhook secret:', webhook.data.secret);
```

### Python

```python
import requests

API_KEY = "your_api_key_here"
BASE_URL = "https://api.pumpleague.com"

headers = {"X-API-Key": API_KEY}

# Get protocol stats
response = requests.get(f"{BASE_URL}/api/stats", headers=headers)
stats = response.json()
print(f"Total rounds: {stats['totalRounds']}")
print(f"Total paid out: {stats['totalPaidOutSOL']} SOL")
```

### cURL

```bash
# Get leaderboard
curl -H "X-API-Key: api_key_..." \
  https://api.pumpleague.com/api/leaderboard

# Create webhook
curl -X POST \
  -H "X-API-Key: api_key_..." \
  -H "Content-Type: application/json" \
  -d '{"url":"https://my-server.com/hook","events":["round.completed"]}' \
  https://api.pumpleague.com/api/webhooks
```

---

## Usage in PumpLeague

| Module | API Used |
|--------|----------|
| `core/fees.js` | PumpPortal (claim fees) |
| `core/snapshot.js` | DexScreener (market data) |
| `external/api.js` | Both APIs |
| `external/dexscreener.js` | DexScreener wrapper |
| `external/pumpportal.js` | PumpPortal wrapper |

---

*Last Updated: 2025-12-27*
