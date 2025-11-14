require('dotenv').config();

module.exports = {
    listenPort: process.env.LISTEN_PORT || 3000,
    worker: {
        rtcMinPort: 10000,
        rtcMaxPort: 10100,
        logLevel: 'warn',
        logTags: [
            'info',
            'ice',
            'dtls',
            'rtp',
            'rtcp',
            'rtx',
            'bwe',
            'score',
            'simulcast',
            'svc',
        ],
    },
    router: {
        mediaCodecs: [
            {
                kind: 'audio',
                mimeType: 'audio/opus',
                clockRate: 48000,
                channels: 2,
            },
            {
                kind: 'video',
                mimeType: 'video/VP8',
                clockRate: 90000,
                parameters: {
                    'x-google-start-bitrate': 1000,
                },
            },
        ],
    },
    webRtcTransport: {
        listenIps: [
            {
                ip: process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0', // Interface to listen on (0.0.0.0 for all)
                announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP // Public IP (needed if behind NAT/firewall)
            }
        ],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        initialAvailableOutgoingBitrate: 1000000, // 1 Mbps
    },
};