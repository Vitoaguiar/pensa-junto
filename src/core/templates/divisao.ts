import type { Answer, QuestionTemplate, Rng } from '../types'
import { pickItemAndContainer, pickNames, quantos } from '../themes'
import { distinctFromAnswer, divisionPartHint, drawUntil, int } from './helpers'

// EF03MA08 — divisão por números até 10: repartição equitativa e medida.
// MVP: resto zero. A divisão com resto existe como extensão (fora do sorteio padrão).

export interface DivParams {
  total: number
  divisor: number
  /** Só na extensão com resto. */
  remainder?: number
}

function drawExact(rng: Rng): DivParams {
  const divisor = rng.int(2, 10)
  const quotient = rng.int(2, 10)
  return { total: divisor * quotient, divisor }
}

const quotientOf = (p: DivParams) => Math.floor(p.total / p.divisor)

const divSteps = (p: DivParams, how: string) => [
  how,
  `Pensar na tabuada do ${p.divisor}: qual número vezes ${p.divisor} dá ${p.total - (p.remainder ?? 0)}?`,
  `${quotientOf(p)} × ${p.divisor} = ${quotientOf(p) * p.divisor}.`,
  p.remainder ? `Resultado: ${quotientOf(p)}, e sobram ${p.remainder}.` : `Resultado: ${quotientOf(p)}.`
]

export const divRepartir: QuestionTemplate<DivParams> = {
  id: 'div.repartir.v1',
  skillCode: 'EF03MA08',
  operation: 'div',
  meaning: 'repartição equitativa: um total é dividido igualmente entre algumas pessoas; a pergunta é quanto cada uma recebe',
  meaningForKids: 'Tudo vai ser dividido igualzinho entre algumas pessoas. Você descobre quanto cada uma ganha.',
  generateParams: (rng) =>
    drawUntil(rng, drawExact, (p) => distinctFromAnswer([p.total, p.divisor], int(quotientOf(p)))),
  solve: (p) => int(quotientOf(p)),
  steps: (p) => divSteps(p, `Repartir ${p.total} igualmente entre ${p.divisor}.`),
  numbersInStatement: (p) => [p.total, p.divisor],
  expression: (p) => `${p.total} ÷ ${p.divisor}`,
  fallbackStatement(p, theme, rng) {
    const [n1] = pickNames(rng)
    const item = rng.pick(theme.items)
    return `${n1} tem ${p.total} ${item.plural} e quer dividir igualmente entre ${p.divisor} amigos. ${quantos(item)} ${item.plural} cada amigo vai receber?`
  },
  fallbackHints: (p) => [
    'Todo mundo tem que receber a mesma quantidade. Como você faria isso com objetos de verdade?',
    `Pense na tabuada do ${p.divisor}: qual número vezes ${p.divisor} dá ${p.total}?`,
    divisionPartHint(p.total, p.divisor, quotientOf(p), 0, 'repartir')
  ]
}

export const divMedida: QuestionTemplate<DivParams> = {
  id: 'div.medida.v1',
  skillCode: 'EF03MA08',
  operation: 'div',
  meaning: 'medida: um total é separado em grupos de um tamanho fixo; a pergunta é quantos grupos dá para formar',
  meaningForKids: 'Você já sabe quanto vai em cada grupo. Descubra quantos grupos dá para fazer.',
  generateParams: (rng) =>
    drawUntil(rng, drawExact, (p) => distinctFromAnswer([p.total, p.divisor], int(quotientOf(p)))),
  solve: (p) => int(quotientOf(p)),
  steps: (p) => divSteps(p, `Separar ${p.total} em grupos de ${p.divisor}.`),
  numbersInStatement: (p) => [p.total, p.divisor],
  expression: (p) => `${p.total} ÷ ${p.divisor}`,
  fallbackStatement(p, theme, rng) {
    const [n1] = pickNames(rng)
    const { item, container: box } = pickItemAndContainer(theme, rng)
    return `${n1} tem ${p.total} ${item.plural} e vai colocar ${p.divisor} em cada ${box.singular}. ${quantos(box)} ${box.plural} vai usar?`
  },
  fallbackHints: (p) => [
    'Cada grupo tem sempre a mesma quantidade. O que a pergunta quer saber: o tamanho do grupo ou quantos grupos?',
    `Quantas vezes o ${p.divisor} cabe dentro do ${p.total}? Pense na tabuada do ${p.divisor}.`,
    divisionPartHint(p.total, p.divisor, quotientOf(p), 0, 'medida')
  ]
}

/** Extensão: divisão com resto diferente de zero. A resposta tem quociente e resto. */
export const divRepartirComResto: QuestionTemplate<DivParams> = {
  id: 'div.repartir-resto.v1',
  skillCode: 'EF03MA08',
  operation: 'div',
  extension: true,
  meaning:
    'repartição equitativa com sobra: um total é dividido igualmente entre algumas pessoas e sobra um pouco; a pergunta é quanto cada uma recebe e quanto sobra',
  meaningForKids: 'Tudo vai ser dividido igualzinho, mas vai sobrar um pouco. Descubra quanto cada um ganha e quanto sobra.',
  generateParams: (rng) =>
    drawUntil(
      rng,
      (r) => {
        const divisor = r.int(2, 9)
        const quotient = r.int(2, 9)
        const remainder = r.int(1, divisor - 1)
        return { total: divisor * quotient + remainder, divisor, remainder }
      },
      (p) => distinctFromAnswer([p.total, p.divisor], int(quotientOf(p)))
    ),
  solve: (p): Answer => ({ kind: 'division', quotient: quotientOf(p), remainder: p.remainder ?? 0 }),
  steps: (p) => divSteps(p, `Repartir ${p.total} igualmente entre ${p.divisor} e ver quanto sobra.`),
  numbersInStatement: (p) => [p.total, p.divisor],
  expression: (p) => `${p.total} ÷ ${p.divisor}`,
  fallbackStatement(p, theme, rng) {
    const [n1] = pickNames(rng)
    const item = rng.pick(theme.items)
    return `${n1} tem ${p.total} ${item.plural} para dividir igualmente entre ${p.divisor} amigos. ${quantos(item)} cada um recebe, e ${item.feminine ? 'quantas' : 'quantos'} sobram?`
  },
  fallbackHints: (p) => [
    'Cada amigo recebe a mesma quantidade, e o que não dá para dividir sobra. Como você faria com objetos de verdade?',
    `Qual é o maior número da tabuada do ${p.divisor} que não passa de ${p.total}?`,
    divisionPartHint(p.total, p.divisor, quotientOf(p), p.remainder, 'repartir')
  ]
}
