# PumpLeague Developer Integration Guide

Welcome to PumpLeague! This guide walks you through integrating with our token competition protocol.

## Getting Started

### Step 1: Join the Waitlist

Before you can access the API, you need to apply for developer access:

**Option A: Web Form**
1. Visit [pumpleague.com/waitlist](https://pumpleague.com/waitlist)
2. Fill in your details:
   - Twitter Handle (required)
   - Solana Wallet Address (required)
   - Email (optional)
   - User Type: Select **Developer**
3. Submit and note your waitlist position

**Option B: API (for automated signups)**
```bash
curl -X POST https://api.pumpleague.com/api/waitlist \
  -H "Content-Type: application/json" \
  -d '{
    "twitterHandle": "@yourhandle",
    "walletAddress": "YourSolanaAddress...",
    "email": "dev@example.com",
    "userType": "developer"
  }'
```

### Step 2: Get Approved

After submitting your application:
1. Our team reviews developer applications
2. Approved developers receive a DM on Twitter with next steps
3. You'll receive your API key tier based on your use case:
   - `public` — Read-only access (100 req/hour)
   - `integration` — Full access + webhooks (1000 req/hour)
   - `admin` — Full access + key management (5000 req/hour)

### Step 3: Receive Your API Key

Once approved, you'll receive an API key via secure DM:
```
Your PumpLeague API Key:
Key ID: key_abc123...
API Key: api_key_xyz789...
Tier: integration
```

> ⚠️ **Save your API key securely - it cannot be recovered!**

---

## Using the API

### Authentication

Include your API key in all requests:

```bash
curl -H "X-API-Key: api_key_xyz789..." \
  https://api.pumpleague.com/api/status
```

### Quick Examples

**Get Current Leaderboard:**
```javascript
const response = await fetch('https://api.pumpleague.com/api/leaderboard', {
  headers: { 'X-API-Key': process.env.PUMPLEAGUE_API_KEY }
});
const leaderboard = await response.json();
```

**Get Protocol Stats:**
```javascript
const stats = await fetch('https://api.pumpleague.com/api/stats', {
  headers: { 'X-API-Key': process.env.PUMPLEAGUE_API_KEY }
}).then(r => r.json());

console.log(`Total paid out: ${stats.totalPaidOutSOL} SOL`);
```

### Core Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/status` | Protocol status and config |
| `GET /api/leaderboard` | Current round rankings |
| `GET /api/rounds` | Round history |
| `GET /api/rounds/:id` | Specific round details |
| `GET /api/tokens` | Registered tokens |
| `GET /api/hof` | Hall of Fame |
| `GET /api/stats` | Aggregate statistics |

See [API_REFERENCE.md](API_REFERENCE.md) for complete documentation.

---

## Setting Up Webhooks

Receive real-time notifications when events occur.

### Register a Webhook

```bash
curl -X POST https://api.pumpleague.com/api/webhooks \
  -H "X-API-Key: api_key_xyz789..." \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-server.com/pumpleague-webhook",
    "events": ["round.completed", "payout.sent"]
  }'
```

**Response:**
```json
{
  "webhookId": "whk_abc123",
  "url": "https://your-server.com/pumpleague-webhook",
  "events": ["round.completed", "payout.sent"],
  "secret": "whsec_xyz789..."
}
```

### Available Events

| Event | When It Fires |
|-------|--------------|
| `round.started` | New competition round begins |
| `round.completed` | Round finishes with payouts |
| `token.registered` | New token enters competition |
| `payout.sent` | SOL payment sent to holder |
| `fraud.detected` | Suspicious activity flagged |

### Verify Webhook Signatures

All webhooks include an `X-Webhook-Signature` header:

```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

// Express middleware
app.post('/pumpleague-webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  
  if (!verifyWebhook(req.body, signature, WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
  }
  
  // Process the event
  const { type, data } = req.body;
  console.log(`Received ${type}:`, data);
  
  res.status(200).send('OK');
});
```

---

## Testing Your Integration

### Using the CLI

If you have access to the PumpLeague CLI, you can test locally:

```bash
# Test your API key
node cli.js test-integration api_key_xyz789...

# Expected output:
# 🧪 Testing PumpLeague Integration
# 1. Testing API Key Validation... ✅
# 2. Testing Rate Limit... ✅
# 3. Testing Token Listing... ✅
# 4. Testing Round Data... ✅
# ✅ Integration test complete!
```

### Testing Webhooks

```bash
# Send a test payload to your webhook
node cli.js webhook test whk_abc123
```

---

## Common Use Cases

### 1. Portfolio Tracker
Track rewards earned by your tokens:
```javascript
async function getMyRewards(tokenMint) {
  const history = await fetch(`/api/token-history/${tokenMint}`);
  return history.json();
}
```

### 2. Leaderboard Bot
Post round results to Discord/Telegram:
```javascript
// Subscribe to round.completed webhook
app.post('/webhook', async (req, res) => {
  if (req.body.type === 'round.completed') {
    const { winners, totalPaidOut } = req.body.data;
    await postToDiscord(`🏆 Round Complete! ${totalPaidOut} SOL distributed!`);
  }
  res.sendStatus(200);
});
```

### 3. Token Creator Dashboard
Monitor your token's performance:
```javascript
const leaderboard = await fetch('/api/leaderboard').then(r => r.json());
const myToken = leaderboard.find(t => t.token_mint === MY_TOKEN);
console.log(`Rank: #${myToken.rank}, Score: ${myToken.score}`);
```

---

## Rate Limits

| Tier | Rate Limit | Best For |
|------|------------|----------|
| `public` | 100/hour | Personal dashboards |
| `integration` | 1000/hour | Bots, apps |
| `admin` | 5000/hour | High-frequency trading |

When rate limited, you'll receive:
```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Try again in 60 seconds."
}
```

---

## Error Handling

Always handle errors gracefully:

```javascript
async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      
      if (response.status === 429) {
        // Rate limited - wait and retry
        await new Promise(r => setTimeout(r, 60000));
        continue;
      }
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}
```

---

## Support

- **Twitter:** [@PumpLeague](https://twitter.com/pumpleague)
- **Discord:** [discord.gg/pumpleague](https://discord.gg/pumpleague)
- **GitHub Issues:** [github.com/RYthaGOD/PUMPLEAGUE/issues](https://github.com/RYthaGOD/PUMPLEAGUE/issues)

---

## CLI Reference (For Admins)

If you're running your own PumpLeague instance:

```bash
# Create API keys for developers
node cli.js api-key create "Developer Name" integration

# List all keys
node cli.js api-key list

# View usage stats
node cli.js api-key stats key_abc123

# Revoke if needed
node cli.js api-key revoke key_abc123
```

---

*Last Updated: 2025-12-27*
