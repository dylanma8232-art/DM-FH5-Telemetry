import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxyTarget = process.env.VITE_PROXY_TARGET || 'http://localhost:9188';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 9189,
    host: '0.0.0.0',
    proxy: {
      '/api': proxyTarget,
      '/socket.io': {
        target: proxyTarget,
        ws: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          recharts: ['recharts'],
          vendor: ['react', 'react-dom'],
        },
      },
    },
  },
});
