import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base './' keeps asset paths relative, so the same build works on
// GitHub Pages (/repo-name/) and on any other static host.
export default defineConfig({
  base: './',
  // Shown in Settings so a phone can confirm it runs the latest deploy.
  define: { __BUILD__: JSON.stringify((process.env.GITHUB_SHA ?? 'local').slice(0, 7)) },
  plugins: [react()],
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
