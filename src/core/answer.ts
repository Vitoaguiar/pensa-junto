import type { Answer } from './types'

/** O que o aluno digitou, sem interpretação. */
export type AnswerInput =
  | { kind: 'integer'; value: string }
  | { kind: 'division'; quotient: string; remainder: string }

/** Aceita espaços e zeros à esquerda. Devolve null se não for um número natural. */
export function parseNatural(raw: string): number | null {
  const compact = raw.replace(/\s+/g, '')
  if (!/^\d{1,6}$/.test(compact)) return null
  return Number.parseInt(compact, 10)
}

export function parseAnswer(input: AnswerInput): Answer | null {
  if (input.kind === 'integer') {
    const value = parseNatural(input.value)
    return value === null ? null : { kind: 'integer', value }
  }
  const quotient = parseNatural(input.quotient)
  // Resto vazio conta como zero: a criança pode deixar em branco quando não sobra nada.
  const remainder = input.remainder.trim() === '' ? 0 : parseNatural(input.remainder)
  if (quotient === null || remainder === null) return null
  return { kind: 'division', quotient, remainder }
}

export function sameAnswer(a: Answer, b: Answer): boolean {
  if (a.kind === 'integer' && b.kind === 'integer') return a.value === b.value
  if (a.kind === 'division' && b.kind === 'division') return a.quotient === b.quotient && a.remainder === b.remainder
  return false
}

export interface CheckResult {
  /** A entrada pôde ser lida como número. */
  valid: boolean
  correct: boolean
  parsed: Answer | null
}

export function checkAnswer(correct: Answer, input: AnswerInput): CheckResult {
  const parsed = parseAnswer(input)
  if (!parsed) return { valid: false, correct: false, parsed: null }
  return { valid: true, correct: sameAnswer(correct, parsed), parsed }
}

export function formatAnswer(answer: Answer): string {
  return answer.kind === 'integer'
    ? String(answer.value)
    : `${answer.quotient}, e sobram ${answer.remainder}`
}
