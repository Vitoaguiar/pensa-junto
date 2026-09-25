import type { QuestionTemplate } from '../types'
import {
  additionPartHint,
  additionSteps,
  distinctFromAnswer,
  drawUntil,
  int,
  subtractionPartHint,
  subtractionSteps
} from './helpers'
import type { PairParams } from './fatos'

// EF03MA05 — procedimentos de cálculo mental e escrito, adição e subtração até 999.

export const calculoAdicao: QuestionTemplate<PairParams> = {
  id: 'calculo.adicao.v1',
  skillCode: 'EF03MA05',
  operation: 'add',
  direct: true,
  meaning: 'fazer a conta de adição (pode ser a conta direta ou uma situação bem simples de juntar)',
  meaningForKids: 'Aqui você soma os dois números, coluna por coluna.',
  generateParams(rng) {
    return drawUntil(
      rng,
      (r) => {
        const a = r.int(100, 800)
        return { a, b: r.int(20, Math.min(899, 999 - a)) }
      },
      (p) => p.a + p.b <= 999 && distinctFromAnswer([p.a, p.b], int(p.a + p.b))
    )
  },
  solve: (p) => int(p.a + p.b),
  steps: (p) => additionSteps(p.a, p.b),
  numbersInStatement: (p) => [p.a, p.b],
  expression: (p) => `${p.a} + ${p.b}`,
  fallbackStatement: (p) => `Resolva a conta: ${p.a} + ${p.b}. Quanto dá?`,
  fallbackHints: (p) => [
    `Que tal separar cada número em centenas, dezenas e unidades? Quantas centenas tem o ${p.a}?`,
    `Monte a conta em pé, com unidade embaixo de unidade. Qual coluna você faz primeiro?`,
    additionPartHint(p.a, p.b)
  ]
}

export const calculoSubtracao: QuestionTemplate<PairParams> = {
  id: 'calculo.subtracao.v1',
  skillCode: 'EF03MA05',
  operation: 'sub',
  direct: true,
  meaning: 'fazer a conta de subtração (pode ser a conta direta ou uma situação bem simples de tirar)',
  meaningForKids: 'Aqui você tira o número menor do número maior, coluna por coluna.',
  generateParams(rng) {
    return drawUntil(
      rng,
      (r) => {
        const a = r.int(120, 999)
        return { a, b: r.int(20, a - 20) }
      },
      (p) => distinctFromAnswer([p.a, p.b], int(p.a - p.b))
    )
  },
  solve: (p) => int(p.a - p.b),
  steps: (p) => subtractionSteps(p.a, p.b),
  numbersInStatement: (p) => [p.a, p.b],
  expression: (p) => `${p.a} - ${p.b}`,
  fallbackStatement: (p) => `Resolva a conta: ${p.a} - ${p.b}. Quanto dá?`,
  fallbackHints: (p) => [
    `O resultado vai ser maior ou menor que ${p.a}? Pense antes de começar.`,
    `Monte a conta em pé, com o ${p.a} em cima. Comece pela coluna das unidades.`,
    subtractionPartHint(p.a, p.b)
  ]
}
