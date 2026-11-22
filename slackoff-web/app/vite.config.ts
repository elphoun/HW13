import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({ plugins: [react()], server: {
    port: 5173,
    // AirPod motion: the Node bridge (slackoff-web/bridge, port 8080) streams it as Server-Sent Events.
    proxy: { '/events': { target: 'http://localhost:8080', changeOrigin: true } },
  } });
