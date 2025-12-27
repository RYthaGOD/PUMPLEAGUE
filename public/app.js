/**
 * PumpLeague Arena Logic
 * Powering the Gladiator Scoreboard
 */

const API_BASE = '/api';

// State
let state = {
    status: null,
    leaderboard: [],
    hof: [],
    stats: null
};

/**
 * Initialize the Coliseum
 */
async function init() {
    console.log("🏛️ The Arena is preparing...");

    // Initial fetch
    await updateAll();

    // Polling - Every 15 seconds for more "live" battle feel
    setInterval(updateAll, 15000);
}

/**
 * Update all battle data
 */
async function updateAll() {
    try {
        await Promise.all([
            fetchStatus(),
            fetchLeaderboard(),
            fetchHOF(),
            fetchStats()
        ]);

        renderAll();
    } catch (error) {
        console.error("Battle data update failed:", error);
    }
}

async function fetchStatus() {
    try {
        const res = await fetch(`${API_BASE}/status`);
        state.status = await res.json();
    } catch (e) { console.error("Status fetch failed"); }
}

async function fetchLeaderboard() {
    try {
        const res = await fetch(`${API_BASE}/leaderboard`);
        state.leaderboard = await res.json();
    } catch (e) { console.error("Leaderboard fetch failed"); }
}

async function fetchHOF() {
    try {
        const res = await fetch(`${API_BASE}/hof`);
        state.hof = await res.json();
    } catch (e) { console.error("HOF fetch failed"); }
}

async function fetchStats() {
    try {
        const res = await fetch(`${API_BASE}/stats`);
        state.stats = await res.json();
    } catch (e) { console.error("Stats fetch failed"); }
}

/**
 * Render all components
 */
function renderAll() {
    renderEntranceStats();
    renderWarboard();
    renderChampions();
    renderWaitlistCount();

    if (state.status?.latestRound) {
        const statusEl = document.getElementById('round-status');
        if (statusEl) {
            statusEl.innerText = `ROUND ${state.status.latestRound.round_id} | ${state.status.latestRound.status.toUpperCase()}`;
        }
    }
}

function renderEntranceStats() {
    if (!state.stats) return;

    const totalBattles = document.getElementById('total-battles');
    const totalSol = document.getElementById('total-sol');
    const totalWarriors = document.getElementById('total-warriors');

    if (totalBattles) totalBattles.innerText = state.stats.totalRounds || 0;
    if (totalSol) totalSol.innerText = `${(state.stats.totalPaidOutSOL || 0).toFixed(2)} SOL`;
    if (totalWarriors) totalWarriors.innerText = state.status?.activeTokenCount || 0;
}

function renderWarboard() {
    const tbody = document.getElementById('leaderboard-body');
    if (!tbody) return;

    if (!state.leaderboard || state.leaderboard.length === 0) {
        tbody.innerHTML = `
            <tr class="loading-row">
                <td colspan="5">
                    <div class="loading-spinner"></div>
                    <span>No warriors in the arena yet...</span>
                </td>
            </tr>
        `;
        return;
    }

    // Show top 5 for preview
    const top5 = state.leaderboard.slice(0, 5);

    tbody.innerHTML = top5.map((t, i) => `
        <tr>
            <td class="rank-col">#${i + 1}</td>
            <td class="warrior-col">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <img src="https://api.dicebear.com/7.x/identicon/svg?seed=${t.token_mint}" 
                         alt="Token" 
                         style="width: 32px; height: 32px; border-radius: 50%; border: 2px solid var(--gold-dark);">
                    <div>
                        <div style="font-weight: 700; color: var(--gold);">${t.symbol || 'WARRIOR'}</div>
                        <div style="font-size: 11px; color: var(--marble); font-family: monospace;">${t.token_mint.slice(0, 8)}...</div>
                    </div>
                </div>
            </td>
            <td class="power-col" style="font-weight: 700; color: var(--crimson);">
                ${t.score ? parseFloat(t.score).toFixed(2) : '-'}
            </td>
            <td class="spoils-col" style="color: var(--gold); font-weight: 600;">
                ${t.claimedFees ? parseFloat(t.claimedFees).toFixed(4) : '0.0000'} SOL
            </td>
            <td class="status-col">
                <span style="color: ${t.isActive ? 'var(--crimson)' : 'var(--marble)'};">
                    ${t.isActive ? '⚔️ FIGHTING' : '🛡️ READY'}
                </span>
            </td>
        </tr>
    `).join('');
}

function renderChampions() {
    if (!state.leaderboard || state.leaderboard.length === 0) return;

    const top3 = state.leaderboard.slice(0, 3);

    // Champion 1 (Gold)
    const champ1 = document.getElementById('champion-1');
    if (champ1 && top3[0]) {
        champ1.querySelector('.champion-name').innerText = top3[0].symbol || 'CHAMPION';
        champ1.querySelector('.champion-glory').innerText = `${parseFloat(top3[0].claimedFees || 0).toFixed(2)} SOL`;
    }

    // Champion 2 (Silver)
    const champ2 = document.getElementById('champion-2');
    if (champ2 && top3[1]) {
        champ2.querySelector('.champion-name').innerText = top3[1].symbol || 'WARRIOR';
        champ2.querySelector('.champion-glory').innerText = `${parseFloat(top3[1].claimedFees || 0).toFixed(2)} SOL`;
    }

    // Champion 3 (Bronze)
    const champ3 = document.getElementById('champion-3');
    if (champ3 && top3[2]) {
        champ3.querySelector('.champion-name').innerText = top3[2].symbol || 'FIGHTER';
        champ3.querySelector('.champion-glory').innerText = `${parseFloat(top3[2].claimedFees || 0).toFixed(2)} SOL`;
    }
}

function renderWaitlistCount() {
    // This will be updated by waitlist.js
}

// Start the Protocol
init();
