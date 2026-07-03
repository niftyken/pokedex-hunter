import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Bump this deliberately with each user-testable patch. A visible version is
// more reliable than inferring deployment state from browser caching behavior.
const APP_VERSION = 'v0.5.1';

export default defineConfig({
  plugins: [react()],
  server: { host: true },
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
});
