import { and, asc, eq, isNull, ne } from 'drizzle-orm'
import type { Db } from '../connection'
import { students, type StudentRow } from '../schema'
import { nowIso, uuid } from '../util'

export interface NewStudent {
  classroomId: string | null
  fullName: string
  displayName: string
  grade: number
  pinHash: string
  avatarKey: string
  colorKey: string
}

export type StudentPatch = Partial<
  Pick<StudentRow, 'classroomId' | 'fullName' | 'displayName' | 'grade' | 'avatarKey' | 'colorKey' | 'isActive'>
>

export function createStudentsRepo(db: Db) {
  return {
    list(options: { includeInactive?: boolean } = {}): StudentRow[] {
      const where = options.includeInactive
        ? isNull(students.deletedAt)
        : and(isNull(students.deletedAt), eq(students.isActive, 1))
      return db.select().from(students).where(where).orderBy(asc(students.displayName)).all()
    },
    get(id: string): StudentRow | undefined {
      return db
        .select()
        .from(students)
        .where(and(eq(students.id, id), isNull(students.deletedAt)))
        .get()
    },
    findActiveByPinHash(pinHash: string): StudentRow | undefined {
      return db
        .select()
        .from(students)
        .where(and(eq(students.pinHash, pinHash), eq(students.isActive, 1), isNull(students.deletedAt)))
        .get()
    },
    /** O PIN já pertence a outro aluno ativo? */
    isPinHashTaken(pinHash: string, exceptId?: string): boolean {
      const conditions = [eq(students.pinHash, pinHash), eq(students.isActive, 1), isNull(students.deletedAt)]
      if (exceptId) conditions.push(ne(students.id, exceptId))
      return !!db
        .select({ id: students.id })
        .from(students)
        .where(and(...conditions))
        .get()
    },
    create(input: NewStudent): StudentRow {
      const now = nowIso()
      const row: StudentRow = {
        id: uuid(),
        ...input,
        isActive: 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncedAt: null
      }
      db.insert(students).values(row).run()
      return row
    },
    update(id: string, patch: StudentPatch): void {
      db.update(students)
        .set({ ...patch, updatedAt: nowIso() })
        .where(eq(students.id, id))
        .run()
    },
    setPinHash(id: string, pinHash: string): void {
      db.update(students).set({ pinHash, updatedAt: nowIso() }).where(eq(students.id, id)).run()
    }
  }
}
export type StudentsRepo = ReturnType<typeof createStudentsRepo>
