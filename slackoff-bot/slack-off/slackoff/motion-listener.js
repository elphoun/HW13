import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';

const parsePacket = (buffer) => {
  try {
    const packet = JSON.parse(buffer.toString('utf8'));
    if (packet.type === 'button' || typeof packet.roll !== 'number') return null;
    return { ...packet, p: packet.p ?? 1 };
  } catch {
    return null;
  }
};

const createMotionListener = ({ port, now = Date.now, logger = console } = {}) => {
  const emitter = new EventEmitter();
  const lastSeenByPlayer = new Map();
  let socket = null;

  const receive = (sample) => {
    lastSeenByPlayer.set(sample.p, now());
    emitter.emit('sample', sample);
  };

  return {
    receive,
    start: () =>
      new Promise((resolve, reject) => {
        socket = dgram.createSocket('udp4');
        socket.on('message', (buffer) => {
          const sample = parsePacket(buffer);
          if (sample) receive(sample);
        });
        socket.once('error', reject);
        socket.bind(port, '0.0.0.0', () => {
          logger.info(`Listening for HeadMotionStreamer packets on UDP :${port}`);
          resolve();
        });
      }),
    stop: () => socket?.close(),
    onSample: (listener) => {
      emitter.on('sample', listener);
      return () => emitter.off('sample', listener);
    },
    isStreaming: (player, withinMs = 3000) => {
      const lastSeen = lastSeenByPlayer.get(player);
      return lastSeen !== undefined && now() - lastSeen <= withinMs;
    },
  };
};

export { createMotionListener, parsePacket };
