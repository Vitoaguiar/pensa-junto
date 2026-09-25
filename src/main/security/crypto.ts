import { createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto'

/** HMAC-SHA256(pin, pepper). Determinístico, para permitir o índice único entre alunos ativos. */
export function hashPin(pin: string, pepper: string): string {
  return createHmac('sha256', pepper).update(pin).digest('hex')
}

export function newPepper(): string {
  return randomBytes(32).toString('hex')
}

/** Senha do professor: scrypt com sal aleatório. Formato: scrypt$<sal>$<hash>. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `scrypt$${salt}$${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'hex')
  const actual = scryptSync(password, salt, expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

/** PINs óbvios que não devem ser gerados em produção. */
export function isObviousPin(pin: string): boolean {
  if (/^(\d)\1{3}$/.test(pin)) return true // 0000, 1111...
  const digits = pin.split('').map(Number)
  const steps = digits.slice(1).map((d, i) => d - (digits[i] as number))
  if (steps.every((s) => s === 1) || steps.every((s) => s === -1)) return true // 1234, 4321
  if (/^(\d\d)\1$/.test(pin)) return true // 1212
  return ['2580', '0852', '1004', '2000', '1122', '6969'].includes(pin)
}

export function randomPin(): string {
  return String(randomInt(0, 10000)).padStart(4, '0')
}
