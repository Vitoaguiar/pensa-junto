import type { ClassroomDto, StudentDto, StudentWithPinDto } from '@shared/types'
import type { Repositories } from '../db/repositories'
import type { StudentRow } from '../db/schema'
import { hashPin, isObviousPin, randomPin } from '../security/crypto'

export interface StudentInput {
  fullName: string
  displayName: string
  grade: number
  avatarKey: string
  colorKey: string
  classroomId: string | null
}

export const toStudentDto = (s: StudentRow): StudentDto => ({
  id: s.id,
  displayName: s.displayName,
  fullName: s.fullName,
  avatarKey: s.avatarKey,
  colorKey: s.colorKey,
  grade: s.grade,
  classroomId: s.classroomId,
  isActive: s.isActive === 1
})

export class StudentsService {
  constructor(
    private readonly repos: Repositories,
    /** Em produção, PINs óbvios (0000, 1234...) nunca são gerados. */
    private readonly production: boolean,
    private readonly pinSource: () => string = randomPin
  ) {}

  private pepper(): string {
    const pepper = this.repos.settings.get('pin_pepper')
    if (!pepper) throw new Error('pin_pepper ausente')
    return pepper
  }

  /** PIN de 4 dígitos, único entre alunos ativos e sem sequências óbvias. */
  generateUniquePin(exceptStudentId?: string): string {
    const pepper = this.pepper()
    for (let i = 0; i < 5000; i++) {
      const pin = this.pinSource()
      if (this.production && isObviousPin(pin)) continue
      if (!this.repos.students.isPinHashTaken(hashPin(pin, pepper), exceptStudentId)) return pin
    }
    throw new Error('Não há mais códigos livres. Desative alunos antigos.')
  }

  list(): StudentDto[] {
    return this.repos.students.list({ includeInactive: true }).map(toStudentDto)
  }

  create(input: StudentInput): StudentWithPinDto {
    const pin = this.generateUniquePin()
    const row = this.repos.students.create({ ...input, pinHash: hashPin(pin, this.pepper()) })
    return { student: toStudentDto(row), pin }
  }

  update(id: string, patch: Partial<StudentInput> & { isActive?: boolean }): StudentWithPinDto | StudentDto {
    const current = this.repos.students.get(id)
    if (!current) throw new Error('Aluno não encontrado.')
    const { isActive, ...rest } = patch
    // Reativar um aluno cujo PIN foi reaproveitado por outro: gera um PIN novo.
    let newPin: string | null = null
    if (isActive && !current.isActive && this.repos.students.isPinHashTaken(current.pinHash, id)) {
      newPin = this.generateUniquePin(id)
      this.repos.students.setPinHash(id, hashPin(newPin, this.pepper()))
    }
    this.repos.students.update(id, { ...rest, ...(isActive === undefined ? {} : { isActive: isActive ? 1 : 0 }) })
    const row = this.repos.students.get(id) as StudentRow
    return newPin ? { student: toStudentDto(row), pin: newPin } : toStudentDto(row)
  }

  resetPin(id: string): StudentWithPinDto {
    const current = this.repos.students.get(id)
    if (!current) throw new Error('Aluno não encontrado.')
    const pin = this.generateUniquePin(id)
    this.repos.students.setPinHash(id, hashPin(pin, this.pepper()))
    return { student: toStudentDto({ ...current, pinHash: '' }), pin }
  }

  /**
   * Cartões de PIN para impressão. O banco guarda só o HMAC do PIN; como são apenas 10.000 PINs
   * possíveis, o professor (autenticado) recupera cada um testando todos com o pepper local.
   */
  pinCards(classroomId?: string | null): Array<StudentWithPinDto> {
    const pepper = this.pepper()
    const table = new Map<string, string>()
    for (let n = 0; n < 10000; n++) {
      const pin = String(n).padStart(4, '0')
      table.set(hashPin(pin, pepper), pin)
    }
    return this.repos.students
      .list()
      .filter((s) => !classroomId || s.classroomId === classroomId)
      .map((s) => ({ student: toStudentDto(s), pin: table.get(s.pinHash) ?? '????' }))
  }

  listClassrooms(): ClassroomDto[] {
    return this.repos.classrooms.list().map(({ id, name, grade, schoolYear }) => ({ id, name, grade, schoolYear }))
  }

  createClassroom(input: { name: string; grade: number; schoolYear: number }): ClassroomDto {
    const { id, name, grade, schoolYear } = this.repos.classrooms.create(input)
    return { id, name, grade, schoolYear }
  }

  updateClassroom(id: string, patch: Partial<{ name: string; grade: number; schoolYear: number }>): void {
    this.repos.classrooms.update(id, patch)
  }

  deleteClassroom(id: string): void {
    this.repos.classrooms.softDelete(id)
  }
}
