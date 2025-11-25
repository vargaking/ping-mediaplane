// server.js (The Mediasoup/Express Entry Point with Production Logic)

const express = require('express');
const bodyParser = require('body-parser');
const config = require('./config');
const { startMediasoupWorker } = require('./lib/mediasoup-worker');
const apiRouter = require('./lib/api');

// --- Express Server Setup ---

const app = express();
// Middleware to parse JSON bodies from FastAPI
app.use(bodyParser.json());

// Mount the API router
app.use('/api/media', apiRouter);

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