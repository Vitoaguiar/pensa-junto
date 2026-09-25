import { and, asc, eq, isNull } from 'drizzle-orm'
import type { Db } from '../connection'
import { classrooms, type ClassroomRow } from '../schema'
import { nowIso, uuid } from '../util'

export function createClassroomsRepo(db: Db) {
  return {
    list(): ClassroomRow[] {
      return db.select().from(classrooms).where(isNull(classrooms.deletedAt)).orderBy(asc(classrooms.name)).all()
    },
    create(input: { name: string; grade: number; schoolYear: number }): ClassroomRow {
      const now = nowIso()
      const row: ClassroomRow = { id: uuid(), ...input, createdAt: now, updatedAt: now, deletedAt: null, syncedAt: null }
      db.insert(classrooms).values(row).run()
      return row
    },
    update(id: string, patch: Partial<{ name: string; grade: number; schoolYear: number }>): void {
      db.update(classrooms)
        .set({ ...patch, updatedAt: nowIso() })
        .where(and(eq(classrooms.id, id), isNull(classrooms.deletedAt)))
        .run()
    },
    softDelete(id: string): void {
      const now = nowIso()
      db.update(classrooms).set({ deletedAt: now, updatedAt: now }).where(eq(classrooms.id, id)).run()
    }
  }
}
export type ClassroomsRepo = ReturnType<typeof createClassroomsRepo>
