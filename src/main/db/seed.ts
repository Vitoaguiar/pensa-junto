import { BNCC_SKILLS } from '@core/bncc/skills'
import { hashPin, newPepper } from '../security/crypto'
import type { DbHandle } from './connection'
import type { Repositories } from './repositories'

export const DEMO_STUDENTS = [
  { displayName: 'Ana', fullName: 'Ana Souza (demonstração)', pin: '1234', avatarKey: 'cat', colorKey: 'anil' },
  { displayName: 'Bruno', fullName: 'Bruno Lima (demonstração)', pin: '2468', avatarKey: 'rocket', colorKey: 'turquesa' },
  { displayName: 'Caio', fullName: 'Caio Santos (demonstração)', pin: '1357', avatarKey: 'turtle', colorKey: 'sol' }
] as const

/** Habilidades BNCC (sempre) e pepper dos PINs (na primeira execução). */
export function seedBaseline(handle: DbHandle, repos: Repositories): void {
  const upsert = handle.sqlite.prepare(`
    INSERT INTO bncc_skills (code, grade, thematic_unit, object_of_knowledge, description, is_enabled)
    VALUES (@code, @grade, @thematicUnit, @objectOfKnowledge, @description, 1)
    ON CONFLICT(code) DO UPDATE SET
      grade = excluded.grade,
      thematic_unit = excluded.thematic_unit,
      object_of_knowledge = excluded.object_of_knowledge,
      description = excluded.description
  `)
  handle.sqlite.transaction(() => {
    for (const skill of BNCC_SKILLS) upsert.run(skill)
  })()

  if (!repos.settings.get('pin_pepper')) repos.settings.set('pin_pepper', newPepper())
}

/** Só em desenvolvimento: uma turma e três alunos de demonstração, se ainda não houver alunos. */
export function seedDemo(repos: Repositories): boolean {
  if (repos.students.list({ includeInactive: true }).length > 0) return false
  const pepper = repos.settings.get('pin_pepper')
  if (!pepper) throw new Error('pin_pepper ausente: rode seedBaseline antes')
  const classroom = repos.classrooms.create({ name: '3º ano A (demonstração)', grade: 3, schoolYear: new Date().getFullYear() })
  for (const s of DEMO_STUDENTS) {
    repos.students.create({
      classroomId: classroom.id,
      fullName: s.fullName,
      displayName: s.displayName,
      grade: 3,
      pinHash: hashPin(s.pin, pepper),
      avatarKey: s.avatarKey,
      colorKey: s.colorKey
    })
  }
  return true
}
