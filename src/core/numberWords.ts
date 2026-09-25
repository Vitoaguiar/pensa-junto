// Leitura de números em textos em português: algarismos ("347", "1.000") e por extenso até milhares
// ("trezentos e quarenta e sete", "mil"). Base da detecção de respostas vazadas.

const WORD_VALUES: Record<string, number> = {
  zero: 0,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezasseis: 16,
  dezessete: 17,
  dezassete: 17,
  dezoito: 18,
  dezenove: 19,
  dezanove: 19,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
  cento: 100,
  duzentos: 200,
  duzentas: 200,
  trezentos: 300,
  trezentas: 300,
  quatrocentos: 400,
  quatrocentas: 400,
  quinhentos: 500,
  quinhentas: 500,
  seiscentos: 600,
  seiscentas: 600,
  setecentos: 700,
  setecentas: 700,
  oitocentos: 800,
  oitocentas: 800,
  novecentos: 900,
  novecentas: 900,
  mil: 1000
}

export interface FoundNumber {
  value: number
  start: number
  end: number
  kind: 'digits' | 'words'
}

/** Minúsculas e sem acentos, preservando o comprimento (para os índices continuarem válidos). */
export function foldText(text: string): string {
  let out = ''
  for (const ch of text) {
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '')
    // Caracteres que viram mais de uma unidade UTF-16 ficam como estão, para não deslocar índices.
    out += base.length === ch.length ? base.toLowerCase() : ch
  }
  return out
}

export function isNumberWord(word: string): boolean {
  return Object.prototype.hasOwnProperty.call(WORD_VALUES, foldText(word))
}

interface Token {
  text: string
  start: number
  end: number
}

function wordTokens(folded: string): Token[] {
  const tokens: Token[] = []
  const re = /[a-z]+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(folded))) tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length })
  return tokens
}

function onlySpacesBetween(folded: string, a: number, b: number): boolean {
  return /^[\s,]*$/.test(folded.slice(a, b))
}

function wordNumbers(text: string): FoundNumber[] {
  const folded = foldText(text)
  const tokens = wordTokens(folded)
  const found: FoundNumber[] = []
  let i = 0
  while (i < tokens.length) {
    const tok = tokens[i] as Token
    if (!(tok.text in WORD_VALUES)) {
      i++
      continue
    }
    let total = 0
    let current = 0
    let parts = 0
    let onlyArticle = true
    const start = tok.start
    let end = tok.end
    let j = i
    while (j < tokens.length) {
      const t = tokens[j] as Token
      const prev = tokens[j - 1]
      if (j > i && prev && !onlySpacesBetween(folded, prev.end, t.start)) break
      if (t.text in WORD_VALUES) {
        const v = WORD_VALUES[t.text] as number
        if (t.text !== 'um' && t.text !== 'uma') onlyArticle = false
        if (v === 1000) {
          total += (current || 1) * 1000
          current = 0
        } else {
          current += v
        }
        parts++
        end = t.end
        j++
        continue
      }
      // "e" só continua o número se vier outra palavra numérica logo depois ("trinta e dois").
      const next = tokens[j + 1]
      if (t.text === 'e' && parts > 0 && next && next.text in WORD_VALUES) {
        j++
        continue
      }
      break
    }
    // "um"/"uma" sozinhos são quase sempre artigo ("um livro"), então não contam como número.
    if (!(onlyArticle && parts === 1)) found.push({ value: total + current, start, end, kind: 'words' })
    i = Math.max(j, i + 1)
  }
  return found
}

function digitNumbers(text: string): FoundNumber[] {
  const found: FoundNumber[] = []
  const re = /\d{1,3}(?:\.\d{3})+(?![\d.]*\d)|\d+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    found.push({ value: Number(m[0].replace(/\./g, '')), start: m.index, end: m.index + m[0].length, kind: 'digits' })
  }
  return found
}

/** Todos os números do texto, em algarismos ou por extenso, na ordem em que aparecem. */
export function extractNumbers(text: string): FoundNumber[] {
  return [...digitNumbers(text), ...wordNumbers(text)].sort((a, b) => a.start - b.start)
}

export function containsNumber(text: string, value: number): boolean {
  return extractNumbers(text).some((n) => n.value === value)
}

/**
 * Até onde um texto em streaming pode ser mostrado com segurança: nunca termina no meio de uma palavra
 * nem no meio de um número que ainda pode crescer ("duzentos e" → "duzentos e vinte e dois").
 */
export function safeReleaseIndex(text: string): number {
  // Segura a última palavra, que pode estar incompleta.
  let cut = text.length
  while (cut > 0 && !/[\s.,!?;:)]/.test(text[cut - 1] as string)) cut--
  // Segura também uma sequência numérica no fim ("347", "trinta e", "1.").
  const folded = foldText(text.slice(0, cut))
  const tokens: Token[] = []
  const re = /\d[\d.]*|[^\s\d.,!?;:()"'«»-]+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(folded))) tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length })
  let hold = cut
  for (let k = tokens.length - 1; k >= 0; k--) {
    const t = tokens[k] as Token
    const next = tokens[k + 1]
    // Pontuação forte entre tokens encerra a sequência.
    if (next && /[!?;:]/.test(folded.slice(t.end, next.start))) break
    const word = t.text.replace(/\.+$/, '')
    if (/^\d[\d.]*$/.test(word) || word in WORD_VALUES || word === 'e') hold = t.start
    else break
  }
  return hold
}
