// Configurable in-memory Supabase double. Reproduces ONLY the query shapes the
// route handlers actually use:
//
//   from(t).select(cols).eq(col,val).single()            -> Promise<{data,error}>
//   from(t).select(cols).eq(col,val).order(col,opts)      -> Promise<{data,error}>
//   from(t).update(values)              (cast to fn) (v)  -> { eq(col,val): Promise<{error}> }
//   from(t).insert(values)              (cast to fn) (v)  -> Promise<{data,error}>
//   storage.from(bucket).upload(path,buf,opts)            -> Promise<{data,error}>
//
// Every write is recorded so tests can assert what the handler persisted.

type DbError = { message: string } | null

export interface TableConfig {
  /** Result returned by `.select(...).eq(...).single()`. */
  single?: { data: unknown; error: DbError }
  /** Rows returned by `.select(...).eq(...).order(...)` (awaited directly). */
  rows?: unknown[]
  insertError?: DbError
  updateError?: DbError
}

export interface MockConfig {
  tables?: Record<string, TableConfig>
  storage?: { uploadError?: DbError }
}

export interface RecordedUpdate {
  table: string
  values: Record<string, unknown>
  column?: string
  value?: string
}

export interface RecordedInsert {
  table: string
  values: unknown
}

export interface MockSupabase {
  from(table: string): {
    select: (..._cols: unknown[]) => SelectBuilder
    update: (values: Record<string, unknown>) => { eq: (column: string, value: string) => Promise<{ error: DbError }> }
    insert: (values: unknown) => Promise<{ data: null; error: DbError }>
  }
  storage: {
    from: (bucket: string) => {
      upload: (path: string, body: unknown, opts?: unknown) => Promise<{ data: { path: string } | null; error: DbError }>
    }
  }
  // Test-side capture (not part of the real client surface)
  __updates: RecordedUpdate[]
  __inserts: RecordedInsert[]
  __uploads: Array<{ bucket: string; path: string }>
}

interface SelectBuilder {
  eq: (column: string, value: string) => SelectBuilder
  order: (column: string, opts?: unknown) => Promise<{ data: unknown[]; error: DbError }>
  single: () => Promise<{ data: unknown; error: DbError }>
}

export function createMockSupabase(config: MockConfig = {}): MockSupabase {
  const tables = config.tables ?? {}
  const updates: RecordedUpdate[] = []
  const inserts: RecordedInsert[] = []
  const uploads: Array<{ bucket: string; path: string }> = []

  function selectBuilder(table: string): SelectBuilder {
    const cfg = tables[table]
    const builder: SelectBuilder = {
      eq: () => builder,
      order: async () => ({ data: cfg?.rows ?? [], error: null }),
      single: async () =>
        cfg?.single ?? { data: null, error: { message: `no single result for ${table}` } },
    }
    return builder
  }

  return {
    from(table: string) {
      const cfg = tables[table]
      return {
        select: () => selectBuilder(table),
        update: (values: Record<string, unknown>) => ({
          eq: async (column: string, value: string) => {
            updates.push({ table, values, column, value })
            return { error: cfg?.updateError ?? null }
          },
        }),
        insert: async (values: unknown) => {
          inserts.push({ table, values })
          return { data: null, error: cfg?.insertError ?? null }
        },
      }
    },
    storage: {
      from(bucket: string) {
        return {
          upload: async (path: string) => {
            uploads.push({ bucket, path })
            const error = config.storage?.uploadError ?? null
            return { data: error ? null : { path }, error }
          },
        }
      },
    },
    __updates: updates,
    __inserts: inserts,
    __uploads: uploads,
  }
}
