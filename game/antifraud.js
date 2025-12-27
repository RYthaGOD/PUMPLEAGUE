const config = require("../config");

/**
 * Detect suspicious activity that may indicate wash trading or manipulation
 */
async function detectFraud(tokenStats, holders) {
    const flags = [];
    const thresholds = config.antifraud;

    // 1. Holder concentration check
    // If top 3 wallets hold > 80% of supply, suspicious
    if (holders.length > 0) {
        const totalBalance = holders.reduce((acc, h) => acc + h.balance, 0);
        const sorted = [...holders].sort((a, b) => b.balance - a.balance);
        const top3Balance = sorted.slice(0, 3).reduce((acc, h) => acc + h.balance, 0);
        const concentration = top3Balance / totalBalance;

        if (concentration > thresholds.maxConcentration) {
            flags.push(`HIGH_CONCENTRATION:${(concentration * 100).toFixed(1)}%`);
        }
    }

    // 2. Abnormal fee-to-volume ratio
    // Very high fees relative to volume suggests wash trading
    if (tokenStats.volume_24h && tokenStats.volume_24h > 0) {
        const feeRatio = (tokenStats.claimed_fees || 0) / tokenStats.volume_24h;
        if (feeRatio > thresholds.maxFeeToVolumeRatio) {
            flags.push(`ABNORMAL_FEE_RATIO:${(feeRatio * 100).toFixed(1)}%`);
        }
    }

    // 3. Too few unique holders
    if (holders.length < thresholds.minHolderCount) {
        flags.push(`LOW_HOLDER_COUNT:${holders.length}`);
    }

    // 4. Suspicious holder patterns
    // Multiple holders with identical balances (potential bot activity)
    const balanceCounts = {};
    for (const h of holders) {
        const key = h.balance.toFixed(4);
        balanceCounts[key] = (balanceCounts[key] || 0) + 1;
    }
    const duplicateBalances = Object.values(balanceCounts).filter(c => c > 2);
    if (duplicateBalances.length > 3) {
        flags.push(`DUPLICATE_BALANCES:${duplicateBalances.length}`);
    }

    // Calculate penalty multiplier
    // More flags = larger penalty
    const penaltyMultiplier = Math.max(0.2, 1 - (flags.length * 0.2));

    // 5. AI Adjudication (if enabled and suspicious)
    let aiAssessment = null;
    if (flags.length > 0 && config.ai.enabled) {
        try {
            const agent = require("../ai/agent");
            aiAssessment = await agent.adjudicateFraud(tokenStats, holders, flags);
        } catch (error) {
            console.error(`[Fraud] AI Adjudication failed: ${error.message}`);
        }
    }

    return {
        isSuspicious: flags.length >= 2 || (aiAssessment && aiAssessment.includes('HIGH')),
        flags,
        penaltyMultiplier,
        aiAssessment,
        analysis: {
            holderCount: holders.length,
            flagCount: flags.length
        }
    };
}

/**
 * Check if a token should be disqualified entirely
 */
function shouldDisqualify(fraudResult) {
    // Disqualify if 3+ fraud flags
    return fraudResult.flags.length >= 3;
}

/**
 * Generate fraud report for a token
 */
function generateFraudReport(tokenMint, tokenStats, holders) {
    const result = detectFraud(tokenStats, holders);

    return {
        tokenMint,
        status: result.isSuspicious ? 'SUSPICIOUS' : 'CLEAN',
        disqualified: shouldDisqualify(result),
        flags: result.flags,
        penaltyApplied: result.penaltyMultiplier < 1,
        penaltyMultiplier: result.penaltyMultiplier,
        details: {
            holderCount: holders.length,
            minRequired: config.antifraud.minHolderCount
        }
    };
}

module.exports = {
    detectFraud,
    shouldDisqualify,
    generateFraudReport
};
