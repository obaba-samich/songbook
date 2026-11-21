import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The build inlines all JS, CSS and every songs/*.gsong file into one
// dist/index.html, so it opens straight from disk (file://) with no server.
export default defineConfig({
  plugins: [viteSingleFile()],
  server: { open: true },
  // alphaTab finds its audio/render workers next to its own file
  // (new URL('./alphaTab.worker.mjs', import.meta.url)); pre-bundling would move it.
  optimizeDeps: { exclude: ['@coderline/alphatab'] },
  worker: { format: 'es' },
  test: { include: ['tests/**/*.test.ts'] },
} as any);
