import { and, asc, eq, isNull } from 'drizzle-orm'
import type { Db } from '../connection'
import { attempts, questions, type AttemptRow, type QuestionRow } from '../schema'
import { nowIso, uuid } from '../util'

export type NewQuestion = Omit<
  QuestionRow,
  'id' | 'createdAt' | 'updatedAt' | 'answeredAt' | 'deletedAt' | 'syncedAt' | 'hintsUsed' | 'attemptsCount' | 'status'
>

export type QuestionPatch = Partial<Pick<QuestionRow, 'status' | 'hintsUsed' | 'attemptsCount' | 'answeredAt'>>

export function createQuestionsRepo(db: Db) {
  return {
    listBySession(sessionId: string): QuestionRow[] {
      return db
        .select()
        .from(questions)
        .where(and(eq(questions.sessionId, sessionId), isNull(questions.deletedAt)))
        .orderBy(asc(questions.position))
        .all()
    },
    get(id: string): QuestionRow | undefined {
      return db.select().from(questions).where(eq(questions.id, id)).get()
    },
    insert(input: NewQuestion): QuestionRow {
      const now = nowIso()
      const row: QuestionRow = {
        id: uuid(),
        ...input,
        status: 'pending',
        hintsUsed: 0,
        attemptsCount: 0,
        createdAt: now,
        answeredAt: null,
        updatedAt: now,
        deletedAt: null,
        syncedAt: null
      }
      db.insert(questions).values(row).run()
      return row
    },
    update(id: string, patch: QuestionPatch): void {
      db.update(questions)
        .set({ ...patch, updatedAt: nowIso() })
        .where(eq(questions.id, id))
        .run()
    },
    addAttempt(questionId: string, answerJson: string, isCorrect: boolean): AttemptRow {
      const now = nowIso()
      const row: AttemptRow = {
        id: uuid(),
        questionId,
        answerJson,
        isCorrect: isCorrect ? 1 : 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncedAt: null
      }
      db.insert(attempts).values(row).run()
      return row
    },
    listAttempts(questionId: string): AttemptRow[] {
      return db
        .select()
        .from(attempts)
        .where(and(eq(attempts.questionId, questionId), isNull(attempts.deletedAt)))
        .orderBy(asc(attempts.createdAt))
        .all()
    }
  }
}
export type QuestionsRepo = ReturnType<typeof createQuestionsRepo>
