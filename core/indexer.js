const { Connection, PublicKey } = require("@solana/web3.js");
const { TOKEN_PROGRAM_ID } = require("@solana/spl-token");
const config = require("../config");

const connection = new Connection(config.solanaRpcUrl, "confirmed");

// Known burn/null addresses to exclude
const EXCLUDED_ADDRESSES = new Set([
    "11111111111111111111111111111111",
    "1nc1nerator11111111111111111111111111111111"
]);

// Known program addresses (liquidity pools, vaults, etc.)
const PROGRAM_PREFIXES = ["pump", "raydium", "orca", "jupiter"];

/**
 * Check if an address should be excluded from holder calculations
 */
function shouldExcludeAddress(address) {
    if (EXCLUDED_ADDRESSES.has(address)) return true;

    // Exclude known program-owned addresses
    const lowerAddr = address.toLowerCase();
    for (const prefix of PROGRAM_PREFIXES) {
        if (lowerAddr.includes(prefix)) return true;
    }

    return false;
}

/**
 * Index ALL token holders for a given mint
 * This scans the entire TOKEN_PROGRAM_ID for accounts holding this token
 */
async function indexAllHolders(tokenMint) {
    const mintPubkey = new PublicKey(tokenMint);

    console.log(`🔍 Indexing all holders for ${tokenMint.slice(0, 8)}...`);

    try {
        // Get ALL token accounts for this mint
        const accounts = await connection.getParsedProgramAccounts(
            TOKEN_PROGRAM_ID,
            {
                filters: [
                    { dataSize: 165 }, // Standard token account size
                    {
                        memcmp: {
                            offset: 0,
                            bytes: mintPubkey.toBase58()
                        }
                    }
                ],
                commitment: "confirmed"
            }
        );

        const holders = [];

        for (const { pubkey, account } of accounts) {
            try {
                const parsed = account.data?.parsed?.info;
                if (!parsed) continue;

                const owner = parsed.owner;
                const balance = parsed.tokenAmount?.uiAmount || 0;

                // Skip zero balances
                if (balance === 0) continue;

                // Skip excluded addresses
                if (shouldExcludeAddress(owner)) continue;

                holders.push({
                    address: owner,
                    tokenAccount: pubkey.toBase58(),
                    balance: balance
                });
            } catch (e) {
                // Skip malformed accounts
                continue;
            }
        }

        console.log(`  Found ${holders.length} holders (from ${accounts.length} accounts)`);

        return holders;
    } catch (error) {
        console.error(`Error indexing holders: ${error.message}`);

        // Fallback to getTokenLargestAccounts if full scan fails
        // WARNING: This only returns top ~20 holders, not complete set
        console.warn(`  ⚠️ [${tokenMint.slice(0, 8)}] Full holder scan failed, using fallback (limited to ~20 holders)`);
        console.warn(`     This may result in incomplete payout distribution for this token.`);
        const fallbackHolders = await getFallbackHolders(tokenMint);
        // Mark these holders as from fallback for transparency
        return fallbackHolders.map(h => ({ ...h, fromFallback: true }));
    }
}

/**
 * Fallback method using getTokenLargestAccounts
 * Only returns top ~20 holders but is more reliable
 */
async function getFallbackHolders(tokenMint) {
    const mintPubKey = new PublicKey(tokenMint);
    const largestAccounts = await connection.getTokenLargestAccounts(mintPubKey);

    const holders = [];

    for (const acct of largestAccounts.value) {
        try {
            const info = await connection.getParsedAccountInfo(acct.address);
            const parsed = info.value?.data?.parsed?.info;

            if (!parsed) continue;

            const owner = parsed.owner;
            const balance = parsed.tokenAmount?.uiAmount || 0;

            if (balance === 0) continue;
            if (shouldExcludeAddress(owner)) continue;

            holders.push({
                address: owner,
                tokenAccount: acct.address.toBase58(),
                balance: balance
            });
        } catch (e) {
            continue;
        }
    }

    return holders;
}

/**
 * Get holder concentration statistics
 * Used for anti-fraud detection
 */
function analyzeHolderConcentration(holders) {
    if (holders.length === 0) return { top3Percent: 0, giniCoefficient: 0 };

    const totalBalance = holders.reduce((acc, h) => acc + h.balance, 0);
    if (totalBalance === 0) return { top3Percent: 0, giniCoefficient: 0 };

    // Sort by balance descending
    const sorted = [...holders].sort((a, b) => b.balance - a.balance);

    // Top 3 concentration
    const top3Balance = sorted.slice(0, 3).reduce((acc, h) => acc + h.balance, 0);
    const top3Percent = top3Balance / totalBalance;

    // Gini coefficient using sorted array formula - O(n log n) instead of O(n²)
    // Formula: G = (2 * sum(i * x_i)) / (n * sum(x_i)) - (n+1)/n
    const n = holders.length;
    let sumIX = 0;
    for (let i = 0; i < n; i++) {
        // Sorted descending, so invert index for ascending order
        sumIX += (n - i) * sorted[i].balance;
    }
    const giniCoefficient = (2 * sumIX) / (n * totalBalance) - (n + 1) / n;

    return {
        top3Percent,
        giniCoefficient: Math.max(0, Math.min(1, giniCoefficient)), // Clamp to [0, 1]
        holderCount: holders.length,
        totalBalance
    };
}

module.exports = {
    indexAllHolders,
    getFallbackHolders,
    analyzeHolderConcentration,
    shouldExcludeAddress
};
