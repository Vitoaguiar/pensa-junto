import type { Noun, QuestionTemplate, Rng, Theme } from '../types'
import { na, numa, outra, pickNames, quantos } from '../themes'
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

// EF03MA06 — problemas de adição e subtração com os significados de
// juntar, acrescentar, separar, retirar, comparar e completar.

interface StatementCtx {
  a: number
  b: number
  n1: string
  n2: string
  item: Noun
  container: Noun
  theme: Theme
}

interface AddSubSpec {
  meaning: string
  llmMeaning: string
  meaningForKids: string
  operation: 'add' | 'sub'
  statement: (c: StatementCtx) => string
  hint1: string
  hint2: (a: number, b: number) => string
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

function drawAdd(rng: Rng): PairParams {
  const a = rng.int(15, 480)
  return { a, b: rng.int(12, Math.min(400, 999 - a)) }
}

function drawSub(rng: Rng): PairParams {
  const a = rng.int(30, 850)
  return { a, b: rng.int(10, a - 10) }
}

function makeAddSub(spec: AddSubSpec): QuestionTemplate<PairParams> {
  const isAdd = spec.operation === 'add'
  const solve = (p: PairParams) => int(isAdd ? p.a + p.b : p.a - p.b)
  return {
    id: `add-sub.${spec.meaning}.v1`,
    skillCode: 'EF03MA06',
    operation: spec.operation,
    meaning: spec.llmMeaning,
    meaningForKids: spec.meaningForKids,
    generateParams: (rng) => drawUntil(rng, isAdd ? drawAdd : drawSub, (p) => distinctFromAnswer([p.a, p.b], solve(p))),
    solve,
    steps: (p) => (isAdd ? additionSteps(p.a, p.b) : subtractionSteps(p.a, p.b)),
    numbersInStatement: (p) => [p.a, p.b],
    expression: (p) => `${p.a} ${isAdd ? '+' : '-'} ${p.b}`,
    fallbackStatement(p, theme, rng) {
      const [n1, n2] = pickNames(rng)
      return spec.statement({
        a: p.a,
        b: p.b,
        n1,
        n2,
        item: rng.pick(theme.items),
        container: rng.pick(theme.containers),
        theme
      })
    },
    fallbackHints: (p) => [
      spec.hint1,
      spec.hint2(p.a, p.b),
      isAdd ? additionPartHint(p.a, p.b) : subtractionPartHint(p.a, p.b)
    ]
  }
}

export const addSubJuntar = makeAddSub({
  meaning: 'juntar',
  operation: 'add',
  llmMeaning: 'juntar: duas quantidades que já existem são reunidas, e a pergunta é o total',
  meaningForKids: 'São duas quantidades. Você precisa descobrir quanto dá tudo junto.',
  statement: (c) =>
    `${c.n1} tem ${c.a} ${c.item.plural} e ${c.n2} tem ${c.b} ${c.item.plural}. ${quantos(c.item)} ${c.item.plural} ${c.n1} e ${c.n2} têm juntos?`,
  hint1: 'O problema fala de duas quantidades. A pergunta quer saber de uma delas ou das duas juntas?',
  hint2: (a, b) => `Você pode juntar as duas quantidades: ${a} + ${b}. Comece pelas unidades.`
})

export const addSubAcrescentar = makeAddSub({
  meaning: 'acrescentar',
  operation: 'add',
  llmMeaning: 'acrescentar: alguém tinha uma quantidade e ganhou, comprou ou recebeu mais; a pergunta é com quanto ficou',
  meaningForKids: 'Alguém tinha uma quantidade e ganhou mais. Você descobre com quanto ficou no final.',
  statement: (c) =>
    `${c.n1} tinha ${c.a} ${c.item.plural} ${c.theme.place}. Ganhou mais ${c.b}. Com ${lower(quantos(c.item))} ${c.item.plural} ${c.n1} ficou?`,
  hint1: 'Depois de ganhar mais, a quantidade fica maior ou menor do que era no começo?',
  hint2: (a, b) => `Comece com ${a} e acrescente ${b}. Que conta faz isso? Comece pelas unidades.`
})

export const addSubSeparar = makeAddSub({
  meaning: 'separar',
  operation: 'sub',
  llmMeaning:
    'separar: um total é dividido em duas partes; sabemos o total e uma das partes, e a pergunta é a outra parte',
  meaningForKids: 'Tudo foi separado em dois grupos. Você sabe o total e um dos grupos, e falta descobrir o outro.',
  statement: (c) =>
    `${c.n1} tem ${c.a} ${c.item.plural}. Colocou ${c.b} ${numa(c.container)} ${c.container.singular} e o resto em ${outra(c.container)} ${c.container.singular}. ${quantos(c.item)} ${c.item.plural} ficaram ${na(c.container)} ${outra(c.container)} ${c.container.singular}?`,
  hint1: 'Tudo foi separado em duas partes. Você já sabe o total e uma parte. Qual parte está faltando?',
  hint2: (a, b) => `Do total de ${a}, uma parte tem ${b}. Tente fazer ${a} - ${b}.`
})

export const addSubRetirar = makeAddSub({
  meaning: 'retirar',
  operation: 'sub',
  llmMeaning: 'retirar: alguém tinha uma quantidade e deu, gastou ou perdeu uma parte; a pergunta é com quanto ficou',
  meaningForKids: 'Alguém tinha uma quantidade e deu uma parte. Você descobre quanto sobrou.',
  statement: (c) =>
    `${c.n1} tinha ${c.a} ${c.item.plural}. Deu ${c.b} para ${c.n2}. Com ${lower(quantos(c.item))} ${c.item.plural} ${c.n1} ficou?`,
  hint1: 'Quando alguém dá uma parte do que tem, fica com mais ou com menos?',
  hint2: (a, b) => `Comece com ${a} e tire ${b}. Que conta faz isso? Comece pelas unidades.`
})

export const addSubComparar = makeAddSub({
  meaning: 'comparar',
  operation: 'sub',
  llmMeaning: 'comparar: duas pessoas têm quantidades diferentes; a pergunta é quanto uma tem a mais que a outra',
  meaningForKids: 'Duas pessoas têm quantidades diferentes. Você descobre a diferença entre elas.',
  statement: (c) =>
    `${c.n1} tem ${c.a} ${c.item.plural} e ${c.n2} tem ${c.b} ${c.item.plural}. ${quantos(c.item)} ${c.item.plural} ${c.n1} tem a mais que ${c.n2}?`,
  hint1: 'Imagine as duas quantidades lado a lado. Quem tem mais? O que sobra de um lado é a diferença.',
  hint2: (a, b) => `A diferença entre ${a} e ${b} se descobre com uma subtração: ${a} - ${b}.`
})

export const addSubCompletar = makeAddSub({
  meaning: 'completar',
  operation: 'sub',
  llmMeaning: 'completar: alguém quer chegar a uma quantidade e já tem uma parte; a pergunta é quanto ainda falta',
  meaningForKids: 'Alguém quer chegar a um número e já tem uma parte. Você descobre quanto falta.',
  statement: (c) =>
    `${c.n1} quer juntar ${c.a} ${c.item.plural} ${c.theme.place}. Já tem ${c.b}. ${quantos(c.item)} ${c.item.plural} ainda faltam?`,
  hint1: 'Você já tem uma parte e quer chegar a um número. Quanto falta do que tem até o que quer?',
  hint2: (a, b) => `Pense: ${b} mais quanto chega a ${a}? Você também pode fazer ${a} - ${b}.`
})
