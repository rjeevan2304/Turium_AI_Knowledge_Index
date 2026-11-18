import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The API runs on its own port in development. These paths are proxied to it so the
// browser only talks to one origin and no CORS configuration is needed.
const API_TARGET = process.env.API_TARGET ?? 'http://127.0.0.1:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/ingest': API_TARGET,
      '/items': API_TARGET,
      '/query': API_TARGET,
    },
  },
});
