import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig(({ command }) => ({
  root: 'gomoku',
  base: './',
  // Keep binary reference copies for local integrity tests, but deploy them only to COS.
  publicDir: command === 'serve' ? 'public' : false,
  plugins: [viteStaticCopy({ targets: [
    { src: fileURLToPath(new URL('./public/ort/*.js', import.meta.url)), dest: 'ort' },
    { src: fileURLToPath(new URL('./public/ort/*.json', import.meta.url)), dest: 'ort' },
    { src: fileURLToPath(new URL('./public/models/manifest.json', import.meta.url)), dest: 'models' },
    { src: fileURLToPath(new URL('./public/licenses/*', import.meta.url)), dest: 'licenses' },
  ] })],
  worker: { format: 'es' },
  build: {
    outDir: '../dist/五子棋',
    emptyOutDir: true,
    target: 'es2022',
  },
}));
