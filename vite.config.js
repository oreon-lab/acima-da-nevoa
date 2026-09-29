import { defineConfig } from 'vite';

// base './' keeps the build working from any folder or sub-path.
// showcase.html (object viewer) is served in dev only; the build has just index.html.
export default defineConfig({
  base: './',
  server: { open: true },
  build: { chunkSizeWarningLimit: 900 },   // three.js alone is ~600 kB
});
