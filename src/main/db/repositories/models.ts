import { desc, eq } from 'drizzle-orm'
import type { Db } from '../connection'
import { llmModels, type LlmModelRow } from '../schema'
import { nowIso, uuid } from '../util'

export function createModelsRepo(db: Db) {
  return {
    list(): LlmModelRow[] {
      return db.select().from(llmModels).orderBy(desc(llmModels.createdAt)).all()
    },
    get(id: string): LlmModelRow | undefined {
      return db.select().from(llmModels).where(eq(llmModels.id, id)).get()
    },
    findByCatalogKey(catalogKey: string): LlmModelRow | undefined {
      return db.select().from(llmModels).where(eq(llmModels.catalogKey, catalogKey)).get()
    },
    insert(input: Omit<LlmModelRow, 'id' | 'createdAt' | 'updatedAt'>): LlmModelRow {
      const now = nowIso()
      const row: LlmModelRow = { id: uuid(), ...input, createdAt: now, updatedAt: now }
      db.insert(llmModels).values(row).run()
      return row
    },
    update(id: string, patch: Partial<Omit<LlmModelRow, 'id' | 'createdAt'>>): void {
      db.update(llmModels)
        .set({ ...patch, updatedAt: nowIso() })
        .where(eq(llmModels.id, id))
        .run()
    }
  }
}
export type ModelsRepo = ReturnType<typeof createModelsRepo>
