// server.js (The Mediasoup/Express Entry Point with Production Logic)

const mediasoup = require('mediasoup');
const express = require('express');
const bodyParser = require('body-parser');
const config = require('./config'); // Assumes a config file exists

// --- Global Mediasoup State (CRITICAL: Needs persistent state) ---
// NOTE: For simplicity, we use one single router and simple Maps.
// In a real multi-room app, this would be structured by 'roomId'.
let worker;
let router;
const serverState = {
    // Map<transportId, transportObject>
    transports: new Map(),
    // Map<producerId, producerObject>
    producers: new Map(),
};

// --- Initialization Functions ---

async function startMediasoupWorker() {
    worker = await mediasoup.createWorker({
        logLevel: config.worker.logLevel,
        logTags: config.worker.logTags,
        rtcMinPort: config.worker.rtcMinPort,
        rtcMaxPort: config.worker.rtcMaxPort,
    });
    worker.on('died', () => {
        console.error('mediasoup Worker died, exiting in 2 seconds...');
        process.exit(1);
    });
    console.log('✅ Mediasoup Worker created successfully.');

    // Create the main router for the voice channel
    // We assume a single, fixed room for this example
    router = await worker.createRouter({ mediaCodecs: config.router.mediaCodecs });
    console.log('✅ Mediasoup Router created successfully.');
}

/**
 * Creates a WebRTC Transport on the router.
 */
async function createWebRtcTransport() {
    // Note: We use the same function for both send and receive transports.
    const { listenIps, initialAvailableOutgoingBitrate } = config.webRtcTransport;

    const transport = await router.createWebRtcTransport({
        listenIps: listenIps,
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        initialAvailableOutgoingBitrate: initialAvailableOutgoingBitrate,
    });

    transport.on('dtlsstatechange', (dtlsState) => {
        if (dtlsState === 'closed') {
            console.log(`Transport ${transport.id} DTLS closed.`);
            // Clean up state
            transport.close();
            serverState.transports.delete(transport.id);
            // NOTE: PRODUCERS and CONSUMERS on this transport must also be closed/cleaned up
            // This is complex and crucial for stability.
        }
    });

    return transport;
}


// --- Express Server Setup ---

const app = express();
// Middleware to parse JSON bodies from FastAPI
app.use(bodyParser.json());

// --- API Endpoints ---

// Endpoint 1: Get Router Capabilities (Used by client to load mediasoup-client.Device)
app.get('/api/media/router_capabilities', (req, res) => {
    if (!router) return res.status(503).json({ error: 'Mediasoup not initialized' });
    // Note: The client side needs a slightly filtered version, but we send the raw capabilities here.
    res.json(router.rtpCapabilities);
});

// Endpoint 2: Create a WebRTC Transport (Used by FastAPI /test/transport/*)
app.post('/api/media/create_transport', async (req, res) => {
    try {
        const transport = await createWebRtcTransport();

        // Store the transport object internally
        serverState.transports.set(transport.id, transport);

        console.log(`Transport created: ${transport.id}`);

        // Return connection parameters to FastAPI/Client
        res.json({
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
        });
    } catch (error) {
        console.error('Error creating transport:', error);
        res.status(500).json({ error: 'Failed to create transport', details: error.message });
    }
});

// Endpoint 3: Connect Transport (Completes the DTLS handshake)
// This is typically called by the client after creating the send/receive transport locally.
app.post('/api/media/connect_transport', async (req, res) => {
    const { transportId, dtlsParameters } = req.body;
    const transport = serverState.transports.get(transportId);

    if (!transport) {
        return res.status(404).json({ error: 'Transport not found' });
    }

    try {
        await transport.connect({ dtlsParameters });
        console.log(`Transport connected: ${transportId}`);
        res.status(204).send(); // HTTP 204 No Content for success
    } catch (error) {
        console.error('Error connecting transport:', error);
        res.status(500).json({ error: 'Failed to connect transport', details: error.message });
    }
});


// Endpoint 4: Create Producer (Used by FastAPI /test/produce)
app.post('/api/media/produce', async (req, res) => {
    const { transportId, kind, rtpParameters } = req.body;
    const transport = serverState.transports.get(transportId);

    if (!transport) {
        return res.status(404).json({ error: 'Transport not found' });
    }

    try {
        const producer = await transport.produce({ kind, rtpParameters });

        // Store the producer
        serverState.producers.set(producer.id, producer);
        console.log(`Producer created: ${producer.id} (Kind: ${kind})`);

        // Return the producer ID to the client
        res.json({ id: producer.id });
    } catch (error) {
        console.error('Error creating producer:', error);
        res.status(500).json({ error: 'Failed to create producer', details: error.message });
    }
});

// Endpoint 5: Create Consumer (Used by FastAPI /test/consume)
app.post('/api/media/consume', async (req, res) => {
    const { transportId, producerId, rtpCapabilities } = req.body;
    const recvTransport = serverState.transports.get(transportId);
    const producer = serverState.producers.get(producerId);

    if (!recvTransport || !producer) {
        return res.status(404).json({ error: 'Transport or Producer not found' });
    }

    // 1. Check if the router can consume this producer given the client's capabilities
    if (!router.canConsume({ producerId, rtpCapabilities })) {
        return res.status(400).json({ error: 'Client cannot consume this media stream' });
    }

    try {
        const consumer = await recvTransport.consume({
            producerId,
            rtpCapabilities,
            paused: true, // Start paused, let the client resume when ready to display/play
        });

        // NOTE: We should store the consumer state in serverState here, but omit for simplicity.

        console.log(`Consumer created: ${consumer.id}`);

        // Return parameters to client
        res.json({
            id: consumer.id,
            producerId: producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            type: consumer.type,
            // You MUST send this if you started paused:
            producerPaused: consumer.producerPaused,
        });
    } catch (error) {
        console.error('Error creating consumer:', error);
        res.status(500).json({ error: 'Failed to create consumer', details: error.message });
    }
});


// --- Main Server Start Function ---

async function runServer() {
    await startMediasoupWorker();

    const API_PORT = config.listenPort || 3000;

    // START THE EXPRESS HTTP SERVER HERE
    app.listen(API_PORT, '0.0.0.0', () => {
        console.log(`\n\n🎉 Mediasoup API Server listening on http://0.0.0.0:${API_PORT}/api/media`);
        console.log('NOTE: Real-time signaling (WebSockets) is still needed for a multi-party chat!');
    });
}

// Execute the main function
runServer();