import type { StudentPublicDto, VerifyPinResult } from '@shared/types'
import type { Repositories } from '../db/repositories'
import { hashPassword, hashPin, verifyPassword } from '../security/crypto'

export const MAX_PIN_FAILURES = 5
export const PIN_LOCK_SECONDS = 30
const TEACHER_UNLOCK_MINUTES = 30

export class AuthError extends Error {}

/** Quem está usando o app agora. Vive só no processo main; o renderer nunca decide isso. */
export class AuthService {
  private currentStudentId: string | null = null
  private teacherUnlockedUntil = 0
  private pinFailures = 0
  private lockedUntil = 0

  constructor(
    private readonly repos: Repositories,
    private readonly now: () => number = () => Date.now()
  ) {}

  verifyPin(pin: string): VerifyPinResult {
    const now = this.now()
    if (now < this.lockedUntil) {
      return { ok: false, reason: 'locked', retryInSeconds: Math.ceil((this.lockedUntil - now) / 1000) }
    }
    const pepper = this.repos.settings.get('pin_pepper')
    const student = pepper && /^\d{4}$/.test(pin) ? this.repos.students.findActiveByPinHash(hashPin(pin, pepper)) : undefined
    if (!student) {
      this.pinFailures++
      if (this.pinFailures >= MAX_PIN_FAILURES) {
        this.pinFailures = 0
        this.lockedUntil = now + PIN_LOCK_SECONDS * 1000
        return { ok: false, reason: 'locked', retryInSeconds: PIN_LOCK_SECONDS }
      }
      return { ok: false, reason: 'not_found', remainingBeforeLock: MAX_PIN_FAILURES - this.pinFailures }
    }
    this.pinFailures = 0
    this.currentStudentId = student.id
    const dto: StudentPublicDto = {
      id: student.id,
      displayName: student.displayName,
      avatarKey: student.avatarKey,
      colorKey: student.colorKey
    }
    return { ok: true, student: dto }
  }

  logoutStudent(): void {
    this.currentStudentId = null
  }

  currentStudent(): StudentPublicDto | null {
    if (!this.currentStudentId) return null
    const s = this.repos.students.get(this.currentStudentId)
    if (!s || !s.isActive) return null
    return { id: s.id, displayName: s.displayName, avatarKey: s.avatarKey, colorKey: s.colorKey }
  }

  /** Id do aluno logado; lança erro se ninguém entrou com PIN. */
  requireStudent(): string {
    const student = this.currentStudent()
    if (!student) throw new AuthError('Nenhum aluno entrou com o código.')
    return student.id
  }

  hasTeacherPassword(): boolean {
    return !!this.repos.settings.get('teacher_password_hash')
  }

  onboardingDone(): boolean {
    return this.repos.settings.get('onboarding_done') === '1'
  }

  setTeacherPassword(password: string): void {
    if (this.hasTeacherPassword() && !this.isTeacherUnlocked()) {
      throw new AuthError('Entre na área do professor para trocar a senha.')
    }
    if (password.length < 4) throw new AuthError('A senha precisa ter pelo menos 4 caracteres.')
    this.repos.settings.set('teacher_password_hash', hashPassword(password))
    this.unlockTeacher()
  }

  verifyTeacherPassword(password: string): boolean {
    const stored = this.repos.settings.get('teacher_password_hash')
    if (!stored || !verifyPassword(password, stored)) return false
    this.unlockTeacher()
    return true
  }

  private unlockTeacher(): void {
    this.teacherUnlockedUntil = this.now() + TEACHER_UNLOCK_MINUTES * 60_000
  }

  lockTeacher(): void {
    this.teacherUnlockedUntil = 0
  }

  isTeacherUnlocked(): boolean {
    return this.now() < this.teacherUnlockedUntil
  }

  requireTeacher(): void {
    if (!this.isTeacherUnlocked()) throw new AuthError('Área do professor bloqueada. Digite a senha.')
    this.unlockTeacher() // renova a cada uso
  }
}
