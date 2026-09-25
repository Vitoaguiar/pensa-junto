import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import { runMigrations } from './migrate'

export type Db = BetterSQLite3Database<typeof schema>

export interface DbHandle {
  sqlite: Database.Database
  db: Db
  close(): void
}

/** Abre (ou cria) o banco, liga as chaves estrangeiras e o WAL e aplica as migrations pendentes. */
export function openDatabase(filePath: string): DbHandle {
  const sqlite = new Database(filePath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')
  runMigrations(sqlite)
  const db = drizzle(sqlite, { schema })
  return { sqlite, db, close: () => sqlite.close() }
}
