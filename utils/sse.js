/**
 * Server-Sent Events (SSE) Utilities
 * For real-time data streaming to clients
 */

/**
 * Initialize an SSE connection
 * @param {object} res - Express response object
 * @returns {object} - SSE stream object with helper methods
 */
function createSSEStream(res) {
    // Set SSE headers
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no' // Disable nginx buffering
    });

    // Send initial comment to establish connection
    res.write(': connected\n\n');

    const stream = {
        /**
         * Send an event to the client
         * @param {string} event - Event name
         * @param {object} data - Event data (will be JSON stringified)
         * @param {string} id - Optional event ID
         */
        send: (event, data, id = null) => {
            if (id) {
                res.write(`id: ${id}\n`);
            }
            res.write(`event: ${event}\n`);
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        },

        /**
         * Send a comment (keeps connection alive)
         * @param {string} comment - Comment text
         */
        comment: (comment) => {
            res.write(`: ${comment}\n\n`);
        },

        /**
         * Close the stream
         */
        close: () => {
            res.end();
        },

        /**
         * Check if stream is still open
         */
        isOpen: () => {
            return !res.writableEnded;
        }
    };

    // Send heartbeat every 30 seconds to keep connection alive
    const heartbeat = setInterval(() => {
        if (stream.isOpen()) {
            stream.comment('heartbeat');
        } else {
            clearInterval(heartbeat);
        }
    }, 30000);

    // Clean up on client disconnect
    res.on('close', () => {
        clearInterval(heartbeat);
    });

    return stream;
}

/**
 * SSE Stream Manager
 * Manages multiple SSE connections for broadcasting
 */
class SSEStreamManager {
    constructor() {
        this.streams = new Map();
        this.nextId = 1;
    }

    /**
     * Add a new stream
     * @param {object} stream - SSE stream object
     * @param {object} metadata - Optional metadata (e.g., API key, filters)
     * @returns {number} - Stream ID
     */
    addStream(stream, metadata = {}) {
        const id = this.nextId++;
        this.streams.set(id, { stream, metadata });

        // Remove stream when closed
        const checkClosed = setInterval(() => {
            if (!stream.isOpen()) {
                this.removeStream(id);
                clearInterval(checkClosed);
            }
        }, 5000);

        return id;
    }

    /**
     * Remove a stream
     * @param {number} id - Stream ID
     */
    removeStream(id) {
        const entry = this.streams.get(id);
        if (entry) {
            entry.stream.close();
            this.streams.delete(id);
        }
    }

    /**
     * Broadcast an event to all streams
     * @param {string} event - Event name
     * @param {object} data - Event data
     * @param {function} filter - Optional filter function (metadata) => boolean
     */
    broadcast(event, data, filter = null) {
        for (const [id, entry] of this.streams.entries()) {
            if (filter && !filter(entry.metadata)) {
                continue;
            }

            if (entry.stream.isOpen()) {
                try {
                    entry.stream.send(event, data);
                } catch (error) {
                    console.error(`Error broadcasting to stream ${id}:`, error);
                    this.removeStream(id);
                }
            } else {
                this.removeStream(id);
            }
        }
    }

    /**
     * Get number of active streams
     * @returns {number}
     */
    getStreamCount() {
        return this.streams.size;
    }

    /**
     * Close all streams
     */
    closeAll() {
        for (const [id, entry] of this.streams.entries()) {
            entry.stream.close();
        }
        this.streams.clear();
    }
}

module.exports = {
    createSSEStream,
    SSEStreamManager
};
