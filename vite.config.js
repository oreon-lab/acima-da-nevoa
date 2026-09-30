import { defineConfig } from 'vite';

// base './' keeps the build working from any folder or sub-path.
// showcase.html (object viewer) is served in dev only; the build has just index.html.
// three.js core goes in its own chunk (cached across game updates); the FBX loader is imported on demand.
export default defineConfig({
  base: './',
  server: { open: true },
  build: {
    chunkSizeWarningLimit: 700,   // three.js core alone is ~600 kB
    rollupOptions: { output: { manualChunks: id => (/node_modules[\\/]three[\\/]build/.test(id) ? 'three' : undefined) } },
  },
});
