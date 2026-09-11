import { build } from 'vite';
import path from 'node:path';

// Build-time only. The installed native executable embeds the checker and needs no Node.
await build({
  configFile: false,
  logLevel: 'error',
  build: {
    target: ['safari15', 'chrome105'],
    minify: false,
    outDir: process.argv[2],
    emptyOutDir: false,
    lib: {
      entry: path.resolve('src/renderer/gameCard/dryRun/entry.js'),
      name: 'WcsDryRun',
      formats: ['iife'],
      fileName: () => 'dry-run.js'
    }
  }
});
