import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The build inlines all JS, CSS and every songs/*.gsong file into one
// dist/index.html, so it opens straight from disk (file://) with no server.
export default defineConfig({
  plugins: [viteSingleFile()],
  server: { open: true },
  test: { include: ['tests/**/*.test.ts'] },
} as any);
