import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase, type DbHandle } from '../db/connection'
import { createRepositories, type Repositories } from '../db/repositories'
import { seedBaseline, seedDemo } from '../db/seed'
import { readSyncConfig, SupabaseSync, toPostgresRow } from './supabaseSync'

const upserts: Array<{ table: string; rows: Array<Record<string, unknown>> }> = []
let failNext = false

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => ({
      upsert: async (rows: Array<Record<string, unknown>>) => {
        if (failNext) {
          failNext = false
          return { error: { message: 'offline' } }
        }
        upserts.push({ table, rows })
        return { error: null }
      }
    })
  })
}))

let handle: DbHandle
let repos: Repositories
const config = { enabled: true, url: 'https://exemplo.supabase.co', anonKey: 'anon' }

beforeEach(() => {
  upserts.length = 0
  handle = openDatabase(':memory:')
  repos = createRepositories(handle.db)
  seedBaseline(handle, repos)
  seedDemo(repos)
})

describe('readSyncConfig', () => {
  it('fica desligada sem as variáveis', () => {
    expect(readSyncConfig({} as ImportMetaEnv)).toBeNull()
    expect(readSyncConfig({ MAIN_VITE_SYNC_ENABLED: 'true', MAIN_VITE_SUPABASE_URL: 'x' } as ImportMetaEnv)).toBeNull()
    expect(readSyncConfig({ MAIN_VITE_SYNC_ENABLED: 'false', MAIN_VITE_SUPABASE_URL: 'x', MAIN_VITE_SUPABASE_ANON_KEY: 'k' } as ImportMetaEnv)).toBeNull()
  })

  it('liga com as três variáveis', () => {
    const env = { MAIN_VITE_SYNC_ENABLED: 'true', MAIN_VITE_SUPABASE_URL: 'https://a.supabase.co', MAIN_VITE_SUPABASE_ANON_KEY: 'k' }
    expect(readSyncConfig(env as ImportMetaEnv)).toMatchObject({ url: 'https://a.supabase.co' })
  })
})

describe('SupabaseSync', () => {
  it('converte tipos para o Postgres', () => {
    expect(toPostgresRow('attempts', { id: 'a', is_correct: 1, answer_json: '{"kind":"integer","value":3}', synced_at: null })).toEqual({
      id: 'a',
      is_correct: true,
      answer_json: { kind: 'integer', value: 3 }
    })
  })

  it('envia só o que mudou, na ordem das chaves estrangeiras, e marca synced_at', async () => {
    const sync = new SupabaseSync(handle.sqlite, config, () => true)
    const first = await sync.pushAll()
    expect(first?.pushed).toBe(4) // 1 turma + 3 alunos
    expect(upserts.map((u) => u.table)).toEqual(['classrooms', 'students'])
    expect(upserts[1]!.rows[0]).not.toHaveProperty('synced_at')
    expect(typeof upserts[1]!.rows[0]!.is_active).toBe('boolean')

    upserts.length = 0
    expect((await sync.pushAll())?.pushed).toBe(0)

    const [ana] = repos.students.list()
    await new Promise((r) => setTimeout(r, 5))
    repos.students.update(ana!.id, { displayName: 'Aninha' })
    expect((await sync.pushAll())?.pushed).toBe(1)
    expect(upserts[0]!.rows[0]).toMatchObject({ display_name: 'Aninha' })
  })

  it('sem internet não tenta; com erro, tenta de novo depois', async () => {
    expect(await new SupabaseSync(handle.sqlite, config, () => false).pushAll()).toBeNull()
    failNext = true
    const sync = new SupabaseSync(handle.sqlite, config, () => true)
    expect(await sync.pushAll()).toBeNull()
    expect((await sync.pushAll())?.pushed).toBe(4)
  })
})
