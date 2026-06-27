import { defineConfig } from 'vite';

// Development server config. `base: './'` keeps asset paths relative so the
// same build works whether hosted at a domain root or a subpath (Vercel-safe).
export default defineConfig({
  base: './',
  server: {
    port: 8080,
    host: true, // expose on the local network so you can test on a real phone
  },
  clearScreen: false,
});
