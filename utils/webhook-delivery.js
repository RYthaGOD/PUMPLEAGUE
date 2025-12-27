/**
 * Webhook Delivery System
 * Handles dispatching events to registered webhooks with retry logic
 */

const axios = require('axios');
const crypto = require('crypto');
const { getDb } = require('../db/schema');
const webhooks = require('../db/webhooks');

/**
 * Generate HMAC signature for webhook payload
 * @param {object} payload - Event payload
 * @param {string} secret - Webhook secret
 * @returns {string} - Signature in format: sha256=<hex>
 */
function generateSignature(payload, secret) {
    const payloadString = JSON.stringify(payload);
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payloadString);
    return `sha256=${hmac.digest('hex')}`;
}

/**
 * Deliver a webhook to a single endpoint
 * @param {object} params - Delivery parameters
 * @param {string} params.url - Webhook URL
 * @param {string} params.secret - Webhook secret
 * @param {string} params.eventType - Event type
 * @param {object} params.payload - Event payload
 * @returns {Promise<object>} - { success, httpStatus, responseTimeMs, error }
 */
async function deliverWebhook({ url, secret, eventType, payload }) {
    const fullPayload = {
        event: eventType,
        timestamp: new Date().toISOString(),
        data: payload
    };

    const signature = generateSignature(fullPayload, secret);
    const startTime = Date.now();

    try {
        const response = await axios.post(url, fullPayload, {
            headers: {
                'Content-Type': 'application/json',
                'X-Webhook-Signature': signature,
                'X-Webhook-Event': eventType,
                'User-Agent': 'PumpLeague-Webhooks/1.0'
            },
            timeout: 10000, // 10 second timeout
            validateStatus: (status) => status >= 200 && status < 300
        });

        const responseTimeMs = Date.now() - startTime;

        return {
            success: true,
            httpStatus: response.status,
            responseTimeMs,
            error: null
        };
    } catch (error) {
        const responseTimeMs = Date.now() - startTime;
        const httpStatus = error.response?.status || null;
        const errorMessage = error.response?.data?.message || error.message;

        return {
            success: false,
            httpStatus,
            responseTimeMs,
            error: errorMessage
        };
    }
}

/**
 * Dispatch an event to all subscribed webhooks
 * @param {string} eventType - Event type (e.g., 'round.completed')
 * @param {object} payload - Event data
 */
async function dispatchEvent(eventType, payload) {
    try {
        const db = getDb();
        const subscribedWebhooks = webhooks.getWebhooksForEvent(db, eventType);

        if (subscribedWebhooks.length === 0) {
            console.log(`📡 No webhooks subscribed to ${eventType}`);
            return;
        }

        console.log(`📡 Dispatching ${eventType} to ${subscribedWebhooks.length} webhook(s)...`);

        // Deliver to all webhooks in parallel
        const deliveryPromises = subscribedWebhooks.map(async (webhook) => {
            // Log pending delivery
            const deliveryId = webhooks.logDelivery(db, {
                webhookId: webhook.webhookId,
                eventType,
                payload,
                status: 'pending'
            });

            // Attempt delivery
            const result = await deliverWebhook({
                url: webhook.url,
                secret: webhook.secret,
                eventType,
                payload
            });

            // Update delivery log
            if (result.success) {
                webhooks.updateDelivery(db, deliveryId, {
                    status: 'delivered',
                    httpStatus: result.httpStatus,
                    attempts: 1,
                    responseTimeMs: result.responseTimeMs
                });
                console.log(`  ✅ Delivered to ${webhook.url} (${result.responseTimeMs}ms)`);
            } else {
                // Calculate next retry time (exponential backoff: 1min, 5min, 15min)
                const nextRetryAt = new Date(Date.now() + 60000).toISOString(); // 1 minute

                webhooks.updateDelivery(db, deliveryId, {
                    status: 'retrying',
                    httpStatus: result.httpStatus,
                    attempts: 1,
                    errorMessage: result.error,
                    responseTimeMs: result.responseTimeMs,
                    nextRetryAt
                });
                console.log(`  ❌ Failed to deliver to ${webhook.url}: ${result.error}`);
            }

            return result;
        });

        await Promise.allSettled(deliveryPromises);
    } catch (error) {
        console.error(`Error dispatching ${eventType}:`, error);
    }
}

/**
 * Retry failed webhook deliveries
 * Should be run periodically (e.g., every minute)
 */
async function retryFailedDeliveries() {
    try {
        const db = getDb();
        const failedDeliveries = webhooks.getFailedDeliveries(db);

        if (failedDeliveries.length === 0) {
            return;
        }

        console.log(`🔄 Retrying ${failedDeliveries.length} failed webhook deliveries...`);

        for (const delivery of failedDeliveries) {
            const result = await deliverWebhook({
                url: delivery.url,
                secret: delivery.secret,
                eventType: delivery.eventType,
                payload: delivery.payload
            });

            const newAttempts = delivery.attempts + 1;

            if (result.success) {
                webhooks.updateDelivery(db, delivery.deliveryId, {
                    status: 'delivered',
                    httpStatus: result.httpStatus,
                    attempts: newAttempts,
                    responseTimeMs: result.responseTimeMs
                });
                console.log(`  ✅ Retry successful for delivery ${delivery.deliveryId}`);
            } else {
                // Check if max attempts reached
                if (newAttempts >= delivery.maxAttempts) {
                    webhooks.updateDelivery(db, delivery.deliveryId, {
                        status: 'failed',
                        httpStatus: result.httpStatus,
                        attempts: newAttempts,
                        errorMessage: result.error,
                        responseTimeMs: result.responseTimeMs
                    });
                    console.log(`  ❌ Max attempts reached for delivery ${delivery.deliveryId}`);
                } else {
                    // Calculate next retry with exponential backoff
                    const backoffMinutes = Math.pow(2, newAttempts) * 5; // 5min, 10min, 20min
                    const nextRetryAt = new Date(Date.now() + backoffMinutes * 60000).toISOString();

                    webhooks.updateDelivery(db, delivery.deliveryId, {
                        status: 'retrying',
                        httpStatus: result.httpStatus,
                        attempts: newAttempts,
                        errorMessage: result.error,
                        responseTimeMs: result.responseTimeMs,
                        nextRetryAt
                    });
                    console.log(`  ⏳ Retry ${newAttempts}/${delivery.maxAttempts} failed, next attempt at ${nextRetryAt}`);
                }
            }
        }
    } catch (error) {
        console.error('Error retrying failed deliveries:', error);
    }
}

/**
 * Start background retry worker
 * Retries failed deliveries every minute
 */
function startRetryWorker() {
    console.log('🔄 Starting webhook retry worker...');

    // Run immediately
    retryFailedDeliveries();

    // Then run every minute
    setInterval(retryFailedDeliveries, 60000);
}

/**
 * Send a test webhook event
 * @param {string} webhookId - Webhook ID
 * @param {string} keyId - API key ID (for authorization)
 * @returns {Promise<object>} - Delivery result
 */
async function sendTestWebhook(webhookId, keyId) {
    const db = getDb();
    const webhook = webhooks.getWebhookWithSecret(db, webhookId, keyId);

    if (!webhook) {
        throw new Error('Webhook not found or unauthorized');
    }

    const testPayload = {
        message: 'This is a test webhook delivery from PumpLeague',
        webhookId: webhookId,
        timestamp: new Date().toISOString()
    };

    const result = await deliverWebhook({
        url: webhook.url,
        secret: webhook.secret,
        eventType: 'test',
        payload: testPayload
    });

    // Log the test delivery
    webhooks.logDelivery(db, {
        webhookId,
        eventType: 'test',
        payload: testPayload,
        status: result.success ? 'delivered' : 'failed',
        httpStatus: result.httpStatus,
        attempts: 1,
        errorMessage: result.error,
        responseTimeMs: result.responseTimeMs
    });

    return result;
}

module.exports = {
    dispatchEvent,
    retryFailedDeliveries,
    startRetryWorker,
    sendTestWebhook,
    generateSignature,
    deliverWebhook
};
