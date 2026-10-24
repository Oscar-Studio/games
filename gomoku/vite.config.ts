import { defineConfig } from 'vite';

export default defineConfig({
  root: 'gomoku',
  base: './',
  worker: { format: 'es' },
  build: {
    outDir: '../dist/五子棋',
    emptyOutDir: true,
    target: 'es2022',
  },
});
