import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendTarget = process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3000';
const reactPagePaths = new Set([
  '/', '/login', '/register', '/dashboard', '/files', '/shared', '/activity', '/profile', '/security'
]);
const backendPathPrefixes = [
  '/api/', '/health/', '/files/', '/shared/', '/activity/', '/profile/',
  '/security/', '/dashboard/', '/search/', '/me', '/csrf-token', '/login',
  '/register', '/logout', '/analytics/'
];

function reactRouteStatusPlugin() {
  const checkRoute = (req, res, next) => {
    if (req.method !== 'GET' || !req.headers.accept?.includes('text/html')) return next();
    const pathname = new URL(req.url, 'http://vite.local').pathname;
    const legacyAlias = /^\/react\/(login|register|dashboard|files|shared|activity|profile|security)$/.test(pathname);
    if (
      reactPagePaths.has(pathname) || legacyAlias ||
      backendPathPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix)) ||
      pathname.startsWith('/assets/') || pathname.startsWith('/images/') ||
      pathname.startsWith('/css/') || /\.[^/]+$/.test(pathname)
    ) return next();
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!doctype html><title>404</title><h1>Page not found</h1>');
  };

  return {
    name: 'cryptiva-react-route-status',
    enforce: 'pre',
    configureServer(server) { server.middlewares.use(checkRoute); },
    configurePreviewServer(server) { server.middlewares.use(checkRoute); }
  };
}
const backendProxy = {
  target: backendTarget,
  changeOrigin: false,
  bypass(req) {
    const pathname = new URL(req.url, 'http://vite.local').pathname;
    if (req.method === 'GET' && reactPagePaths.has(pathname)) return '/index.html';
  }
};

export default defineConfig({
  plugins: [react(), reactRouteStatusPlugin()],
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
      '/analytics': backendProxy,
      '/me': backendProxy,
      '/csrf-token': backendProxy,
      '/health': backendProxy,
      '/api': backendProxy
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
