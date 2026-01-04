/**
 * Twitter Integration for PumpLeague
 * Uses twitter-api-v2 for API v2 posting
 */

const { TwitterApi } = require("twitter-api-v2");
const config = require("../config");
const { generatePayoutCard } = require("../payout/proof");
const { getPublicSummary } = require("../payout/accounting");

// Initialize Twitter client (lazy loaded)
let twitterClient = null;

// Rate limit tracking
let lastTweetTime = 0;
const MIN_TWEET_INTERVAL_MS = 60000; // 1 minute minimum between tweets
let rateLimitResetTime = 0;

/**
 * Get Twitter client instance
 * Uses OAuth 1.0a User Context for posting
 */
function getTwitterClient() {
    if (twitterClient) return twitterClient;

    if (!config.twitter.enabled) {
        return null;
    }

    // Check for required credentials
    const { apiKey, apiSecret, accessToken, accessTokenSecret } = config.twitter;

    if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
        console.warn("⚠️ Twitter credentials incomplete. Check .env file.");
        return null;
    }

    try {
        twitterClient = new TwitterApi({
            appKey: apiKey,
            appSecret: apiSecret,
            accessToken: accessToken,
            accessSecret: accessTokenSecret
        });

        return twitterClient;
    } catch (error) {
        console.error(`Twitter client init error: ${error.message}`);
        return null;
    }
}

/**
 * Post a tweet with rate limit handling
 * @param {string} text - Tweet text (max 280 chars)
 * @param {object} options - Optional settings
 * @returns {Promise<{success: boolean, tweetId?: string, error?: string}>}
 */
async function postTweet(text, options = { maxRetries: 3 }) {
    const client = getTwitterClient();

    if (!client) {
        console.log(`[Twitter Disabled] Would post: ${text.slice(0, 50)}...`);
        return { success: false, error: "Twitter not configured" };
    }

    // Check if we're rate limited
    if (Date.now() < rateLimitResetTime) {
        const waitTime = Math.ceil((rateLimitResetTime - Date.now()) / 1000);
        console.log(`⏳ Twitter rate limited, waiting ${waitTime}s...`);
        await sleep(rateLimitResetTime - Date.now());
    }

    // Enforce minimum interval between tweets
    const timeSinceLastTweet = Date.now() - lastTweetTime;
    if (timeSinceLastTweet < MIN_TWEET_INTERVAL_MS) {
        const waitTime = MIN_TWEET_INTERVAL_MS - timeSinceLastTweet;
        console.log(`⏳ Rate limiting self, waiting ${Math.ceil(waitTime / 1000)}s...`);
        await sleep(waitTime);
    }

    // Truncate to 280 chars if needed
    const tweetText = text.length > 280 ? text.slice(0, 277) + "..." : text;

    // Retry loop with exponential backoff
    for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
        try {
            const result = await client.v2.tweet(tweetText);
            lastTweetTime = Date.now();

            console.log(`✅ Posted to Twitter: ${result.data.id}`);
            return { success: true, tweetId: result.data.id };
        } catch (error) {
            // Handle rate limit (429)
            if (error.code === 429 || error.rateLimit) {
                // Fix #24: Handle both seconds and milliseconds formats
                let resetTime;
                if (error.rateLimit?.reset) {
                    const resetValue = error.rateLimit.reset;
                    // If value is small (< year 2000 in seconds), it's seconds
                    // If value is large (> year 2000 in ms), it's already milliseconds
                    if (resetValue < 946684800000) { // Year 2000 in ms
                        resetTime = resetValue * 1000; // Convert seconds to ms
                    } else {
                        resetTime = resetValue; // Already in milliseconds
                    }
                } else {
                    resetTime = Date.now() + 15 * 60 * 1000; // Default 15 min
                }

                rateLimitResetTime = resetTime;
                const waitSec = Math.ceil((resetTime - Date.now()) / 1000);

                console.warn(`🚫 Twitter rate limited. Reset in ${waitSec}s`);

                if (attempt < options.maxRetries) {
                    console.log(`   Waiting for rate limit reset...`);
                    await sleep(resetTime - Date.now() + 1000);
                    continue;
                }
            }

            // Handle other errors
            if (attempt < options.maxRetries) {
                const delay = Math.pow(2, attempt) * 1000;
                console.log(`   Tweet attempt ${attempt}/${options.maxRetries} failed, retrying in ${delay}ms...`);
                await sleep(delay);
                continue;
            }

            console.error(`❌ Twitter post failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    return { success: false, error: "Max retries exceeded" };
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Announce round completion
 */
async function announceRoundComplete(roundId, topTokens) {
    const summary = getPublicSummary(roundId);

    // Console message (full version)
    const consoleMessage = formatRoundCompleteMessage(roundId, summary, topTokens);
    console.log(consoleMessage);

    // Twitter message (short version for 280 char limit)
    if (config.twitter.enabled) {
        const tweet = generateRoundCompleteTweet(roundId, summary, topTokens);
        await postTweet(tweet);
    }

    return consoleMessage;
}

/**
 * Generate short tweet for round completion (fits 280 chars)
 */
function generateRoundCompleteTweet(roundId, summary, topTokens) {
    const winner = topTokens[0];

    let tweet = `🏆 PumpLeague ${roundId.slice(0, 12)}...\n\n`;
    tweet += `🥇 Winner: ${winner?.token_mint?.slice(0, 8) || 'N/A'}...\n`;
    tweet += `💰 ${summary?.totalDistributed || '0 SOL'} distributed\n`;
    tweet += `👥 ${summary?.holdersPaid || 0} holders paid\n\n`;
    tweet += `All payouts verified on-chain ✅\n\n`;
    tweet += `#PumpLeague #Solana`;

    return tweet;
}

/**
 * Format round completion message (console, full version)
 */
function formatRoundCompleteMessage(roundId, summary, topTokens) {
    const medals = ['🥇', '🥈', '🥉'];

    let message = `\n${'═'.repeat(50)}\n`;
    message += `🏆 PUMPLEAGUE ROUND ${roundId} COMPLETE 🏆\n`;
    message += `${'═'.repeat(50)}\n\n`;

    message += `📊 RESULTS:\n`;
    topTokens.slice(0, 3).forEach((t, i) => {
        message += `${medals[i]} ${t.token_mint.slice(0, 12)}...\n`;
        message += `   Score: ${t.score?.toFixed(2) || 0} | Fees: ${t.claimed_fees?.toFixed(4) || 0} SOL\n`;
    });

    message += `\n💰 DISTRIBUTION:\n`;
    message += `   Total Claimed: ${summary?.totalClaimed || '0 SOL'}\n`;
    message += `   Distributed: ${summary?.totalDistributed || '0 SOL'}\n`;
    message += `   Holders Paid: ${summary?.holdersPaid || 0}\n`;

    message += `\n✅ All payouts verified on-chain\n`;
    message += `${'═'.repeat(50)}\n`;

    return message;
}

/**
 * Announce leaderboard (console only)
 */
function announceLeaderboard(topTokens) {
    console.log(`\n🏆 PUMPLEAGUE LEADERBOARD 🏆`);
    console.log(`${'─'.repeat(40)}`);

    const medals = ['🥇', '🥈', '🥉'];

    topTokens.forEach((t, idx) => {
        const medal = idx < 3 ? medals[idx] : `#${idx + 1}`;
        console.log(`${medal} ${t.token_mint.slice(0, 12)}...`);
        console.log(`   Score: ${t.score?.toFixed(2) || 0} | Fees: ${t.claimed_fees?.toFixed(4) || 0} SOL | Holders: ${t.holder_count || 0}`);
    });

    console.log(`${'─'.repeat(40)}\n`);
}

/**
 * Post winner announcement tweet
 */
async function postWinnerTweet(roundId, winner) {
    const tweet = `🏆 PumpLeague Round Winner!\n\n` +
        `🥇 ${winner.token_mint?.slice(0, 8) || 'N/A'}...\n` +
        `💰 ${winner.claimed_fees?.toFixed(4) || 0} SOL claimed\n` +
        `👥 ${winner.holder_count || 0} holders paid\n\n` +
        `Verified on-chain ✅\n\n` +
        `#PumpLeague #Solana #DeFi`;

    return await postTweet(tweet);
}

/**
 * Post custom announcement
 */
async function postAnnouncement(message) {
    return await postTweet(message);
}

module.exports = {
    getTwitterClient,
    postTweet,
    announceRoundComplete,
    announceLeaderboard,
    postWinnerTweet,
    postAnnouncement,
    generateRoundCompleteTweet,
    formatRoundCompleteMessage
};
