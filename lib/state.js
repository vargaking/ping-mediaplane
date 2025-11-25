// lib/state.js
module.exports = {
    // Map<transportId, transportObject>
    transports: new Map(),
    // Map<producerId, producerObject>
    producers: new Map(),
    // Map<consumerId, consumerObject>
    consumers: new Map(),
};
