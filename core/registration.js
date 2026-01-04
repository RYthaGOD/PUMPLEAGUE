const store = require("../db/store");
const { getConnection } = require("../utils/connection");
const { PublicKey } = require("@solana/web3.js");

/**
 * Validate token exists on-chain as SPL token
 * Fix #14: On-chain token validation
 */
async function validateTokenOnChain(tokenMint) {
    try {
        const connection = getConnection();
        const mintPubkey = new PublicKey(tokenMint);

        // Get mint account info
        const accountInfo = await connection.getAccountInfo(mintPubkey);

        if (!accountInfo) {
            return { valid: false, error: 'Token account does not exist on-chain' };
        }

        // Check if it's a token mint (owner is Token Program)
        const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
        if (accountInfo.owner.toBase58() !== TOKEN_PROGRAM_ID) {
            return { valid: false, error: 'Account is not an SPL token mint' };
        }

        // Check minimum data length for mint account
        if (accountInfo.data.length < 82) {
            return { valid: false, error: 'Invalid mint account data' };
        }

        return { valid: true };
    } catch (error) {
        return { valid: false, error: error.message };
    }
}

/**
 * Register a new token for PumpLeague competition
 * Free opt-in model - tokens just need to be registered
 */
async function registerToken(tokenMint, creatorWallet, name = null, symbol = null, skipValidation = false) {
    // Validate token mint format (base58, 32-44 chars)
    if (!isValidPublicKey(tokenMint)) {
        throw new Error(`Invalid token mint address: ${tokenMint}`);
    }

    // On-chain validation (can be skipped for known-good tokens)
    if (!skipValidation) {
        const validation = await validateTokenOnChain(tokenMint);
        if (!validation.valid) {
            throw new Error(`Token validation failed: ${validation.error}`);
        }
    }

    // Fix #40: Auto-fetch metadata if not provided
    let tokenName = name;
    let tokenSymbol = symbol;

    if (!name || !symbol) {
        try {
            const dexscreener = require('../external/dexscreener');
            const marketData = await dexscreener.getTokenData(tokenMint);
            if (marketData) {
                tokenName = tokenName || marketData.baseToken?.name || null;
                tokenSymbol = tokenSymbol || marketData.baseToken?.symbol || null;
                console.log(`   📝 Auto-fetched metadata: ${tokenName} (${tokenSymbol})`);
            }
        } catch (e) {
            // Continue without metadata if fetch fails
            console.log(`   ⚠️ Could not fetch metadata: ${e.message}`);
        }
    }

    // Check if already registered
    const existing = store.getActiveTokens().find(t => t.token_mint === tokenMint);
    if (existing) {
        console.log(`⚠️ Token ${tokenMint.slice(0, 8)}... already registered`);
        return { success: true, existing: true };
    }

    store.registerToken(tokenMint, creatorWallet, tokenName, tokenSymbol);
    console.log(`✅ Registered token: ${tokenMint.slice(0, 8)}... (${tokenSymbol || 'unnamed'})`);

    return { success: true, existing: false, name: tokenName, symbol: tokenSymbol };
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
async function registerTokensBulk(tokens, skipValidation = true) {
    const results = [];

    for (const token of tokens) {
        try {
            const result = await registerToken(
                token.mint || token.tokenMint,
                token.creator || token.creatorWallet || null,
                token.name || null,
                token.symbol || null,
                skipValidation // Skip validation for bulk ops by default
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
    isValidPublicKey,
    validateTokenOnChain
};
