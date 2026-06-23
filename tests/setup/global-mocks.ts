import { vi } from 'vitest'

// The `voyageai` SDK ships an ESM build with a directory subpath import
// (dist/esm/api) that Node/Vite cannot resolve, which crashes any test file
// that transitively imports lib/voyage.ts. Tests never make real embedding
// calls, so stub the client package globally. Individual tests still mock
// lib/retrieval / lib/voyage where they need to control return values.
vi.mock('voyageai', () => ({
  VoyageAIClient: class {
    embed(): Promise<{ data: Array<{ embedding: number[] }> }> {
      return Promise.resolve({ data: [{ embedding: new Array(1024).fill(0) }] })
    }
  },
}))
