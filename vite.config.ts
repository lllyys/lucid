import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Coverage is scoped to the logic layer (provider core, libs, stores) at 100%.
// The app shell (src/main.tsx, src/App.tsx) carries no logic and is excluded
// from the scoped thresholds; it is covered behaviorally by component tests.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Dev only: proxy the same-origin API paths to the self-hosted server (default :8787) so `pnpm dev`
  // mirrors the production single-origin deploy (#15) — the app calls `/config` + `/sync` with no CORS.
  // In production the server itself serves the built app (STATIC_DIR), so no proxy is involved.
  server: {
    proxy: {
      '/config': 'http://localhost:8787',
      '/sync': 'http://localhost:8787',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: [
        'src/providers/**/*.{ts,tsx}',
        'src/lib/**/*.{ts,tsx}',
        'src/stores/**/*.{ts,tsx}',
      ],
      exclude: ['**/*.test.*', 'src/providers/types.ts'],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
})
