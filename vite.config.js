import { defineConfig } from 'vite';

export default defineConfig({
  server: { proxy: { '/api': 'http://localhost:3000' } },
  preview: { proxy: { '/api': 'http://localhost:3000' } },
});
