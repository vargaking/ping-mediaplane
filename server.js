// media_server/api.js (Runs on Node.js)
const express = require('express');
const router = express.Router();
// Assume 'router' and 'createWebRtcTransport' are defined as before

// Endpoint 1: Get Router Capabilities
router.get('/router_capabilities', (req, res) => {
    // Send the client the necessary configuration for mediasoup-client.Device
    res.json(router.rtpCapabilities);
});

// Endpoint 2: Create a WebRTC Transport
router.post('/create_transport', async (req, res) => {
    try {
        const { is_sending } = req.body;
        const transportParams = await createWebRtcTransport(is_sending);
        // Store the transport object in a global map/state using its ID
        serverState.transports.set(transportParams.id, transportParams.transport);

        // Return only the necessary connection parameters to FastAPI/Client
        res.json({
            id: transportParams.id,
            iceParameters: transportParams.iceParameters,
            iceCandidates: transportParams.iceCandidates,
            dtlsParameters: transportParams.dtlsParameters,
        });
    } catch (error) {
        console.error('Error creating transport:', error);
        res.status(500).send('Failed to create transport');
    }
});
// ... other endpoints for connect, produce, consume

module.exports = router;