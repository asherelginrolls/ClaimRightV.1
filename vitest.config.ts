import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// "@/..." resolves to the project root, mirroring tsconfig.json "paths".
const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@': root,
    },
  },
  test: {
    // Node by default — API routes + pure libs run here. The few React
    // component tests that need a DOM opt in per-file via:
    //   // @vitest-environment jsdom
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    setupFiles: ['tests/setup/global-mocks.ts'],
    // Reset spies/mock state between tests for deterministic, isolated runs.
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      include: ['lib/**/*.ts', 'app/api/**/*.ts'],
      exclude: ['**/*.test.ts', 'tests/**'],
    },
  },
})
