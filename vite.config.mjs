import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webBuildBoundary } from './scripts/web-build-boundary.mjs';

const host = process.env.TAURI_DEV_HOST;
const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const web = mode === 'web';
  return {
    root: 'src/renderer',
    base: web ? (process.env.WEB_BASE || './') : './',
    resolve: { alias: {
      '@platform': path.join(root, `src/renderer/platform/${web ? 'web' : 'desktop'}.js`),
      '@application': path.join(root, `src/renderer/${web ? 'web/WebApp.jsx' : 'App.jsx'}`)
    } },
    cacheDir: '../../node_modules/.vite',
    clearScreen: false,
    define: {
      __WORLD_CARD_STATION_TAURI_E2E__: JSON.stringify(mode === 'tauri-e2e')
    },
    plugins: [react(), ...(web ? [webBuildBoundary(root)] : [])],
    envPrefix: ['VITE_', 'TAURI_ENV_*'],
    server: {
      host: host || false,
      port: web ? 1422 : 1420,
      strictPort: true,
      hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
      watch: {
        ignored: ['**/tauri/**']
      }
    },
    build: {
      target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari15',
      minify: process.env.TAURI_ENV_DEBUG ? false : 'esbuild',
      sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
      outDir: web ? '../../dist/web' : '../../dist/renderer',
      emptyOutDir: true
    }
  };
});
