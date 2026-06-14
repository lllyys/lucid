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
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
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
