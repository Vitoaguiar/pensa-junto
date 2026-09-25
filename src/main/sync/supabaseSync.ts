import type Database from 'better-sqlite3'
import { SYNCABLE_TABLES } from '../db/schema'

// Sincronização OPCIONAL com o Supabase. Só push, em lotes, quando houver internet.
// Sem as variáveis de ambiente, nada aqui roda e o app é 100% local.
// NUNCA use a service_role key num app desktop: ela fica exposta no instalador.

export interface SyncConfig {
  enabled: boolean
  url: string
  anonKey: string
}

export function readSyncConfig(env: ImportMetaEnv): SyncConfig | null {
  const enabled = env.MAIN_VITE_SYNC_ENABLED === 'true'
  const url = env.MAIN_VITE_SUPABASE_URL?.trim() ?? ''
  const anonKey = env.MAIN_VITE_SUPABASE_ANON_KEY?.trim() ?? ''
  if (!enabled || !url || !anonKey) return null
  return { enabled, url, anonKey }
}

const BATCH_SIZE = 200
const INTERVAL_MS = 60_000

/** Colunas SQLite INTEGER 0/1 que viram boolean no Postgres. */
const BOOLEAN_COLUMNS: Record<string, string[]> = {
  students: ['is_active'],
  attempts: ['is_correct']
}
/** Colunas TEXT com JSON que viram jsonb no Postgres. */
const JSON_COLUMNS: Record<string, string[]> = {
  questions: ['params_json', 'correct_answer_json'],
  attempts: ['answer_json']
}

type Row = Record<string, unknown>

export function toPostgresRow(table: string, row: Row): Row {
  const out: Row = { ...row }
  delete out.synced_at
  for (const col of BOOLEAN_COLUMNS[table] ?? []) out[col] = out[col] === 1
  for (const col of JSON_COLUMNS[table] ?? []) {
    if (typeof out[col] === 'string') out[col] = JSON.parse(out[col] as string)
  }
  return out
}

export class SupabaseSync {
  private timer: NodeJS.Timeout | null = null
  private running = false

  constructor(
    private readonly sqlite: Database.Database,
    private readonly config: SyncConfig,
    private readonly isOnline: () => boolean
  ) {}

  start(): void {
    if (this.timer) return
    void this.pushAll()
    this.timer = setInterval(() => void this.pushAll(), INTERVAL_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** Envia tudo que mudou desde o último envio. Tabelas na ordem das chaves estrangeiras. */
  async pushAll(): Promise<{ pushed: number } | null> {
    if (this.running || !this.isOnline()) return null
    this.running = true
    let pushed = 0
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const client = createClient(this.config.url, this.config.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      })
      for (const table of SYNCABLE_TABLES) {
        for (;;) {
          const rows = this.sqlite
            .prepare(`SELECT * FROM ${table} WHERE synced_at IS NULL OR updated_at > synced_at LIMIT ?`)
            .all(BATCH_SIZE) as Row[]
          if (rows.length === 0) break
          const { error } = await client.from(table).upsert(rows.map((r) => toPostgresRow(table, r)), { onConflict: 'id' })
          if (error) throw new Error(`${table}: ${error.message}`)
          const mark = this.sqlite.prepare(`UPDATE ${table} SET synced_at = ? WHERE id = ? AND updated_at = ?`)
          const now = new Date().toISOString()
          this.sqlite.transaction(() => {
            for (const r of rows) mark.run(now, r.id, r.updated_at)
          })()
          pushed += rows.length
          if (rows.length < BATCH_SIZE) break
        }
      }
      return { pushed }
    } catch (err) {
      console.warn('[sync] envio adiado:', err instanceof Error ? err.message : err)
      return null
    } finally {
      this.running = false
    }
  }
}
