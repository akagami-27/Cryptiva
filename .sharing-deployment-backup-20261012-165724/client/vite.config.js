import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/css': 'http://127.0.0.1:3000',
      '/login': 'http://127.0.0.1:3000',
      '/register': 'http://127.0.0.1:3000',
      '/logout': 'http://127.0.0.1:3000',
      '/dashboard': 'http://127.0.0.1:3000',
      '/files': 'http://127.0.0.1:3000',
      '/shared': 'http://127.0.0.1:3000',
      '/security': 'http://127.0.0.1:3000',
      '/profile': 'http://127.0.0.1:3000',
      '/activity': 'http://127.0.0.1:3000',
      '/me': 'http://127.0.0.1:3000',
      '/csrf-token': 'http://127.0.0.1:3000'
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
