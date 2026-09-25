import { createRng, deriveSeed } from './rng'
import { findTheme, THEMES } from './themes'
import { findTemplate, templatesForFocus, type PoolOptions } from './templates'
import type { Answer, Focus, GeneratedQuestion, QuestionTemplate } from './types'
import { answerNumbers } from './templates/helpers'

export const FOCUS_LABELS: Record<Focus, string> = {
  add_sub: 'Somar e subtrair',
  mul: 'Multiplicação',
  div: 'Divisão',
  mixed: 'Um pouco de tudo'
}

/** Número principal da resposta (o que nunca pode vazar). */
export function mainAnswerValue(answer: Answer): number {
  return answer.kind === 'integer' ? answer.value : answer.quotient
}

/**
 * Monta a questão de um template a partir da seed. Mesma seed + mesmo template + mesmo tema
 * = mesma questão, sempre. É isso que permite retomar uma sessão.
 */
export function instantiate(template: QuestionTemplate<unknown>, seed: number, themeKey?: string): GeneratedQuestion {
  const rng = createRng(deriveSeed(seed, template.id))
  // O tema é sempre sorteado (para consumir o rng igual), mesmo quando vem fixado de fora.
  const drawnTheme = rng.pick(THEMES)
  const theme = themeKey ? findTheme(themeKey) : drawnTheme
  const params = template.generateParams(rng)
  const textRng = createRng(deriveSeed(seed, `${template.id}:texto`))
  return {
    templateId: template.id,
    skillCode: template.skillCode,
    operation: template.operation,
    meaning: template.meaning,
    seed: seed >>> 0,
    params,
    answer: template.solve(params),
    theme,
    numbers: template.numbersInStatement(params),
    expression: template.expression(params),
    steps: template.steps(params),
    fallbackStatement: template.fallbackStatement(params, theme, textRng),
    fallbackHints: template.fallbackHints(params)
  }
}

export interface QuestionOptions extends PoolOptions {
  focus: Focus
  seed: number
  /** Evita repetir os mesmos templates em sequência. */
  avoidTemplateIds?: readonly string[]
  themeKey?: string
}

/** Sorteia primeiro a habilidade (para equilibrar) e depois o template dentro dela. */
export function pickTemplate(options: QuestionOptions): QuestionTemplate<unknown> {
  const pool = templatesForFocus(options.focus, options)
  if (pool.length === 0) throw new Error(`Nenhum template disponível para o foco ${options.focus}`)
  const fresh = pool.filter((t) => !options.avoidTemplateIds?.includes(t.id))
  const candidates = fresh.length > 0 ? fresh : pool
  const rng = createRng(deriveSeed(options.seed, 'escolha'))
  const skills = [...new Set(candidates.map((t) => t.skillCode))]
  const skill = rng.pick(skills)
  return rng.pick(candidates.filter((t) => t.skillCode === skill))
}

export function generateQuestion(options: QuestionOptions): GeneratedQuestion {
  return instantiate(pickTemplate(options), options.seed, options.themeKey)
}

/** Reconstrói exatamente a questão salva (template + seed + tema). */
export function rebuildQuestion(templateId: string, seed: number, themeKey: string): GeneratedQuestion {
  return instantiate(findTemplate(templateId), seed, themeKey)
}

/**
 * "Exemplo parecido": mesmo template, números menores e diferentes, e resposta diferente da original.
 * A resposta do exemplo pode ser mostrada; a da questão original, nunca.
 */
export function generateExample(original: GeneratedQuestion, seed: number): GeneratedQuestion {
  const template = findTemplate(original.templateId)
  const forbidden = new Set([...original.numbers, ...answerNumbers(original.answer)])
  const originalMax = Math.max(...original.numbers)
  const rng = createRng(deriveSeed(seed, 'exemplo'))
  const rules: Array<(q: GeneratedQuestion) => boolean> = [
    (q) => Math.max(...q.numbers) < originalMax,
    () => true
  ]
  for (const extra of rules) {
    for (let i = 0; i < 400; i++) {
      const candidate = instantiate(template, rng.int(0, 2 ** 31), original.theme.key)
      const values = [...candidate.numbers, ...answerNumbers(candidate.answer)]
      if (values.some((v) => forbidden.has(v))) continue
      if (!extra(candidate)) continue
      return candidate
    }
  }
  throw new Error('Não foi possível gerar um exemplo parecido')
}

export function sessionTitle(focus: Focus, themeLabel: string): string {
  return `${FOCUS_LABELS[focus]} · ${themeLabel}`
}

