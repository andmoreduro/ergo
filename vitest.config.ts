import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // jsdom for DOM geometry helpers (preview scroll, content focus)—not RTL.
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
  },
});