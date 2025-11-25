// lib/mediasoup-worker.js
const mediasoup = require('mediasoup');
const config = require('../config');

let worker;
let router;

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

    return { worker, router };
}

function getRouter() {
    return router;
}

module.exports = {
    startMediasoupWorker,
    getRouter
};
