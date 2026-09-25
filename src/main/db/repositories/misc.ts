import { and, asc, desc, eq, sql } from 'drizzle-orm'
import type { Db } from '../connection'
import { bnccSkills, generationLogs, llmModels } from '../schema'
import { nowIso, uuid } from '../util'

export function createBnccRepo(db: Db) {
  return {
    list() {
      return db.select().from(bnccSkills).orderBy(asc(bnccSkills.code)).all()
    },
    enabledCodes(): string[] {
      return db
        .select({ code: bnccSkills.code })
        .from(bnccSkills)
        .where(eq(bnccSkills.isEnabled, 1))
        .all()
        .map((r) => r.code)
    }
  }
}
export type BnccRepo = ReturnType<typeof createBnccRepo>

export interface NewGenerationLog {
  kind: string
  modelId: string | null
  latencyMs: number
  retries: number
  fellBack: boolean
}

export function createLogsRepo(db: Db) {
  return {
    insert(input: NewGenerationLog): void {
      db.insert(generationLogs)
        .values({
          id: uuid(),
          kind: input.kind,
          modelId: input.modelId,
          latencyMs: Math.round(input.latencyMs),
          retries: input.retries,
          fellBack: input.fellBack ? 1 : 0,
          createdAt: nowIso()
        })
        .run()
    },
    /** Últimas gerações de um tipo com um modelo (para ajustar quantas tentativas valem a pena). */
    recent(kind: string, modelId: string, limit: number): Array<{ fellBack: boolean }> {
      return db
        .select({ fellBack: generationLogs.fellBack })
        .from(generationLogs)
        .where(and(eq(generationLogs.kind, kind), eq(generationLogs.modelId, modelId)))
        .orderBy(desc(generationLogs.createdAt))
        .limit(limit)
        .all()
        .map((r) => ({ fellBack: r.fellBack === 1 }))
    },
    /** Métricas por modelo e por tipo de geração (para comparar modelos, para o pitch e para depurar). */
    stats() {
      return db
        .select({
          modelId: generationLogs.modelId,
          modelName: llmModels.displayName,
          kind: generationLogs.kind,
          total: sql<number>`count(*)`,
          avgLatencyMs: sql<number>`round(avg(${generationLogs.latencyMs}))`,
          fallbackPercent: sql<number>`round(avg(${generationLogs.fellBack}) * 100, 1)`
        })
        .from(generationLogs)
        .leftJoin(llmModels, eq(generationLogs.modelId, llmModels.id))
        .groupBy(generationLogs.modelId, generationLogs.kind)
        .orderBy(llmModels.displayName, generationLogs.kind)
        .all()
    }
  }
}
export type LogsRepo = ReturnType<typeof createLogsRepo>
