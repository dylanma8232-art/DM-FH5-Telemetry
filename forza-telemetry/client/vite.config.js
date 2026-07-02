import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 9189,
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://localhost:9188',
      '/socket.io': {
        target: 'http://localhost:9188',
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
