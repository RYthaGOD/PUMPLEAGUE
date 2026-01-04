const API_URL = 'http://localhost:3001/api';
const WS_URL = 'ws://localhost:3001';

// State
let apiKey = localStorage.getItem('pumpleague_admin_key') || null;
let ws = null;

// DOM Elements
const views = {
    login: document.getElementById('loginOverlay'),
    main: document.querySelector('.container')
};

const inputs = {
    apiKey: document.getElementById('apiKeyInput'),
    emergencyToggle: document.getElementById('emergencyStopToggle')
};

const displays = {
    apiStatus: document.getElementById('apiStatus'),
    socketStatus: document.getElementById('socketStatus'),
    roundId: document.getElementById('roundId'),
    roundStatus: document.getElementById('roundStatus'),
    tokenCount: document.getElementById('tokenCount'),
    eventLog: document.getElementById('eventLog'),
    eventCount: document.getElementById('eventCount')
};

// Init
function init() {
    if (apiKey) {
        checkAuth();
    } else {
        showLogin();
    }

    // Bind events
    document.getElementById('loginBtn').addEventListener('click', handleLogin);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    inputs.emergencyToggle.addEventListener('change', toggleEmergencyStop);
}

function showLogin() {
    views.login.style.display = 'flex';
}

function hideLogin() {
    views.login.style.display = 'none';
}

async function handleLogin() {
    const key = inputs.apiKey.value.trim();
    if (!key) return alert('Enter API Key');

    apiKey = key;
    localStorage.setItem('pumpleague_admin_key', key);
    await checkAuth();
}

function handleLogout() {
    localStorage.removeItem('pumpleague_admin_key');
    apiKey = null;
    if (ws) ws.close();
    showLogin();
}

async function checkAuth() {
    try {
        const res = await fetch(`${API_URL}/status`, {
            headers: { 'X-API-Key': apiKey }
        });

        if (res.ok) {
            hideLogin();
            updateApiStatus(true);
            connectSocket();
            loadInitialData();
        } else {
            alert('Invalid API Key');
            handleLogout();
        }
    } catch (e) {
        console.error('Auth check failed', e);
        updateApiStatus(false);
    }
}

function updateApiStatus(ok) {
    displays.apiStatus.textContent = ok ? 'Online' : 'Offline';
    displays.apiStatus.className = `badge ${ok ? 'bg-ok' : 'bg-err'}`;
}

function connectSocket() {
    if (ws) ws.close();

    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
        displays.socketStatus.textContent = 'Connected';
        displays.socketStatus.className = 'badge bg-ok';
        log('🔌 WebSocket connected');
    };

    ws.onclose = () => {
        displays.socketStatus.textContent = 'Disconnected';
        displays.socketStatus.className = 'badge bg-err';
        log('🔌 WebSocket disconnected');
        setTimeout(connectSocket, 5000);
    };

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleSocketMessage(msg);
    };
}

function handleSocketMessage(msg) {
    log(`📨 Event: ${msg.type}`, msg.data);

    if (msg.type === 'round.started') {
        const d = msg.data;
        displays.roundId.textContent = d.roundId;
        displays.tokenCount.textContent = d.tokenCount;
        displays.roundStatus.textContent = 'Active';
    } else if (msg.type === 'round.completed') {
        const d = msg.data;
        displays.roundStatus.textContent = 'Complete';
    }
}

async function loadInitialData() {
    try {
        const res = await fetch(`${API_URL}/status`, { headers: { 'X-API-Key': apiKey } });
        const data = await res.json();

        // Populate fields
        displays.roundId.textContent = data.current_round?.round_id || 'None';
        inputs.emergencyToggle.checked = data.safety_status?.emergency_stop;

    } catch (e) {
        log('Failed to load initial data');
    }
}

async function toggleEmergencyStop(e) {
    if (!confirm('Are you sure you want to toggle Emergency Stop?')) {
        e.target.checked = !e.target.checked;
        return;
    }

    try {
        const enabled = e.target.checked;
        const res = await fetch(`${API_URL}/admin/emergency-stop`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey
            },
            body: JSON.stringify({ enabled })
        });

        if (!res.ok) throw new Error('Request failed');
        const data = await res.json();

        log(`🚨 Emergency Stop ${data.emergency_stop ? 'ENABLED' : 'DISABLED'}`);

    } catch (err) {
        log('Failed to toggle emergency stop');
        alert('Failed: ' + err.message);
        e.target.checked = !e.target.checked; // Revert
    }
}

function log(msg, data) {
    const el = document.createElement('div');
    el.innerHTML = `<span class="text-muted">[${new Date().toLocaleTimeString()}]</span> ${msg}`;
    if (data) {
        const pre = document.createElement('pre');
        pre.className = 'ms-3 text-secondary';
        pre.textContent = JSON.stringify(data, null, 2);
        el.appendChild(pre);
    }
    displays.eventLog.prepend(el);

    // Update count
    const count = parseInt(displays.eventCount.textContent) + 1;
    displays.eventCount.textContent = `${count} events`;
}

// Start
init();
