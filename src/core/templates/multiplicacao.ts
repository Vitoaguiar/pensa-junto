import type { QuestionTemplate, Rng } from '../types'
import { pickNames, quantos } from '../themes'
import { distinctFromAnswer, drawUntil, int, multiplicationPartHint } from './helpers'

// EF03MA07 — multiplicação por 2, 3, 4, 5 e 10: parcelas iguais e disposição retangular.

export interface GroupParams {
  /** Quantidade de grupos (ou de fileiras). */
  groups: number
  /** Tamanho de cada grupo: sempre 2, 3, 4, 5 ou 10 (ou o número de fileiras está nesse conjunto). */
  size: number
}

const FACTORS = [2, 3, 4, 5, 10] as const

function drawGroups(rng: Rng): GroupParams {
  return { groups: rng.int(2, 9), size: rng.pick(FACTORS) }
}

const mulSteps = (p: GroupParams) => [
  `São ${p.groups} grupos com ${p.size} em cada um.`,
  `É o mesmo que somar o ${p.size}, ${p.groups} vezes (ou ${p.groups} × ${p.size}).`,
  `Contar de ${p.size} em ${p.size}: ${Array.from({ length: p.groups }, (_, i) => (i + 1) * p.size).join(', ')}.`,
  `Resultado: ${p.groups * p.size}.`
]

export const mulParcelasIguais: QuestionTemplate<GroupParams> = {
  id: 'mul.parcelas-iguais.v1',
  skillCode: 'EF03MA07',
  operation: 'mul',
  meaning: 'adição de parcelas iguais: vários grupos com a mesma quantidade em cada um; a pergunta é o total',
  meaningForKids: 'São vários grupos iguais. Você descobre quanto dá tudo junto.',
  generateParams: (rng) =>
    drawUntil(rng, drawGroups, (p) => distinctFromAnswer([p.groups, p.size], int(p.groups * p.size))),
  solve: (p) => int(p.groups * p.size),
  steps: mulSteps,
  numbersInStatement: (p) => [p.groups, p.size],
  expression: (p) => `${p.groups} × ${p.size}`,
  fallbackStatement(p, theme, rng) {
    const [n1] = pickNames(rng)
    const item = rng.pick(theme.items)
    const box = rng.pick(theme.containers)
    return `${n1} tem ${p.groups} ${box.plural}. Em cada ${box.singular} há ${p.size} ${item.plural}. ${quantos(item)} ${item.plural} há ao todo?`
  },
  fallbackHints: (p) => [
    'Todos os grupos têm a mesma quantidade? Quantos grupos são?',
    `Você pode somar o ${p.size} uma vez para cada grupo. Quantas vezes vai somar?`,
    multiplicationPartHint(p.groups, p.size)
  ]
}

export const mulRetangular: QuestionTemplate<GroupParams> = {
  id: 'mul.retangular.v1',
  skillCode: 'EF03MA07',
  operation: 'mul',
  meaning:
    'disposição retangular: coisas arrumadas em fileiras, com a mesma quantidade em cada fileira; a pergunta é o total',
  meaningForKids: 'As coisas estão arrumadas em fileiras iguais, como numa grade. Você descobre quantas são ao todo.',
  generateParams: (rng) =>
    drawUntil(rng, drawGroups, (p) => distinctFromAnswer([p.groups, p.size], int(p.groups * p.size))),
  solve: (p) => int(p.groups * p.size),
  steps: (p) => [`São ${p.groups} fileiras com ${p.size} em cada fileira.`, ...mulSteps(p).slice(1)],
  numbersInStatement: (p) => [p.groups, p.size],
  expression: (p) => `${p.groups} × ${p.size}`,
  fallbackStatement(p, theme, rng) {
    const item = rng.pick(theme.items)
    const place = theme.place.charAt(0).toUpperCase() + theme.place.slice(1)
    return `${place}, ${item.feminine ? 'as' : 'os'} ${item.plural} estão arrumad${item.feminine ? 'as' : 'os'} em ${p.groups} fileiras, com ${p.size} em cada fileira. ${quantos(item)} ${item.plural} há ao todo?`
  },
  fallbackHints: (p) => [
    'Desenhe as fileiras no papel. Todas as fileiras têm a mesma quantidade?',
    `São ${p.groups} fileiras de ${p.size}. Você pode somar o ${p.size} uma vez para cada fileira.`,
    multiplicationPartHint(p.groups, p.size)
  ]
}
