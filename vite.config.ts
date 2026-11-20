import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {fileURLToPath} from 'url';
import {defineConfig} from 'vite';

// Vite 8 loads this config through the native ESM loader, where the CommonJS
// `__dirname` global is not defined. Derive it from import.meta.url instead so
// the alias below resolves without the "__dirname is not defined" ESM warning.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // Same-origin API access for the real backend (keeps the httpOnly
      // refresh_token cookie working without CORS during development).
      // Use the IPv4 literal 127.0.0.1, NOT "localhost": on Windows Node 17+
      // resolves "localhost" to ::1 (IPv6) first, and the Spring Boot backend
      // binds IPv4-only (0.0.0.0:8080), so "localhost" yields ECONNREFUSED and
      // the proxy answers 502 Bad Gateway. 127.0.0.1 pins the working IPv4 path.
      proxy: {
        '/api': {
          target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:8080',
          changeOrigin: true,
        },
      },
    },
  };
});
