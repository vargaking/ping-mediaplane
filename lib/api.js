// lib/api.js
const express = require('express');
const config = require('../config');
const serverState = require('./state');
const { getRouter } = require('./mediasoup-worker');

const router = express.Router();

// Middleware for API Key check
const API_KEY = process.env.MEDIA_SERVER_API_KEY || 'default-insecure-key';

router.use((req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== API_KEY) {
        // For now, just warn or allow if default. Ideally block.
        if (API_KEY === 'default-insecure-key') {
            console.warn('⚠️  Warning: Using default insecure API key.');
        } else {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }
    next();
});

/**
 * Creates a WebRTC Transport on the router.
 */
async function createWebRtcTransport(mediasoupRouter) {
    const { listenIps, initialAvailableOutgoingBitrate } = config.webRtcTransport;

    const transport = await mediasoupRouter.createWebRtcTransport({
        listenIps: listenIps,
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        initialAvailableOutgoingBitrate: initialAvailableOutgoingBitrate,
    });

    transport.on('dtlsstatechange', (dtlsState) => {
        if (dtlsState === 'closed') {
            console.log(`Transport ${transport.id} DTLS closed.`);
            transport.close();
            serverState.transports.delete(transport.id);
        }
    });

    return transport;
}

// Endpoint 1: Get Router Capabilities
router.get('/router_capabilities', (req, res) => {
    const mediasoupRouter = getRouter();
    if (!mediasoupRouter) return res.status(503).json({ error: 'Mediasoup not initialized' });
    res.json(mediasoupRouter.rtpCapabilities);
});

// Endpoint 2: Create a WebRTC Transport
router.post('/create_transport', async (req, res) => {
    try {
        const mediasoupRouter = getRouter();
        if (!mediasoupRouter) return res.status(503).json({ error: 'Mediasoup not initialized' });

        const transport = await createWebRtcTransport(mediasoupRouter);

        serverState.transports.set(transport.id, transport);
        console.log(`Transport created: ${transport.id}`);

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

// Endpoint 3: Connect Transport
router.post('/connect_transport', async (req, res) => {
    const { transportId, dtlsParameters } = req.body;
    const transport = serverState.transports.get(transportId);

    if (!transport) {
        return res.status(404).json({ error: 'Transport not found' });
    }

    try {
        await transport.connect({ dtlsParameters });
        console.log(`Transport connected: ${transportId}`);
        res.status(204).send();
    } catch (error) {
        console.error('Error connecting transport:', error);
        res.status(500).json({ error: 'Failed to connect transport', details: error.message });
    }
});

// Endpoint 4: Create Producer
router.post('/produce', async (req, res) => {
    const { transportId, kind, rtpParameters } = req.body;
    const transport = serverState.transports.get(transportId);

    if (!transport) {
        return res.status(404).json({ error: 'Transport not found' });
    }

    try {
        const producer = await transport.produce({ kind, rtpParameters });

        serverState.producers.set(producer.id, producer);
        console.log(`Producer created: ${producer.id} (Kind: ${kind})`);

        res.json({ id: producer.id });
    } catch (error) {
        console.error('Error creating producer:', error);
        res.status(500).json({ error: 'Failed to create producer', details: error.message });
    }
});

// Endpoint 5: Create Consumer
router.post('/consume', async (req, res) => {
    const { transportId, producerId, rtpCapabilities } = req.body;
    const recvTransport = serverState.transports.get(transportId);
    const producer = serverState.producers.get(producerId);
    const mediasoupRouter = getRouter();

    if (!recvTransport || !producer) {
        return res.status(404).json({ error: 'Transport or Producer not found' });
    }

    if (!mediasoupRouter.canConsume({ producerId, rtpCapabilities })) {
        return res.status(400).json({ error: 'Client cannot consume this media stream' });
    }

    try {
        const consumer = await recvTransport.consume({
            producerId,
            rtpCapabilities,
            paused: true,
        });

        serverState.consumers.set(consumer.id, consumer);

        consumer.on('transportclose', () => {
            serverState.consumers.delete(consumer.id);
        });
        consumer.on('producerclose', () => {
            serverState.consumers.delete(consumer.id);
        });

        console.log(`Consumer created: ${consumer.id}`);

        res.json({
            id: consumer.id,
            producerId: producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            type: consumer.type,
            producerPaused: consumer.producerPaused,
        });
    } catch (error) {
        console.error('Error creating consumer:', error);
        res.status(500).json({ error: 'Failed to create consumer', details: error.message });
    }
});

// Endpoint 6: Resume Consumer
router.post('/resume_consumer', async (req, res) => {
    const { consumerId } = req.body;
    const consumer = serverState.consumers.get(consumerId);

    if (!consumer) {
        return res.status(404).json({ error: 'Consumer not found' });
    }

    try {
        await consumer.resume();
        console.log(`Consumer resumed: ${consumerId}`);
        res.status(204).send();
    } catch (error) {
        console.error('Error resuming consumer:', error);
        res.status(500).json({ error: 'Failed to resume consumer', details: error.message });
    }
});

module.exports = router;
