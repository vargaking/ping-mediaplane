// server.js (The Main Mediasoup/Express Entry Point)

const mediasoup = require('mediasoup');
const express = require('express');
const bodyParser = require('body-parser'); // Needed to read JSON bodies
const config = require('./config');

// --- Global Mediasoup State ---
let worker;
let router;
const serverState = {
    transports: new Map(), // To store transport objects by ID
    producers: new Map(),
    // ... add other necessary state here
};

// --- Initialization Functions (Moved from previous plan) ---

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
    router = await worker.createRouter({ mediaCodecs: config.router.mediaCodecs });
    console.log('✅ Mediasoup Router created successfully.');
}

async function createWebRtcTransport(isSending) {
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
            // Clean up server state if transport closes unexpectedly
            transport.close();
            serverState.transports.delete(transport.id);
        }
    });

    return {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
        transport: transport
    };
}


// --- Express Server Setup ---

const app = express();
// Middleware to parse JSON bodies from FastAPI
app.use(bodyParser.json());

// --- API Endpoints (Your Router Logic) ---

// Endpoint 1: Get Router Capabilities
app.get('/api/media/router_capabilities', (req, res) => {
    if (!router) return res.status(503).json({ error: 'Mediasoup not initialized' });
    res.json(router.rtpCapabilities);
});

// Endpoint 2: Create a WebRTC Transport
app.post('/api/media/create_transport', async (req, res) => {
    try {
        const { is_sending } = req.body;
        const transportParams = await createWebRtcTransport(is_sending);

        // Store the transport object internally
        serverState.transports.set(transportParams.id, transportParams.transport);

        // Return connection parameters to FastAPI/Client
        res.json({
            id: transportParams.id,
            iceParameters: transportParams.iceParameters,
            iceCandidates: transportParams.iceCandidates,
            dtlsParameters: transportParams.dtlsParameters,
        });
    } catch (error) {
        console.error('Error creating transport:', error);
        res.status(500).json({ error: 'Failed to create transport', details: error.message });
    }
});

// --- Main Server Start Function ---

async function runServer() {
    await startMediasoupWorker();

    const API_PORT = config.listenPort;

    // START THE EXPRESS HTTP SERVER HERE
    app.listen(API_PORT, '0.0.0.0', () => {
        console.log(`\n\n🎉 Mediasoup API Server listening on http://0.0.0.0:${API_PORT}/api/media`);
    });
}

// Execute the main function
runServer();