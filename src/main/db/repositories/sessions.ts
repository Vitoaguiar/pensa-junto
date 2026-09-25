import { and, desc, eq, isNull } from 'drizzle-orm'
import type { Db } from '../connection'
import { sessions, type SessionRow } from '../schema'
import { nowIso, uuid } from '../util'

export function createSessionsRepo(db: Db) {
  return {
    /** Sempre filtrado pelo aluno: um aluno nunca vê as sessões de outro. */
    listByStudent(studentId: string, status?: SessionRow['status']): SessionRow[] {
      const conditions = [eq(sessions.studentId, studentId), isNull(sessions.deletedAt)]
      if (status) conditions.push(eq(sessions.status, status))
      return db
        .select()
        .from(sessions)
        .where(and(...conditions))
        .orderBy(desc(sessions.lastActivityAt))
        .all()
    },
    getForStudent(id: string, studentId: string): SessionRow | undefined {
      return db
        .select()
        .from(sessions)
        .where(and(eq(sessions.id, id), eq(sessions.studentId, studentId), isNull(sessions.deletedAt)))
        .get()
    },
    create(input: {
      studentId: string
      title: string
      focus: SessionRow['focus']
      questionsTarget?: number
    }): SessionRow {
      const now = nowIso()
      const row: SessionRow = {
        id: uuid(),
        studentId: input.studentId,
        title: input.title,
        focus: input.focus,
        status: 'active',
        questionsTarget: input.questionsTarget ?? 5,
        createdAt: now,
        updatedAt: now,
        lastActivityAt: now,
        deletedAt: null,
        syncedAt: null
      }
      db.insert(sessions).values(row).run()
      return row
    },
    touch(id: string): void {
      const now = nowIso()
      db.update(sessions).set({ lastActivityAt: now, updatedAt: now }).where(eq(sessions.id, id)).run()
    },
    setStatus(id: string, status: SessionRow['status']): void {
      const now = nowIso()
      db.update(sessions).set({ status, updatedAt: now, lastActivityAt: now }).where(eq(sessions.id, id)).run()
    }
  }
}
export type SessionsRepo = ReturnType<typeof createSessionsRepo>
