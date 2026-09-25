import type Database from 'better-sqlite3'
import journal from './migrations/meta/_journal.json'

// Migrations versionadas, geradas pelo drizzle-kit e embutidas no bundle (nada para copiar no instalador).
const files = import.meta.glob('./migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>

export function runMigrations(sqlite: Database.Database): string[] {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS __migrations (
    tag TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`)
  const applied = new Set(
    (sqlite.prepare('SELECT tag FROM __migrations').all() as Array<{ tag: string }>).map((r) => r.tag)
  )
  const done: string[] = []
  for (const entry of journal.entries) {
    if (applied.has(entry.tag)) continue
    const sql = files[`./migrations/${entry.tag}.sql`]
    if (!sql) throw new Error(`Migration ${entry.tag} não encontrada no bundle`)
    const statements = sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean)
    sqlite.transaction(() => {
      for (const statement of statements) sqlite.exec(statement)
      sqlite.prepare('INSERT INTO __migrations (tag, applied_at) VALUES (?, ?)').run(entry.tag, new Date().toISOString())
    })()
    done.push(entry.tag)
  }
  return done
}
