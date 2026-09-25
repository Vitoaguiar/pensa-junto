import type { Noun, Rng, Theme, ThemeKey } from './types'

const f = (singular: string, plural: string): Noun => ({ singular, plural, feminine: true })
const m = (singular: string, plural: string): Noun => ({ singular, plural, feminine: false })

export const THEMES: readonly Theme[] = [
  {
    key: 'escola',
    label: 'escola',
    place: 'na escola',
    items: [m('lápis', 'lápis'), m('caderno', 'cadernos'), f('borracha', 'borrachas')],
    containers: [m('estojo', 'estojos'), f('caixa', 'caixas'), f('mochila', 'mochilas')]
  },
  {
    key: 'feira',
    label: 'feira',
    place: 'na feira',
    items: [f('laranja', 'laranjas'), f('banana', 'bananas'), m('tomate', 'tomates')],
    containers: [f('sacola', 'sacolas'), f('caixa', 'caixas'), m('cesto', 'cestos')]
  },
  {
    key: 'futebol',
    label: 'futebol',
    place: 'no campinho',
    items: [f('figurinha', 'figurinhas'), f('bola', 'bolas'), m('cone', 'cones')],
    containers: [m('saco', 'sacos'), f('caixa', 'caixas'), m('álbum', 'álbuns')]
  },
  {
    key: 'animais',
    label: 'animais',
    place: 'no sítio',
    items: [f('galinha', 'galinhas'), m('peixe', 'peixes'), m('pássaro', 'pássaros')],
    containers: [m('cercado', 'cercados'), m('aquário', 'aquários'), f('gaiola', 'gaiolas')]
  },
  {
    key: 'cozinha',
    label: 'cozinha',
    place: 'na cozinha',
    items: [m('biscoito', 'biscoitos'), m('ovo', 'ovos'), m('pão de queijo', 'pães de queijo')],
    containers: [m('pote', 'potes'), f('forma', 'formas'), m('prato', 'pratos')]
  },
  {
    key: 'parque',
    label: 'parque',
    place: 'no parque',
    items: [f('pipa', 'pipas'), m('balão', 'balões'), f('flor', 'flores')],
    containers: [m('canteiro', 'canteiros'), f('cesta', 'cestas'), m('banco', 'bancos')]
  },
  {
    key: 'biblioteca',
    label: 'biblioteca',
    place: 'na biblioteca',
    items: [m('livro', 'livros'), m('gibi', 'gibis'), f('revista', 'revistas')],
    containers: [f('prateleira', 'prateleiras'), f('caixa', 'caixas'), f('pilha', 'pilhas')]
  },
  {
    key: 'festa-junina',
    label: 'festa junina',
    place: 'na festa junina',
    items: [f('bandeirinha', 'bandeirinhas'), f('pamonha', 'pamonhas'), f('paçoca', 'paçocas')],
    containers: [m('varal', 'varais'), f('bandeja', 'bandejas'), m('saquinho', 'saquinhos')]
  },
  {
    key: 'horta',
    label: 'horta',
    place: 'na horta',
    items: [f('cenoura', 'cenouras'), f('alface', 'alfaces'), f('muda', 'mudas')],
    containers: [m('canteiro', 'canteiros'), m('caixote', 'caixotes'), m('vaso', 'vasos')]
  },
  {
    key: 'brinquedos',
    label: 'brinquedos',
    place: 'na brinquedoteca',
    items: [m('carrinho', 'carrinhos'), f('boneca', 'bonecas'), f('peça de montar', 'peças de montar')],
    containers: [f('caixa', 'caixas'), m('baú', 'baús'), f('prateleira', 'prateleiras')]
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
