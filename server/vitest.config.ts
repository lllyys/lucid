import { defineConfig } from 'vitest/config'

// Coverage gate (#28): proxy.ts (the SSRF allow-list) + app.ts (the /proxy route logic + the reused
// auth guard) are the feature's gated surface at 100% — the SSRF-critical paths must never regress
// uncovered. Excluded: index.ts (socket-bind entry glue — mirrors the root vite.config's src/main.tsx
// exclusion; its pure parts are unit-tested but not coverage-gated), db.ts (the pre-existing node:sqlite
// store — its uncovered lines are corrupt-row / rollback defensive guards that predate #28 and need a
// broken DB to exercise), and types.ts (type-only).
export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**'],
      exclude: ['**/*.test.ts', 'src/index.ts', 'src/db.ts', 'src/types.ts'],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
})
