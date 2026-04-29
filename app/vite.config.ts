import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// The Tauri CLI sets TAURI_ENV_* variables during dev/build.
// We use TAURI_DEV_HOST to detect whether this is a Tauri build.
const isTauri = process.env.TAURI_ENV_TARGET_TRIPLE !== undefined;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],

  // Anchor the project root to the directory containing this config file so
  // vite/vitest behave correctly regardless of the working directory from
  // which they are invoked (root vs. app/).
  root: path.resolve(__dirname, '.'),

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@monioc/shared': path.resolve(__dirname, '../packages/shared/src'),
      // Points at the landing package's source so WorkflowDemo mockups can
      // import from the single canonical copy instead of a stale duplicate.
      '@landing': path.resolve(__dirname, '../landing/src/landing'),
    },
  },

  // In Tauri the app is served from a custom Tauri protocol, not GitHub Pages,
  // so the base path is always '/'.
  base: '/',

  server: {
    port: 3000,
    // Tauri needs a fixed host so the webview can reach the dev server.
    host: isTauri ? '0.0.0.0' : 'localhost',
    // Disable open in Tauri dev mode — the Tauri CLI opens the window.
    open: !isTauri,
    strictPort: true,
    watch: {
      // Vite 5 triggers a full-page reload for any file change inside the
      // project root that is NOT part of the JS module graph. Without this
      // exclusion, running a receipt scan causes Python to write .pyc files
      // into src-tauri/__pycache__/, which Vite detects and reloads the
      // entire WebView — even though those files have nothing to do with the
      // frontend. Similarly, build/ holds grocery.sqlite3 and Vite output
      // artifacts that must never trigger HMR.
      ignored: ['**/src-tauri/**', '**/build/**'],
    },
  },

  // Vite env variables that the Tauri CLI exposes to the renderer process.
  envPrefix: ['VITE_', 'TAURI_'],

  build: {
    outDir: 'build',
    // Do NOT wipe the output directory before building. The grocery.sqlite3
    // bundled resource lives alongside the JS/CSS output in build/ and must
    // survive Vite rebuilds.  All Vite-generated assets use content-hashed
    // filenames so old bundles are never accidentally served.
    emptyOutDir: false,
    sourcemap: true,
    // Reduce memory usage on CI / low-RAM machines.
    target: isTauri ? ['chrome105', 'safari13'] : 'esnext',
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            const parts = id.split('node_modules/')[1].split('/');
            let pkg = parts[0];
            // Handle scoped packages (@scope/pkg).
            if (pkg.startsWith('@')) {
              pkg = `${parts[0]}/${parts[1]}`;
            }
            const sanitized = pkg.replace('@', '').replace('/', '.');
            return `vendor.${sanitized}`;
          }
        },
      },
    },
  },

  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
