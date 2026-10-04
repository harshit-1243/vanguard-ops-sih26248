import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

const serverUrl = process.env.VITE_SERVER_URL ?? 'http://localhost:8080';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    proxy: {
      '/api': serverUrl,
      '/healthz': serverUrl,
      '/socket.io': { target: serverUrl, ws: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
  test: { environment: 'node', include: ['test/**/*.test.{ts,tsx}'] },
});
