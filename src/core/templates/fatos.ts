import type { QuestionTemplate } from '../types'
import { additionPartHint, additionSteps, distinctFromAnswer, drawUntil, int, multiplicationPartHint } from './helpers'

// EF03MA03 — fatos básicos da adição e da multiplicação (contas diretas e curtas).

export interface PairParams {
  a: number
  b: number
}

export const fatosAdicao: QuestionTemplate<PairParams> = {
  id: 'fatos.adicao.v1',
  skillCode: 'EF03MA03',
  operation: 'add',
  direct: true,
  meaning: 'fato básico da adição: juntar duas quantidades pequenas (pode ser uma conta direta, bem curta)',
  meaningForKids: 'Aqui você junta dois números pequenos e descobre quanto dá ao todo.',
  generateParams(rng) {
    return drawUntil(
      rng,
      (r) => ({ a: r.int(2, 9), b: r.int(2, 9) }),
      (p) => distinctFromAnswer([p.a, p.b], int(p.a + p.b))
    )
  },
  solve: (p) => int(p.a + p.b),
  steps: (p) => additionSteps(p.a, p.b),
  numbersInStatement: (p) => [p.a, p.b],
  expression: (p) => `${p.a} + ${p.b}`,
  fallbackStatement: (p) => `Quanto é ${p.a} + ${p.b}?`,
  fallbackHints(p) {
    const big = Math.max(p.a, p.b)
    const small = Math.min(p.a, p.b)
    const level3 =
      Math.abs(p.a - p.b) === 1
        ? `Você sabe quanto é ${small} + ${small}? Um dos números é só 1 a mais. Use isso para chegar lá.`
        : big + small > 10
          ? `Quanto falta para o ${big} chegar a 10? Tire isso do ${small} e veja quanto sobra depois do 10.`
          : additionPartHint(p.a, p.b)
    return [
      `Qual dos dois números é maior? Começar por ele deixa a conta mais fácil.`,
      `Guarde o ${big} na cabeça e conte mais ${small} a partir dele.`,
      level3
    ]
  }
}

export const fatosMultiplicacao: QuestionTemplate<PairParams> = {
  id: 'fatos.multiplicacao.v1',
  skillCode: 'EF03MA03',
  operation: 'mul',
  direct: true,
  meaning: 'fato básico da multiplicação (tabuada do 2, 3, 4, 5 ou 10); pode ser uma conta direta, bem curta',
  meaningForKids: 'Multiplicar é somar o mesmo número várias vezes.',
  generateParams(rng) {
    return drawUntil(
      rng,
      (r) => ({ a: r.int(2, 9), b: r.pick([2, 3, 4, 5, 10]) }),
      (p) => distinctFromAnswer([p.a, p.b], int(p.a * p.b))
    )
  },
  solve: (p) => int(p.a * p.b),
  steps: (p) => [
    `${p.a} × ${p.b} é somar o ${p.b}, ${p.a} vezes.`,
    `Contar de ${p.b} em ${p.b}, ${p.a} vezes.`,
    `${p.a} × ${p.b} = ${p.a * p.b}.`
  ],
  numbersInStatement: (p) => [p.a, p.b],
  expression: (p) => `${p.a} × ${p.b}`,
  fallbackStatement: (p) => `Quanto é ${p.a} × ${p.b}?`,
  fallbackHints: (p) => [
    `Multiplicar é somar o mesmo número várias vezes. Qual número você vai somar, e quantas vezes?`,
    `Você pode somar o ${p.b}, ${p.a} vezes. Vá anotando cada soma.`,
    multiplicationPartHint(p.a, p.b)
  ]
}
