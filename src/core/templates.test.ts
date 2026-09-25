import { describe, expect, it } from 'vitest'
import { ALL_TEMPLATES } from './templates'
import { answerNumbers } from './templates/helpers'
import { generateExample, generateQuestion, instantiate, mainAnswerValue, rebuildQuestion } from './generator'
import { validateStatement, validateTutorText } from './validation'
import { diagnoseAttempt } from './feedback'
import type { Answer, Focus } from './types'

const SEEDS = Array.from({ length: 1000 }, (_, i) => (i * 2654435761) >>> 0)

describe.each(ALL_TEMPLATES.map((t) => [t.id, t] as const))('template %s', (_id, template) => {
  it('gera questões válidas para 1.000 seeds', () => {
    for (const seed of SEEDS) {
      const q = instantiate(template, seed)
      const main = mainAnswerValue(q.answer)

      // Resultado natural, adequado ao 3º ano.
      expect(Number.isInteger(main)).toBe(true)
      expect(main).toBeGreaterThanOrEqual(2)
      expect(main).toBeLessThanOrEqual(999)
      for (const n of q.numbers) {
        expect(Number.isInteger(n)).toBe(true)
        expect(n).toBeGreaterThan(0)
        expect(n).toBeLessThanOrEqual(999)
      }
      // Números distintos e a resposta fora do enunciado (senão seria impossível não "vazar").
      expect(new Set(q.numbers).size).toBe(q.numbers.length)
      expect(q.numbers).not.toContain(main)

      // A resposta confere com a operação.
      const [a = 0, b = 0] = q.numbers
      if (q.operation === 'add') expect(main).toBe(a + b)
      if (q.operation === 'sub') expect(main).toBe(a - b)
      if (q.operation === 'mul') {
        expect(main).toBe(a * b)
        expect([2, 3, 4, 5, 10]).toContain(b)
      }
      if (q.operation === 'div') {
        expect(b).toBeLessThanOrEqual(10)
        const r = q.answer.kind === 'division' ? q.answer.remainder : 0
        expect(main * b + r).toBe(a)
        expect(r).toBeLessThan(b)
        if (!template.extension) expect(r).toBe(0)
      }

      // Os textos de fallback passam pela mesma validação do SLM.
      const statement = validateStatement(q.fallbackStatement, {
        numbers: q.numbers,
        answer: q.answer,
        allowExpression: template.direct,
        orderedNumbers: q.operation === 'sub' || q.operation === 'div'
      })
      expect(statement.problems, q.fallbackStatement).toEqual([])
      for (const hint of q.fallbackHints) {
        const check = validateTutorText(hint, { answer: q.answer, operands: q.numbers })
        expect(check.problems, hint).toEqual([])
      }
      expect(q.steps.length).toBeGreaterThan(0)
    }
  })

  it('reconstrói exatamente a mesma questão a partir da seed', () => {
    for (const seed of SEEDS.slice(0, 100)) {
      const q = instantiate(template, seed)
      const again = rebuildQuestion(template.id, seed, q.theme.key)
      expect(again).toEqual(q)
    }
  })

  it('gera exemplos parecidos com números diferentes e sem a resposta original', () => {
    for (const seed of SEEDS.slice(0, 200)) {
      const q = instantiate(template, seed)
      const ex = generateExample(q, seed)
      expect(ex.templateId).toBe(q.templateId)
      const forbidden = [...q.numbers, ...answerNumbers(q.answer)]
      for (const v of [...ex.numbers, ...answerNumbers(ex.answer)]) expect(forbidden).not.toContain(v)
    }
  })

  it('o diagnóstico de erro nunca mostra a resposta', () => {
    for (const seed of SEEDS.slice(0, 200)) {
      const q = instantiate(template, seed)
      const main = mainAnswerValue(q.answer)
      const [a = 0, b = 0] = q.numbers
      const tries = [a + b, Math.abs(a - b), main + 10, main - 1, main + 100, a * b, 0, main + 2]
      for (const value of tries) {
        if (value === main) continue
        const attempt: Answer =
          q.answer.kind === 'division' ? { kind: 'division', quotient: value, remainder: 0 } : { kind: 'integer', value }
        const text = diagnoseAttempt(q, attempt)
        expect(validateTutorText(text, { answer: q.answer, operands: q.numbers }).problems, text).toEqual([])
      }
    }
  })
})

describe('generator', () => {
  const foci: Focus[] = ['add_sub', 'mul', 'div', 'mixed']

  it('respeita o foco', () => {
    for (const seed of SEEDS.slice(0, 300)) {
      expect(['add', 'sub']).toContain(generateQuestion({ focus: 'add_sub', seed }).operation)
      expect(generateQuestion({ focus: 'mul', seed }).operation).toBe('mul')
      expect(generateQuestion({ focus: 'div', seed }).operation).toBe('div')
    }
  })

  it('não sorteia extensões por padrão', () => {
    for (const seed of SEEDS) {
      expect(generateQuestion({ focus: 'div', seed }).templateId).not.toBe('div.repartir-resto.v1')
    }
  })

  it('cobre todas as habilidades no modo misto', () => {
    const skills = new Set(SEEDS.map((seed) => generateQuestion({ focus: 'mixed', seed }).skillCode))
    expect([...skills].sort()).toEqual(['EF03MA03', 'EF03MA05', 'EF03MA06', 'EF03MA07', 'EF03MA08'])
  })

  it('evita repetir o template anterior quando possível', () => {
    for (const focus of foci) {
      for (const seed of SEEDS.slice(0, 50)) {
        const first = generateQuestion({ focus, seed })
        const second = generateQuestion({ focus, seed: seed + 1, avoidTemplateIds: [first.templateId] })
        expect(second.templateId).not.toBe(first.templateId)
      }
    }
  })

  it('usa o tema fixado sem mudar os números', () => {
    const q = generateQuestion({ focus: 'mixed', seed: 42 })
    const fixed = generateQuestion({ focus: 'mixed', seed: 42, themeKey: 'horta' })
    expect(fixed.theme.key).toBe('horta')
    expect(fixed.numbers).toEqual(q.numbers)
  })
})
