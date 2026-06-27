import { defineConfig } from 'vite';

// Production build config. Outputs a static bundle to `dist/` that Vercel
// serves as-is. Phaser is split into its own chunk so the app code can be
// cached separately from the (large, rarely-changing) engine.
export default defineConfig({
  base: './',
  logLevel: 'warn',
  build: {
    outDir: 'dist',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
});
