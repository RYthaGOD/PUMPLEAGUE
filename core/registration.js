const store = require("../db/store");

/**
 * Register a new token for PumpLeague competition
 * Free opt-in model - tokens just need to be registered
 */
function registerToken(tokenMint, creatorWallet, name = null, symbol = null) {
    // Validate token mint format (base58, 32-44 chars)
    if (!isValidPublicKey(tokenMint)) {
        throw new Error(`Invalid token mint address: ${tokenMint}`);
    }

    // Check if already registered
    const existing = store.getActiveTokens().find(t => t.token_mint === tokenMint);
    if (existing) {
        console.log(`⚠️ Token ${tokenMint.slice(0, 8)}... already registered`);
        return { success: true, existing: true };
    }

    store.registerToken(tokenMint, creatorWallet, name, symbol);
    console.log(`✅ Registered token: ${tokenMint.slice(0, 8)}... (${symbol || 'unnamed'})`);

    return { success: true, existing: false };
}

/**
 * Deactivate a token (remove from future rounds)
 */
function deactivateToken(tokenMint) {
    store.deactivateToken(tokenMint);
    console.log(`🚫 Deactivated token: ${tokenMint.slice(0, 8)}...`);
    return { success: true };
}

/**
 * Get all currently active tokens
 */
function getRegisteredTokens() {
    return store.getActiveTokens();
}

/**
 * Validate a Solana public key format
 */
function isValidPublicKey(address) {
    // Base58 characters
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    return base58Regex.test(address);
}

/**
 * Bulk register tokens (for migration from manual list)
 */
function registerTokensBulk(tokens) {
    const results = [];

    for (const token of tokens) {
        try {
            const result = registerToken(
                token.mint || token.tokenMint,
                token.creator || token.creatorWallet || null,
                token.name || null,
                token.symbol || null
            );
            results.push({ mint: token.mint || token.tokenMint, ...result });
        } catch (error) {
            results.push({ mint: token.mint || token.tokenMint, success: false, error: error.message });
        }
    }

    return results;
}

module.exports = {
    registerToken,
    deactivateToken,
    getRegisteredTokens,
    registerTokensBulk,
    isValidPublicKey
};
