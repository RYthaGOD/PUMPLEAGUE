const WebSocket = require('ws');
const http = require('http');

class WebSocketManager {
    constructor() {
        this.wss = null;
        this.clients = new Set();
    }

    /**
     * Initialize the WebSocket server
     * @param {http.Server} server - The HTTP server instance to attach to
     */
    init(server) {
        this.wss = new WebSocket.Server({ server });

        this.wss.on('connection', (ws, req) => {
            console.log(`🔌 New WebSocket connection from ${req.socket.remoteAddress}`);
            this.clients.add(ws);
            this.setupClient(ws);
        });

        console.log('⚡ WebSocket server initialized');
        this.startHeartbeat();
    }

    setupClient(ws) {
        ws.isAlive = true;

        ws.on('pong', () => {
            ws.isAlive = true;
        });

        ws.on('close', () => {
            this.clients.delete(ws);
        });

        ws.on('error', (err) => {
            console.error('WebSocket client error:', err.message);
            this.clients.delete(ws);
        });

        // Send initial connection success message
        this.send(ws, { type: 'connection', status: 'connected', timestamp: Date.now() });
    }

    /**
     * Broadcast a message to all connected clients
     * @param {string} type - Message type (e.g., 'round.started', 'leaderboard.update')
     * @param {object} payload - Data to send
     */
    broadcast(type, payload) {
        if (!this.wss) return;

        const message = JSON.stringify({
            type,
            timestamp: Date.now(),
            data: payload
        });

        for (const client of this.clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        }
    }

    /**
     * Send message to specific client
     */
    send(ws, data) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(data));
        }
    }

    /**
     * Keep connections alive with ping/pong
     */
    startHeartbeat() {
        setInterval(() => {
            this.wss.clients.forEach((ws) => {
                if (ws.isAlive === false) return ws.terminate();

                ws.isAlive = false;
                ws.ping();
            });
        }, 30000);
    }
}

// Export as singleton
module.exports = new WebSocketManager();
