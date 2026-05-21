import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: {
    outDir: '../public',
    emptyOutDir: true,
    assetsDir: 'assets',
  },
  server: {
    port: 5173,
    proxy: {
      '/v1': 'http://127.0.0.1:3000',
      '/models': 'http://127.0.0.1:3000',
      '/chat': 'http://127.0.0.1:3000',
      '/health': 'http://127.0.0.1:3000',
      '/status': 'http://127.0.0.1:3000',
    },
  },
});
