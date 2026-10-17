import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative assets support a domain, subdomain, or /bonsai/ subdirectory.
  base: './',
  build: { outDir: 'dist', target: ['chrome109', 'firefox115', 'safari16.4'] },
});
