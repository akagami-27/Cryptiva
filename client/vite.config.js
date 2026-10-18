import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendTarget = process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3000';
const backendProxy = { target: backendTarget, changeOrigin: false };

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/css': backendProxy,
      '/login': backendProxy,
      '/register': backendProxy,
      '/logout': backendProxy,
      // Keep React page navigation and refreshes in Vite. Proxy dashboard APIs only.
      '/dashboard/data': backendProxy,
      '/files': backendProxy,
      '/shared': backendProxy,
      '/security': backendProxy,
      '/profile': backendProxy,
      '/activity': backendProxy,
      '/search': backendProxy,
      '/me': backendProxy,
      '/csrf-token': backendProxy
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
