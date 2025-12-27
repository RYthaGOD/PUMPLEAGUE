/**
 * PumpLeague CLI Tool
 * For managing tokens, viewing status, and history
 */

const { registerToken, getRegisteredTokens, deactivateToken } = require('./core/registration');
const { getRoundHistory, getHallOfFame, formatHallOfFame, getTokenHistory } = require('./social/history');
const { generatePayoutProof, exportPayoutData } = require('./payout/proof');
const { generateRoundAccounting } = require('./payout/accounting');
const store = require('./db/store');
const { getDb } = require('./db/schema');
const apiKeys = require('./db/api-keys');
const webhooks = require('./db/webhooks');
const { sendTestWebhook } = require('./utils/webhook-delivery');
const { WaitlistStore } = require('./db/waitlist');
const fs = require('fs');

const args = process.argv.slice(2);
const command = args[0];

async function main() {
    // Initialize database
    await store.init();
    switch (command) {
        case 'register':
            handleRegister(args.slice(1));
            break;

        case 'deactivate':
            handleDeactivate(args[1]);
            break;

        case 'tokens':
        case 'list':
            handleListTokens();
            break;

        case 'status':
            handleStatus();
            break;

        case 'history':
            handleHistory(parseInt(args[1]) || 10);
            break;

        case 'hof':
        case 'hall-of-fame':
            handleHallOfFame(parseInt(args[1]) || 10);
            break;

        case 'token-history':
            handleTokenHistory(args[1]);
            break;

        case 'round':
            handleRoundDetail(args[1]);
            break;

        case 'proof':
            handleProof(args[1]);
            break;

        case 'export':
            handleExport(args[1]);
            break;

        // API Key commands
        case 'api-key':
            handleApiKey(args.slice(1));
            break;

        // Webhook commands
        case 'webhook':
            handleWebhook(args.slice(1));
            break;

        // Batch operations
        case 'batch-register':
            handleBatchRegister(args[1]);
            break;

        case 'batch-export':
            handleBatchExport(args[1], args[2]);
            break;

        // Integration testing
        case 'test-integration':
            handleTestIntegration(args[1]);
            break;

        // Waitlist management
        case 'waitlist':
            handleWaitlist(args.slice(1));
            break;

        case 'help':
        default:
            showHelp();
    }
}

function handleRegister(params) {
    const [tokenMint, creatorWallet, name, symbol] = params;

    if (!tokenMint) {
        console.error('❌ Usage: node cli.js register <token_mint> [creator_wallet] [name] [symbol]');
        return;
    }

    try {
        const result = registerToken(tokenMint, creatorWallet || null, name || null, symbol || null);
        if (result.existing) {
            console.log('ℹ️ Token was already registered');
        } else {
            console.log('✅ Token registered successfully!');
        }
    } catch (error) {
        console.error(`❌ Failed to register token: ${error.message}`);
    }
}

function handleDeactivate(tokenMint) {
    if (!tokenMint) {
        console.error('❌ Usage: node cli.js deactivate <token_mint>');
        return;
    }

    try {
        deactivateToken(tokenMint);
        console.log(`✅ Token ${tokenMint.slice(0, 8)}... deactivated`);
    } catch (error) {
        console.error(`❌ Failed: ${error.message}`);
    }
}

function handleListTokens() {
    const tokens = getRegisteredTokens();

    console.log(`\n📋 Registered Tokens (${tokens.length})`);
    console.log('─'.repeat(60));

    if (tokens.length === 0) {
        console.log('No tokens registered yet.');
        console.log('Use: node cli.js register <token_mint>');
    } else {
        tokens.forEach(t => {
            console.log(`• ${t.token_mint}`);
            console.log(`  Name: ${t.name || 'N/A'} | Symbol: ${t.symbol || 'N/A'}`);
            console.log(`  Creator: ${t.creator_wallet || 'Unknown'}`);
            console.log(`  Registered: ${t.registered_at}`);
            console.log();
        });
    }
}

function handleStatus() {
    const tokens = getRegisteredTokens();
    const recent = store.getLatestRound();

    console.log(`\n🏆 PUMPLEAGUE STATUS`);
    console.log('═'.repeat(40));
    console.log(`Registered Tokens: ${tokens.length}`);

    if (recent) {
        console.log(`\nLatest Round: ${recent.round_id}`);
        console.log(`  Status: ${recent.status}`);
        console.log(`  Fees Claimed: ${recent.total_fees_claimed?.toFixed(4) || 0} SOL`);
        console.log(`  Paid Out: ${recent.total_paid_out?.toFixed(4) || 0} SOL`);
        console.log(`  Created: ${recent.created_at}`);
    } else {
        console.log('\nNo rounds have been run yet.');
        console.log('Use: npm start');
    }
    console.log();
}

function handleHistory(limit) {
    const rounds = getRoundHistory(limit);

    console.log(`\n📜 Round History (last ${limit})`);
    console.log('═'.repeat(60));

    if (rounds.length === 0) {
        console.log('No rounds completed yet.');
    } else {
        rounds.forEach(r => {
            console.log(`${r.roundId}`);
            console.log(`  Status: ${r.status} | Fees: ${r.totalFeesClaimed} SOL | Paid: ${r.totalPaidOut} SOL`);
            console.log(`  Created: ${r.createdAt}`);
            console.log();
        });
    }
}

function handleHallOfFame(limit) {
    console.log(formatHallOfFame(limit));
}

function handleTokenHistory(tokenMint) {
    if (!tokenMint) {
        console.error('❌ Usage: node cli.js token-history <token_mint>');
        return;
    }

    const history = getTokenHistory(tokenMint);

    console.log(`\n📊 Token History: ${tokenMint.slice(0, 12)}...`);
    console.log('═'.repeat(50));
    console.log(`Total Participations: ${history.totalParticipations}`);
    console.log(`Wins: ${history.wins}`);
    console.log(`Top 3 Finishes: ${history.top3Finishes}`);
    console.log('\nRound History:');

    history.history.slice(0, 10).forEach(r => {
        console.log(`  ${r.roundId} - Rank #${r.rank} | Score: ${r.score} | Fees: ${r.claimedFees} SOL`);
    });
}

function handleRoundDetail(roundId) {
    if (!roundId) {
        // Show latest round
        const latest = store.getLatestRound();
        if (!latest) {
            console.error('No rounds found.');
            return;
        }
        roundId = latest.round_id;
    }

    const accounting = generateRoundAccounting(roundId);
    if (!accounting) {
        console.error(`❌ Round ${roundId} not found`);
        return;
    }

    console.log(`\n📊 Round Detail: ${roundId}`);
    console.log('═'.repeat(50));
    console.log(`Status: ${accounting.status}`);
    console.log(`Snapshot Slot: ${accounting.snapshotSlot}`);
    console.log(`Total Fees: ${accounting.totalFeesClaimed.toFixed(4)} SOL`);
    console.log(`Paid Out: ${accounting.totalPaidOut.toFixed(4)} SOL`);
    console.log(`Arena Fee: ${accounting.arenaFee.toFixed(4)} SOL`);

    console.log('\nTop Tokens:');
    accounting.tokens.slice(0, 5).forEach(t => {
        const flag = t.penalized ? '⚠️' : '✓';
        console.log(`  ${flag} #${t.rank} ${t.mint.slice(0, 12)}... | Score: ${t.score} | Fees: ${t.claimedFees} SOL`);
    });
}

function handleProof(roundId) {
    if (!roundId) {
        const latest = store.getLatestRound();
        if (!latest) {
            console.error('No rounds found.');
            return;
        }
        roundId = latest.round_id;
    }

    const proof = generatePayoutProof(roundId);

    console.log(`\n🔗 Proof of Payout: ${roundId}`);
    console.log('═'.repeat(60));
    console.log(`Payouts: ${proof.count}`);
    console.log(`Total: ${proof.totalSOL.toFixed(4)} SOL\n`);

    proof.payouts.slice(0, 10).forEach(p => {
        console.log(`${p.holderShort} → ${p.amount}`);
        console.log(`  ${p.explorerUrl}`);
    });

    if (proof.count > 10) {
        console.log(`\n... and ${proof.count - 10} more`);
    }
}

function handleExport(roundId) {
    if (!roundId) {
        const latest = store.getLatestRound();
        if (!latest) {
            console.error('No rounds found.');
            return;
        }
        roundId = latest.round_id;
    }

    const data = exportPayoutData(roundId);
    console.log(JSON.stringify(data, null, 2));
}

// ============ API KEY COMMANDS ============

function handleApiKey(params) {
    const subcommand = params[0];

    switch (subcommand) {
        case 'create':
            handleApiKeyCreate(params.slice(1));
            break;
        case 'list':
            handleApiKeyList();
            break;
        case 'stats':
            handleApiKeyStats(params[1]);
            break;
        case 'revoke':
            handleApiKeyRevoke(params[1]);
            break;
        default:
            console.log('Usage: node cli.js api-key <create|list|stats|revoke> [options]');
    }
}

function handleApiKeyCreate(params) {
    const [name, tier] = params;

    if (!name) {
        console.error('❌ Usage: node cli.js api-key create <name> [tier]');
        console.log('   Tiers: public, integration (default), admin');
        return;
    }

    const validTier = tier || 'integration';
    if (!['public', 'integration', 'admin'].includes(validTier)) {
        console.error('❌ Invalid tier. Must be: public, integration, or admin');
        return;
    }

    try {
        const db = getDb();
        const result = apiKeys.createApiKey(db, { name, tier: validTier });

        console.log('\n✅ API Key created successfully!');
        console.log('─'.repeat(60));
        console.log(`Key ID:      ${result.keyId}`);
        console.log(`API Key:     ${result.apiKey}`);
        console.log(`Tier:        ${result.tier}`);
        console.log(`Rate Limit:  ${result.rateLimit} requests/minute`);
        console.log(`Created:     ${result.createdAt}`);
        console.log('\n⚠️  IMPORTANT: Save this API key securely!');
        console.log('   It will not be shown again.\n');
    } catch (error) {
        console.error(`❌ Failed: ${error.message}`);
    }
}

function handleApiKeyList() {
    try {
        const db = getDb();
        const keys = apiKeys.listApiKeys(db, false);

        console.log(`\n📋 API Keys (${keys.length})`);
        console.log('═'.repeat(80));

        if (keys.length === 0) {
            console.log('No API keys created yet.');
            console.log('Use: node cli.js api-key create <name> [tier]\n');
            return;
        }

        keys.forEach(key => {
            const status = key.isActive ? '✓ Active' : '✗ Inactive';
            console.log(`\n• ${key.keyId}`);
            console.log(`  Name:        ${key.name}`);
            console.log(`  Tier:        ${key.tier}`);
            console.log(`  Rate Limit:  ${key.rateLimit}/min`);
            console.log(`  Status:      ${status}`);
            console.log(`  Created:     ${key.createdAt}`);
            console.log(`  Last Used:   ${key.lastUsedAt || 'Never'}`);
        });
        console.log();
    } catch (error) {
        console.error(`❌ Failed: ${error.message}`);
    }
}

function handleApiKeyStats(keyId) {
    if (!keyId) {
        console.error('❌ Usage: node cli.js api-key stats <key_id>');
        return;
    }

    try {
        const db = getDb();
        const stats = apiKeys.getUsageStats(db, keyId);

        console.log(`\n📊 API Key Usage Statistics`);
        console.log('═'.repeat(60));
        console.log(`Key ID:          ${keyId}`);
        console.log(`Total Requests:  ${stats.total}`);
        console.log(`Last 24h:        ${stats.recent}`);
        console.log(`Current Rate:    ${stats.currentRate}/min`);

        if (stats.endpoints.length > 0) {
            console.log('\nTop Endpoints:');
            stats.endpoints.forEach(ep => {
                console.log(`  ${ep.endpoint.padEnd(40)} ${ep.count} requests`);
            });
        }

        if (stats.statusCodes.length > 0) {
            console.log('\nStatus Codes:');
            stats.statusCodes.forEach(sc => {
                console.log(`  ${sc.statusCode}  ${sc.count} requests`);
            });
        }
        console.log();
    } catch (error) {
        console.error(`❌ Failed: ${error.message}`);
    }
}

function handleApiKeyRevoke(keyId) {
    if (!keyId) {
        console.error('❌ Usage: node cli.js api-key revoke <key_id>');
        return;
    }

    try {
        const db = getDb();
        const success = apiKeys.revokeApiKey(db, keyId);

        if (success) {
            console.log(`✅ API key ${keyId} revoked successfully`);
        } else {
            console.log(`❌ API key ${keyId} not found`);
        }
    } catch (error) {
        console.error(`❌ Failed: ${error.message}`);
    }
}

// ============ WEBHOOK COMMANDS ============

function handleWebhook(params) {
    const subcommand = params[0];

    switch (subcommand) {
        case 'add':
            handleWebhookAdd(params.slice(1));
            break;
        case 'list':
            handleWebhookList(params[1]);
            break;
        case 'test':
            handleWebhookTest(params[1], params[2]);
            break;
        case 'logs':
            handleWebhookLogs(params[1]);
            break;
        case 'remove':
            handleWebhookRemove(params[1], params[2]);
            break;
        default:
            console.log('Usage: node cli.js webhook <add|list|test|logs|remove> [options]');
    }
}

function handleWebhookAdd(params) {
    const [url, ...events] = params;

    if (!url || events.length === 0) {
        console.error('❌ Usage: node cli.js webhook add <url> <event1> [event2] ...');
        console.log('   Events: round.started, round.completed, round.scored, token.registered, etc.');
        return;
    }

    // For CLI, we need to specify which API key owns this webhook
    // For simplicity, we'll use the first admin key or create one
    try {
        const db = getDb();
        const keys = apiKeys.listApiKeys(db, false);
        let keyId = keys.find(k => k.tier === 'admin')?.keyId;

        if (!keyId) {
            console.log('Creating admin API key for webhook management...');
            const newKey = apiKeys.createApiKey(db, { name: 'CLI Admin', tier: 'admin' });
            keyId = newKey.keyId;
        }

        const result = webhooks.registerWebhook(db, { keyId, url, events });

        console.log('\n✅ Webhook registered successfully!');
        console.log('─'.repeat(60));
        console.log(`Webhook ID:  ${result.webhookId}`);
        console.log(`URL:         ${result.url}`);
        console.log(`Events:      ${result.events.join(', ')}`);
        console.log(`Secret:      ${result.secret}`);
        console.log('\n⚠️  Save the secret for signature verification!\n');
    } catch (error) {
        console.error(`❌ Failed: ${error.message}`);
    }
}

function handleWebhookList(keyId) {
    try {
        const db = getDb();
        const keys = apiKeys.listApiKeys(db, false);

        // If no keyId specified, use first admin key
        if (!keyId) {
            keyId = keys.find(k => k.tier === 'admin')?.keyId;
        }

        if (!keyId) {
            console.log('No API keys found. Create one first with: node cli.js api-key create');
            return;
        }

        const hooks = webhooks.getWebhooksByKey(db, keyId, false);

        console.log(`\n📋 Webhooks (${hooks.length})`);
        console.log('═'.repeat(80));

        if (hooks.length === 0) {
            console.log('No webhooks registered yet.');
            console.log('Use: node cli.js webhook add <url> <events...>\n');
            return;
        }

        hooks.forEach(hook => {
            const status = hook.isActive ? '✓ Active' : '✗ Inactive';
            console.log(`\n• ${hook.webhookId}`);
            console.log(`  URL:      ${hook.url}`);
            console.log(`  Events:   ${hook.events.join(', ')}`);
            console.log(`  Status:   ${status}`);
            console.log(`  Created:  ${hook.createdAt}`);
        });
        console.log();
    } catch (error) {
        console.error(`❌ Failed: ${error.message}`);
    }
}

async function handleWebhookTest(webhookId, keyId) {
    if (!webhookId) {
        console.error('❌ Usage: node cli.js webhook test <webhook_id> [key_id]');
        return;
    }

    try {
        const db = getDb();

        // If no keyId, find the admin key
        if (!keyId) {
            const keys = apiKeys.listApiKeys(db, false);
            keyId = keys.find(k => k.tier === 'admin')?.keyId;
        }

        if (!keyId) {
            console.error('❌ No API key found');
            return;
        }

        console.log(`🧪 Sending test webhook to ${webhookId}...`);
        const result = await sendTestWebhook(webhookId, keyId);

        if (result.success) {
            console.log(`✅ Webhook delivered successfully!`);
            console.log(`   HTTP Status: ${result.httpStatus}`);
            console.log(`   Response Time: ${result.responseTimeMs}ms`);
        } else {
            console.log(`❌ Webhook delivery failed`);
            console.log(`   HTTP Status: ${result.httpStatus || 'N/A'}`);
            console.log(`   Error: ${result.error}`);
        }
    } catch (error) {
        console.error(`❌ Failed: ${error.message}`);
    }
}

function handleWebhookLogs(webhookId) {
    if (!webhookId) {
        console.error('❌ Usage: node cli.js webhook logs <webhook_id>');
        return;
    }

    try {
        const db = getDb();
        const logs = webhooks.getDeliveryLogs(db, webhookId, 20);

        console.log(`\n📜 Webhook Delivery Logs (last 20)`);
        console.log('═'.repeat(80));

        if (logs.length === 0) {
            console.log('No delivery logs found.\n');
            return;
        }

        logs.forEach(log => {
            const icon = log.status === 'delivered' ? '✓' : '✗';
            console.log(`${icon} ${log.eventType.padEnd(25)} | ${log.createdAt} | ${log.httpStatus || 'N/A'} | ${log.responseTimeMs || 'N/A'}ms`);
            if (log.errorMessage) {
                console.log(`  Error: ${log.errorMessage}`);
            }
        });
        console.log();

        // Show stats
        const stats = webhooks.getDeliveryStats(db, webhookId);
        console.log('Statistics:');
        console.log(`  Total Deliveries: ${stats.total}`);
        console.log(`  Success Rate: ${stats.successRate}%`);
        console.log(`  Avg Response Time: ${stats.avgResponseTime}ms`);
        console.log();
    } catch (error) {
        console.error(`❌ Failed: ${error.message}`);
    }
}

function handleWebhookRemove(webhookId, keyId) {
    if (!webhookId) {
        console.error('❌ Usage: node cli.js webhook remove <webhook_id> [key_id]');
        return;
    }

    try {
        const db = getDb();

        if (!keyId) {
            const keys = apiKeys.listApiKeys(db, false);
            keyId = keys.find(k => k.tier === 'admin')?.keyId;
        }

        if (!keyId) {
            console.error('❌ No API key found');
            return;
        }

        const success = webhooks.removeWebhook(db, webhookId, keyId);

        if (success) {
            console.log(`✅ Webhook ${webhookId} removed successfully`);
        } else {
            console.log(`❌ Webhook ${webhookId} not found or unauthorized`);
        }
    } catch (error) {
        console.error(`❌ Failed: ${error.message}`);
    }
}

// ============ BATCH OPERATIONS ============

function handleBatchRegister(csvFile) {
    if (!csvFile) {
        console.error('❌ Usage: node cli.js batch-register <csv_file>');
        console.log('   CSV format: mint,creator,name,symbol');
        return;
    }

    try {
        const content = fs.readFileSync(csvFile, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());

        let registered = 0;
        let skipped = 0;
        let failed = 0;

        console.log(`\n📦 Processing ${csvFile}...\n`);

        lines.forEach((line, index) => {
            if (index === 0 && line.toLowerCase().includes('mint')) {
                return; // Skip header
            }

            const [mint, creator, name, symbol] = line.split(',').map(s => s.trim());

            if (!mint) {
                failed++;
                console.log(`  ❌ Line ${index + 1}: Missing mint address`);
                return;
            }

            try {
                const result = registerToken(mint, creator || null, name || null, symbol || null);
                if (result.existing) {
                    skipped++;
                    console.log(`  ⚠️  ${mint.slice(0, 12)}... already registered`);
                } else {
                    registered++;
                    console.log(`  ✅ ${mint.slice(0, 12)}... registered`);
                }
            } catch (error) {
                failed++;
                console.log(`  ❌ ${mint.slice(0, 12)}... failed: ${error.message}`);
            }
        });

        console.log('\n' + '─'.repeat(60));
        console.log(`✅ Registered: ${registered}`);
        console.log(`⚠️  Skipped: ${skipped}`);
        console.log(`❌ Failed: ${failed}\n`);
    } catch (error) {
        console.error(`❌ Failed to read file: ${error.message}`);
    }
}

function handleBatchExport(roundId, format = 'json') {
    if (!roundId) {
        const latest = store.getLatestRound();
        if (!latest) {
            console.error('No rounds found.');
            return;
        }
        roundId = latest.round_id;
    }

    try {
        const data = exportPayoutData(roundId);
        const filename = `exports/${roundId}.${format}`;

        // Ensure exports directory exists
        if (!fs.existsSync('exports')) {
            fs.mkdirSync('exports');
        }

        if (format === 'json') {
            fs.writeFileSync(filename, JSON.stringify(data, null, 2));
        } else if (format === 'csv') {
            // Convert to CSV
            const csv = convertToCSV(data);
            fs.writeFileSync(filename, csv);
        }

        const stats = fs.statSync(filename);
        console.log(`\n💾 Exported round ${roundId}`);
        console.log(`   File: ${filename}`);
        console.log(`   Size: ${(stats.size / 1024).toFixed(2)} KB\n`);
    } catch (error) {
        console.error(`❌ Failed: ${error.message}`);
    }
}

function convertToCSV(data) {
    const headers = ['Round ID', 'Token Mint', 'Holder Address', 'Amount SOL', 'TX Signature'];
    const rows = data.payouts.map(p => [
        data.roundId,
        p.tokenMint,
        p.holderAddress,
        p.amountSOL,
        p.txSignature
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

// ============ WAITLIST MANAGEMENT ============

function handleWaitlist(params) {
    const subcommand = params[0];

    switch (subcommand) {
        case 'list':
            handleWaitlistList();
            break;
        case 'approve':
            handleWaitlistApprove(params[1], params[2]);
            break;
        case 'reject':
            handleWaitlistReject(params[1], params.slice(2).join(' '));
            break;
        case 'approved':
            handleWaitlistApproved();
            break;
        default:
            console.log('Usage: node cli.js waitlist <list|approve|reject|approved> [options]');
            console.log('');
            console.log('Commands:');
            console.log('  list                    Show pending developer applications');
            console.log('  approve <id> [tier]     Approve and auto-generate API key');
            console.log('  reject <id> [reason]    Reject application with optional reason');
            console.log('  approved                Show all approved developers with keys');
    }
}

function handleWaitlistList() {
    try {
        const waitlistStore = new WaitlistStore('./db/pumpleague.db');
        const pending = waitlistStore.getPendingDevelopers();

        console.log(`\n📋 Pending Developer Applications (${pending.length})`);
        console.log('═'.repeat(80));

        if (pending.length === 0) {
            console.log('No pending developer applications.\n');
            return;
        }

        pending.forEach(entry => {
            const date = new Date(entry.submitted_at).toISOString().split('T')[0];
            console.log(`\n  ID: ${entry.id}`);
            console.log(`  Twitter:  @${entry.twitter_handle}`);
            console.log(`  Wallet:   ${entry.wallet_address.slice(0, 12)}...${entry.wallet_address.slice(-8)}`);
            console.log(`  Email:    ${entry.email || 'N/A'}`);
            console.log(`  Applied:  ${date}`);
        });

        console.log('\n─'.repeat(80));
        console.log('To approve: node cli.js waitlist approve <id> [tier]');
        console.log('To reject:  node cli.js waitlist reject <id> [reason]\n');
    } catch (error) {
        console.error(`❌ Failed: ${error.message}`);
    }
}

function handleWaitlistApprove(id, tier = 'integration') {
    if (!id) {
        console.error('❌ Usage: node cli.js waitlist approve <id> [tier]');
        console.log('   Tiers: public, integration (default), admin');
        return;
    }

    const validTiers = ['public', 'integration', 'admin'];
    if (!validTiers.includes(tier)) {
        console.error(`❌ Invalid tier "${tier}". Must be: public, integration, or admin`);
        return;
    }

    try {
        const waitlistStore = new WaitlistStore('./db/pumpleague.db');
        const entry = waitlistStore.getEntryById(parseInt(id));

        if (!entry) {
            console.error(`❌ Waitlist entry #${id} not found`);
            return;
        }

        if (entry.status === 'approved') {
            console.log(`⚠️  Entry #${id} (@${entry.twitter_handle}) is already approved`);
            console.log(`   API Key ID: ${entry.api_key_id}`);
            return;
        }

        if (entry.status === 'rejected') {
            console.log(`⚠️  Entry #${id} was previously rejected`);
            return;
        }

        // Create API key for this developer
        const db = getDb();
        const keyName = `Developer: @${entry.twitter_handle}`;
        const apiKeyResult = apiKeys.createApiKey(db, {
            name: keyName,
            tier: tier,
            metadata: {
                waitlist_id: entry.id,
                twitter: entry.twitter_handle,
                wallet: entry.wallet_address
            }
        });

        // Mark entry as approved
        const approved = waitlistStore.approveEntry(parseInt(id), apiKeyResult.keyId, 'admin');

        if (approved) {
            console.log('\n✅ Developer Approved!');
            console.log('═'.repeat(60));
            console.log(`Developer:   @${entry.twitter_handle}`);
            console.log(`Wallet:      ${entry.wallet_address}`);
            console.log(`Email:       ${entry.email || 'N/A'}`);
            console.log('');
            console.log('📧 SEND TO DEVELOPER:');
            console.log('─'.repeat(60));
            console.log(`Key ID:      ${apiKeyResult.keyId}`);
            console.log(`API Key:     ${apiKeyResult.apiKey}`);
            console.log(`Tier:        ${tier}`);
            console.log(`Rate Limit:  ${apiKeyResult.rateLimit}/hour`);
            console.log('─'.repeat(60));
            console.log('\n⚠️  Copy the API key above and DM it to the developer!');
            console.log('   This key will NOT be shown again.\n');
        } else {
            console.error('❌ Failed to approve entry');
        }
    } catch (error) {
        console.error(`❌ Failed: ${error.message}`);
    }
}

function handleWaitlistReject(id, reason) {
    if (!id) {
        console.error('❌ Usage: node cli.js waitlist reject <id> [reason]');
        return;
    }

    try {
        const waitlistStore = new WaitlistStore('./db/pumpleague.db');
        const entry = waitlistStore.getEntryById(parseInt(id));

        if (!entry) {
            console.error(`❌ Waitlist entry #${id} not found`);
            return;
        }

        const rejected = waitlistStore.rejectEntry(parseInt(id), reason || null);

        if (rejected) {
            console.log(`\n✅ Rejected @${entry.twitter_handle}`);
            if (reason) {
                console.log(`   Reason: ${reason}`);
            }
            console.log('');
        } else {
            console.error('❌ Failed to reject entry');
        }
    } catch (error) {
        console.error(`❌ Failed: ${error.message}`);
    }
}

function handleWaitlistApproved() {
    try {
        const waitlistStore = new WaitlistStore('./db/pumpleague.db');
        const approved = waitlistStore.getApprovedDevelopers();

        console.log(`\n✅ Approved Developers (${approved.length})`);
        console.log('═'.repeat(80));

        if (approved.length === 0) {
            console.log('No approved developers yet.\n');
            return;
        }

        approved.forEach(entry => {
            const date = new Date(entry.approved_at).toISOString().split('T')[0];
            console.log(`\n  @${entry.twitter_handle}`);
            console.log(`  Wallet:     ${entry.wallet_address.slice(0, 12)}...`);
            console.log(`  API Key ID: ${entry.api_key_id}`);
            console.log(`  Approved:   ${date}`);
        });
        console.log('');
    } catch (error) {
        console.error(`❌ Failed: ${error.message}`);
    }
}

// ============ INTEGRATION TESTING ============

async function handleTestIntegration(apiKey) {
    if (!apiKey) {
        console.error('❌ Usage: node cli.js test-integration <api_key>');
        return;
    }

    console.log('\n🧪 Testing PumpLeague Integration\n');
    console.log('═'.repeat(60));

    // Test 1: Validate API key
    console.log('\n1. Testing API Key Validation...');
    try {
        const db = getDb();
        const keyDetails = apiKeys.validateApiKey(db, apiKey);

        if (keyDetails) {
            console.log('   ✅ API key is valid');
            console.log(`   Tier: ${keyDetails.tier}`);
            console.log(`   Rate Limit: ${keyDetails.rateLimit}/min`);
        } else {
            console.log('   ❌ API key is invalid');
            return;
        }
    } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        return;
    }

    // Test 2: Check rate limit
    console.log('\n2. Testing Rate Limit...');
    try {
        const db = getDb();
        const keyDetails = apiKeys.validateApiKey(db, apiKey);
        const rateLimit = apiKeys.checkRateLimit(db, keyDetails.keyId);

        console.log(`   ✅ Rate limit check passed`);
        console.log(`   Limit: ${rateLimit.limit}/min`);
        console.log(`   Current: ${rateLimit.current}`);
        console.log(`   Remaining: ${rateLimit.limit - rateLimit.current}`);
    } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
    }

    // Test 3: List registered tokens
    console.log('\n3. Testing Token Listing...');
    try {
        const tokens = getRegisteredTokens();
        console.log(`   ✅ Retrieved ${tokens.length} registered tokens`);
    } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
    }

    // Test 4: Get latest round
    console.log('\n4. Testing Round Data...');
    try {
        const latest = store.getLatestRound();
        if (latest) {
            console.log(`   ✅ Retrieved latest round: ${latest.round_id}`);
            console.log(`   Status: ${latest.status}`);
        } else {
            console.log('   ⚠️  No rounds found yet');
        }
    } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
    }

    console.log('\n' + '═'.repeat(60));
    console.log('✅ Integration test complete!\n');
}

function showHelp() {
    console.log(`
🏆 PUMPLEAGUE CLI

Usage: node cli.js <command> [options]

TOKEN MANAGEMENT:
  register <mint> [creator] [name] [symbol]   Register a token
  deactivate <mint>                           Remove token from competition
  tokens, list                                List all registered tokens
  batch-register <csv_file>                   Register multiple tokens from CSV
  
STATUS & HISTORY:
  status                                      Show current status
  history [limit]                             Show round history
  round [roundId]                             Show round details
  hof, hall-of-fame [limit]                   Show Hall of Fame
  token-history <mint>                        Show token's competition history
  
PAYOUTS:
  proof [roundId]                             Show payout proof with explorer links
  export [roundId]                            Export round data as JSON
  batch-export <roundId> [format]             Export round (json|csv)

API KEY MANAGEMENT:
  api-key create <name> [tier]                Create new API key
  api-key list                                List all API keys
  api-key stats <key_id>                      Show usage statistics
  api-key revoke <key_id>                     Revoke an API key

WEBHOOK MANAGEMENT:
  webhook add <url> <events...>               Register a webhook
  webhook list [key_id]                       List webhooks
  webhook test <webhook_id> [key_id]          Test webhook delivery
  webhook logs <webhook_id>                   View delivery logs
  webhook remove <webhook_id> [key_id]        Remove webhook

INTEGRATION:
  test-integration <api_key>                  Test API integration
  
HELP:
  help                                        Show this help

EXAMPLES:
  node cli.js register 7xKXtg...abc creator123 "MyToken" "MTK"
  node cli.js api-key create "My Bot" integration
  node cli.js webhook add https://mybot.com/hook round.completed
  node cli.js test-integration api_key_abc123...
  `);
}

main().catch(console.error);
