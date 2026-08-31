import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(({ mode }) => {
  return {
    root: 'src/renderer',
    base: './',
    cacheDir: '../../node_modules/.vite',
    clearScreen: false,
    define: {
      __WORLD_CARD_STATION_TAURI_E2E__: JSON.stringify(mode === 'tauri-e2e')
    },
    plugins: [react()],
    envPrefix: ['VITE_', 'TAURI_ENV_*'],
    server: {
      host: host || false,
      port: 1420,
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
      outDir: '../../dist/renderer',
      emptyOutDir: true
    }
  };
});
