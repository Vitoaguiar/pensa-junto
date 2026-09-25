import type { Noun, Rng, Theme, ThemeItem, ThemeKey } from './types'

const f = (singular: string, plural: string): Noun => ({ singular, plural, feminine: true })
const m = (singular: string, plural: string): Noun => ({ singular, plural, feminine: false })

// Cada item traz os recipientes que combinam com ele. Antes, item e recipiente eram sorteados
// separados e saíam frases como "8 balões em cada canteiro" ou "peixes em cada cercado"
// (achado na primeira rodada de avaliação).
const item = (noun: Noun, ...containers: Noun[]): ThemeItem => ({ ...noun, containers })
/** Bicho não fica "arrumado em fileiras": fora do template de disposição retangular. */
const animal = (noun: Noun, ...containers: Noun[]): ThemeItem => ({ ...noun, containers, rows: false })

const caixa = f('caixa', 'caixas')
const cesta = f('cesta', 'cestas')
const pote = m('pote', 'potes')
const saco = m('saco', 'sacos')
const pilha = f('pilha', 'pilhas')
const prateleira = f('prateleira', 'prateleiras')
const sacola = f('sacola', 'sacolas')
const caixote = m('caixote', 'caixotes')
const canteiro = m('canteiro', 'canteiros')
const vaso = m('vaso', 'vasos')
const prato = m('prato', 'pratos')
const estojo = m('estojo', 'estojos')

export const THEMES: readonly Theme[] = [
  {
    key: 'escola',
    label: 'escola',
    place: 'na escola',
    items: [
      item(m('lápis', 'lápis'), estojo, caixa),
      item(m('caderno', 'cadernos'), f('mochila', 'mochilas'), pilha),
      item(f('borracha', 'borrachas'), estojo, caixa)
    ]
  },
  {
    key: 'feira',
    label: 'feira',
    place: 'na feira',
    items: [
      item(f('laranja', 'laranjas'), sacola, caixa, m('cesto', 'cestos')),
      item(f('banana', 'bananas'), sacola, f('penca', 'pencas')),
      item(m('tomate', 'tomates'), sacola, caixa)
    ]
  },
  {
    key: 'futebol',
    label: 'futebol',
    place: 'no campinho',
    items: [
      item(f('figurinha', 'figurinhas'), m('pacotinho', 'pacotinhos'), m('envelope', 'envelopes')),
      item(f('bola', 'bolas'), saco, f('rede', 'redes')),
      item(m('cone', 'cones'), pilha, saco)
    ]
  },
  {
    key: 'animais',
    label: 'animais',
    place: 'no sítio',
    items: [
      animal(f('galinha', 'galinhas'), m('galinheiro', 'galinheiros'), m('cercado', 'cercados')),
      animal(m('peixe', 'peixes'), m('aquário', 'aquários'), m('tanque', 'tanques')),
      animal(m('pássaro', 'pássaros'), f('gaiola', 'gaiolas'), m('viveiro', 'viveiros')),
      item(m('ovo', 'ovos'), m('ninho', 'ninhos'), caixa)
    ]
  },
  {
    key: 'cozinha',
    label: 'cozinha',
    place: 'na cozinha',
    items: [
      item(m('biscoito', 'biscoitos'), pote, prato),
      item(m('ovo', 'ovos'), caixa, cesta),
      // "assadeira", e não "forma": na avaliação, o modelo leu "forma" como "jeito de fazer".
      item(m('pão de queijo', 'pães de queijo'), f('assadeira', 'assadeiras'), prato)
    ]
  },
  {
    key: 'parque',
    label: 'parque',
    place: 'no parque',
    items: [
      item(f('pipa', 'pipas'), saco, caixa),
      item(m('balão', 'balões'), m('pacote', 'pacotes'), caixa),
      item(f('flor', 'flores'), vaso, cesta, canteiro)
    ]
  },
  {
    key: 'biblioteca',
    label: 'biblioteca',
    place: 'na biblioteca',
    items: [
      item(m('livro', 'livros'), prateleira, caixa, pilha),
      item(m('gibi', 'gibis'), prateleira, caixa),
      item(f('revista', 'revistas'), prateleira, caixa)
    ]
  },
  {
    key: 'festa-junina',
    label: 'festa junina',
    place: 'na festa junina',
    items: [
      item(f('bandeirinha', 'bandeirinhas'), m('varal', 'varais')),
      item(f('pamonha', 'pamonhas'), f('bandeja', 'bandejas'), cesta),
      item(f('paçoca', 'paçocas'), m('saquinho', 'saquinhos'), pote)
    ]
  },
  {
    key: 'horta',
    label: 'horta',
    place: 'na horta',
    items: [
      item(f('cenoura', 'cenouras'), caixote, cesta),
      item(f('alface', 'alfaces'), caixote, canteiro),
      item(f('muda', 'mudas'), canteiro, vaso)
    ]
  },
  {
    key: 'brinquedos',
    label: 'brinquedos',
    place: 'na brinquedoteca',
    items: [
      item(m('carrinho', 'carrinhos'), caixa, m('baú', 'baús'), prateleira),
      item(f('boneca', 'bonecas'), caixa, prateleira),
      item(f('peça de montar', 'peças de montar'), caixa, pote)
    ]
  }
]

/** Nomes curtos e comuns para os personagens dos problemas de fallback. */
export const CHARACTER_NAMES = [
  'Lia',
  'Téo',
  'Nina',
  'Davi',
  'Malu',
  'Iago',
  'Bia',
  'Rafa',
  'Duda',
  'Luca',
  'Mel',
  'Enzo'
] as const

export function findTheme(key: string): Theme {
  const theme = THEMES.find((t) => t.key === key)
  if (!theme) throw new Error(`Tema desconhecido: ${key}`)
  return theme
}

export function themeKeys(): ThemeKey[] {
  return THEMES.map((t) => t.key)
}

/** Dois nomes diferentes. */
export function pickNames(rng: Rng): [string, string] {
  const a = rng.pick(CHARACTER_NAMES)
  let b = rng.pick(CHARACTER_NAMES)
  while (b === a) b = rng.pick(CHARACTER_NAMES)
  return [a, b]
}

/** "Quantos" / "Quantas" conforme o gênero. */
export const quantos = (n: Noun): string => (n.feminine ? 'Quantas' : 'Quantos')
/** "numa" / "num". */
export const numa = (n: Noun): string => (n.feminine ? 'numa' : 'num')
/** "cada caixa" não muda, mas "na caixa" / "no pote" sim. */
export const na = (n: Noun): string => (n.feminine ? 'na' : 'no')
export const outra = (n: Noun): string => (n.feminine ? 'outra' : 'outro')

/** Sorteia um item do tema e um recipiente que combine com ele. */
export function pickItemAndContainer(theme: Theme, rng: Rng): { item: ThemeItem; container: Noun } {
  const chosen = rng.pick(theme.items)
  return { item: chosen, container: rng.pick(chosen.containers) }
}
