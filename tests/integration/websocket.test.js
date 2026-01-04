const { test, describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const WebSocket = require('ws');
const websocketManager = require('../../utils/websocket');

describe('WebSocket Integration', () => {
    let server;
    let wsClient;
    const PORT = 3999;

    before((done) => {
        // Start a real HTTP server
        server = http.createServer();
        websocketManager.init(server);

        server.listen(PORT, () => {
            done();
        });
    });

    after((done) => {
        if (wsClient) wsClient.close();
        websocketManager.wss.close(() => {
            server.close(done);
        });
    });

    it('should allow a client to connect and receive welcome message', (t, done) => {
        wsClient = new WebSocket(`ws://localhost:${PORT}`);

        wsClient.on('message', (data) => {
            const msg = JSON.parse(data);
            if (msg.type === 'connection') {
                assert.strictEqual(msg.status, 'connected');
                done();
            }
        });
    });

    it('should receive broadcast messages', (t, done) => {
        // Ensure client is connected from previous test or new one
        if (wsClient.readyState !== WebSocket.OPEN) {
            wsClient = new WebSocket(`ws://localhost:${PORT}`);
            wsClient.on('open', sendBroadcast);
        } else {
            sendBroadcast();
        }

        function sendBroadcast() {
            // Listen for specific message
            wsClient.once('message', (data) => {
                const msg = JSON.parse(data);
                if (msg.type === 'test.event') {
                    assert.strictEqual(msg.data.foo, 'bar');
                    done();
                }
            });

            // Trigger broadcast
            websocketManager.broadcast('test.event', { foo: 'bar' });
        }
    });
});
