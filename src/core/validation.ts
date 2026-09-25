import { extractNumbers, foldText } from './numberWords'
import type { Answer } from './types'

// Validação de TODA saída do SLM antes de chegar à criança.

export const MAX_STATEMENT_LENGTH = 400
export const MAX_TUTOR_LENGTH = 400

export interface ValidationResult {
  ok: boolean
  text: string
  problems: string[]
}

/** Remove blocos de raciocínio, rótulos, markdown e aspas que modelos pequenos gostam de colocar. */
export function cleanOutput(raw: string): string {
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '')
  // Bloco <think> aberto e não fechado: nada depois dele é resposta.
  const open = text.search(/<think>/i)
  if (open >= 0) text = text.slice(0, open)
  text = text.replace(/<\/?[a-z_]+>/gi, '')
  text = text.replace(/\*\*|__|`|^#+\s*/gm, '')
  // Marcadores de lista viram frases corridas.
  text = text.replace(/^\s*(?:[-•*]|\d[.)])\s+/gm, '')
  text = text.replace(/\s+/g, ' ').trim()
  // Rótulos que o modelo copia do prompt: "Enunciado:", "A dica é:", "Passos:"...
  text = text.replace(
    /^\s*(?:(?:a|aqui vai a|aqui está a)\s+)?(enunciado|problema|pergunta|dica|tutor|resposta do tutor|reformulação|exemplo|explicação)(?:\s+(?:é|e))?\s*:\s*/i,
    ''
  )
  text = text.replace(/\b(passos|passo a passo|explicação)\s*:\s*/gi, '')
  // Listas numeradas ("Passo a passo: 1. Tire o menor...") viram frases corridas. Só no começo do texto
  // ou logo depois de ":", para não apagar o fim de frases como "É o mesmo que 4 + 4. Quanto dá?".
  text = text.replace(/(^|:\s*)\d[.)]\s+(?=[A-ZÀ-Ú])/g, '$1')
  text = text.replace(/^["“”'«]+|["“”'»]+$/g, '').trim()
  // Aspas que abriram e não fecharam.
  if ((text.match(/"/g) ?? []).length % 2 === 1) text = text.replace(/"/g, '')
  if ((text.match(/“/g) ?? []).length !== (text.match(/”/g) ?? []).length) text = text.replace(/[“”]/g, '')
  return text
}

const OPS: Record<string, (a: number, b: number) => number> = {
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '−': (a, b) => a - b,
  '–': (a, b) => a - b,
  x: (a, b) => a * b,
  '×': (a, b) => a * b,
  '*': (a, b) => a * b,
  '÷': (a, b) => a / b,
  ':': (a, b) => a / b,
  '/': (a, b) => a / b
}

/**
 * "O código decide a matemática": toda conta escrita pelo modelo ("45 + 40 = 85") é conferida.
 * Modelos pequenos inventam contas erradas com frequência, e uma conta errada ensina errado.
 */
export function wrongArithmetic(text: string): string | null {
  const num = String.raw`\d{1,3}(?:\.\d{3})+(?!\d)|\d+`
  const re = new RegExp(String.raw`(${num})\s*([+\-−–x×*÷:/])\s*(${num})\s*=\s*(${num})`, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const [, a, op, b, c] = m
    const n = (v: string) => Number(v.replace(/\.(?=\d{3})/g, ''))
    const expected = OPS[op as string]?.(n(a as string), n(b as string))
    if (expected !== undefined && expected !== n(c as string)) return m[0]
  }
  return null
}

/** "A resposta é 85", "o resultado é oitenta e cinco": o tutor nunca fala assim. */
export function announcesAnswer(text: string): boolean {
  const folded = foldText(text)
  const match = /\b(?:a resposta|o resultado|resposta final|resultado final)(?:\s+(?:e|sera|da|deu|fica)\b|\s*:)\s*([^.!?]*)/.exec(folded)
  if (!match) return false
  return extractNumbers(match[1] ?? '').length > 0
}

/** Mantém no máximo `max` frases (modelos pequenos às vezes continuam falando). */
export function limitSentences(text: string, max: number): string {
  const parts = text.match(/[^.!?…]+(?:[.!?…]+["”']?|$)/g)
  if (!parts || parts.length <= max) return text
  return parts.slice(0, max).join('').trim()
}

export function countSentences(text: string): number {
  return (text.match(/[.!?…]+(?=\s|$)/g) ?? []).length
}

function answerValues(answer: Answer): number[] {
  if (answer.kind === 'integer') return [answer.value]
  // O resto só é conferido quando é ≥ 2: "1" aparece demais em frases normais ("um de cada vez").
  return answer.remainder >= 2 ? [answer.quotient, answer.remainder] : [answer.quotient]
}

const OPERATOR = String.raw`(?:[+\-−–x×*÷:/]|mais|menos|vezes|dividido por|dividido entre)`
const EQUALS = String.raw`(?:=|e igual a|é igual a|da|dá|resulta em|fica)`

function escape(n: number): string {
  return String(n)
}

/** Detecta "347 - 125 =" (ou com as palavras "mais", "menos"...), nas duas ordens. */
export function containsFullExpression(text: string, operands: readonly number[]): boolean {
  const [x, y] = operands
  if (x === undefined || y === undefined) return false
  const folded = foldText(text).replace(/\.(?=\d{3})/g, '')
  const pattern = (p: number, q: number) =>
    new RegExp(String.raw`(?<![\d])${escape(p)}\s*${OPERATOR}\s*${escape(q)}(?![\d])\s*${EQUALS}`, 'i')
  return pattern(x, y).test(folded) || pattern(y, x).test(folded)
}

/** Algum número do texto é a resposta? (algarismos, "1.000", "mil", por extenso) */
export function leaksAnswer(text: string, answer: Answer): boolean {
  const values = answerValues(answer)
  return extractNumbers(text).some((n) => values.includes(n.value))
}

export interface StatementContext {
  numbers: readonly number[]
  answer: Answer
  /** Contas diretas ("Quanto é 7 + 5?") podem mostrar a conta; problemas contextualizados, não. */
  allowExpression?: boolean
  /**
   * Os números precisam aparecer na mesma ordem do rascunho do código. Em subtração e divisão a ordem
   * carrega o papel de cada número ("tinha 283, deu 668" não faz sentido).
   */
  orderedNumbers?: boolean
}

/** Checagens que já podem falhar no meio do streaming (para abortar cedo). */
export function statementPrefixProblem(text: string, ctx: StatementContext): string | null {
  if (/<think>/i.test(text) && !/<\/think>/i.test(text)) return null // ainda pensando; cleanOutput esconde
  const clean = cleanOutput(text)
  if (clean.length > MAX_STATEMENT_LENGTH) return 'longo demais'
  if (leaksAnswer(clean, ctx.answer)) return 'contém a resposta'
  const foreign = extractNumbers(clean).find((n) => !ctx.numbers.includes(n.value) && !(n.kind === 'words' && n.value === 2))
  if (foreign) return `número que não é do problema: ${foreign.value}`
  return null
}

export function validateStatement(raw: string, ctx: StatementContext): ValidationResult {
  const text = cleanOutput(raw)
  const problems: string[] = []
  if (!text) problems.push('vazio')
  if (text.length > MAX_STATEMENT_LENGTH) problems.push('longo demais')
  if (!text.endsWith('?')) problems.push('não termina com pergunta')
  // A pergunta final tem que ser a pergunta da conta ("Quantos...?", "Quanto dá?"), não um "né?".
  const lastSentence = text.split(/(?<=[.!])\s+/).pop() ?? ''
  if (!/quant[oa]s?\b/i.test(lastSentence)) problems.push('a pergunta final não pergunta a quantidade')
  if (/<think>/i.test(raw) && !/<\/think>/i.test(raw)) problems.push('bloco de raciocínio aberto')

  const found = extractNumbers(text)
  const digitValues = found.filter((n) => n.kind === 'digits').map((n) => n.value)
  for (const n of ctx.numbers) {
    if (!digitValues.includes(n)) problems.push(`falta o número ${n}`)
  }
  // "dois/duas" por extenso aparece em frases comuns ("os dois irmãos") sem mudar a conta.
  const foreign = found.filter((n) => !ctx.numbers.includes(n.value) && !(n.kind === 'words' && n.value === 2))
  if (foreign.length) problems.push(`números que não são do problema: ${foreign.map((n) => n.value).join(', ')}`)
  if (leaksAnswer(text, ctx.answer)) problems.push('contém a resposta')
  if (!ctx.allowExpression && /\d\s*[+\-−×x*÷=]\s*\d/.test(text)) problems.push('escreveu a conta')
  if (ctx.orderedNumbers) {
    const firstPositions = ctx.numbers.map((n) => digitValues.indexOf(n))
    const inOrder = firstPositions.every((p, i) => i === 0 || p > (firstPositions[i - 1] as number))
    if (firstPositions.every((p) => p >= 0) && !inOrder) problems.push('números fora de ordem')
  }
  return { ok: problems.length === 0, text, problems }
}

export interface TutorTextContext {
  answer: Answer
  /** Os dois números principais da questão, para detectar a conta inteira com resultado. */
  operands: readonly number[]
  maxSentences?: number
  /** No "exemplo parecido" o tutor PODE dizer a resposta (do exemplo). Nos outros, nunca anuncia resposta. */
  allowAnswerPhrase?: boolean
  /**
   * Números que o tutor pode usar. Fora deles, o texto é recusado: o modelo não pode introduzir
   * contas próprias (o código decide a matemática). Sem valor, não há restrição.
   */
  allowedNumbers?: readonly number[]
  /** Números que precisam aparecer (ex.: os da ideia de dica que o modelo está reescrevendo). */
  requiredNumbers?: readonly number[]
  maxLength?: number
  /** O texto precisa ter uma pergunta (o tutor socrático pergunta, não afirma). */
  requireQuestion?: boolean
}

/** Números que um tutor pode citar ao falar de uma conta: os próprios, seus algarismos e ordens (651 → 6, 5, 1, 600, 50). */
export function tutorNumberVocabulary(numbers: readonly number[]): number[] {
  const out = new Set<number>(Array.from({ length: 11 }, (_, i) => i))
  for (const n of numbers) {
    out.add(n)
    const digits = String(n).split('').map(Number)
    digits.forEach((d, i) => {
      out.add(d)
      out.add(d * 10 ** (digits.length - 1 - i))
    })
  }
  return [...out]
}

function numberRuleProblems(text: string, ctx: TutorTextContext): string[] {
  const problems: string[] = []
  const found = extractNumbers(text).map((n) => n.value)
  if (ctx.allowedNumbers) {
    const strange = found.filter((v) => !ctx.allowedNumbers!.includes(v))
    if (strange.length) problems.push(`números estranhos: ${[...new Set(strange)].join(', ')}`)
  }
  for (const n of ctx.requiredNumbers ?? []) if (!found.includes(n)) problems.push(`faltou o número ${n}`)
  return problems
}

export function tutorPrefixProblem(text: string, ctx: TutorTextContext): string | null {
  const clean = cleanOutput(text)
  if (clean.length > MAX_TUTOR_LENGTH) return 'longo demais'
  if (leaksAnswer(clean, ctx.answer)) return 'contém a resposta'
  if (containsFullExpression(clean, ctx.operands)) return 'contém a conta inteira'
  const wrong = wrongArithmetic(clean)
  if (wrong) return `conta errada: ${wrong}`
  if (!ctx.allowAnswerPhrase && announcesAnswer(clean)) return 'anuncia uma resposta'
  if (ctx.maxLength && clean.length > ctx.maxLength) return 'longo demais'
  if (ctx.allowedNumbers) {
    const strange = extractNumbers(clean).find((n) => !ctx.allowedNumbers!.includes(n.value))
    if (strange) return `número estranho: ${strange.value}`
  }
  return null
}

/** Dica, reformulação, exemplo, chat e feedback. */
export function validateTutorText(raw: string, ctx: TutorTextContext): ValidationResult {
  let text = cleanOutput(raw)
  if (ctx.maxSentences) text = limitSentences(text, ctx.maxSentences)
  const problems: string[] = []
  if (!text) problems.push('vazio')
  if (text.length > MAX_TUTOR_LENGTH) problems.push('longo demais')
  if (leaksAnswer(text, ctx.answer)) problems.push('contém a resposta')
  if (containsFullExpression(text, ctx.operands)) problems.push('contém a conta inteira')
  const wrong = wrongArithmetic(text)
  if (wrong) problems.push(`conta errada: ${wrong}`)
  if (!ctx.allowAnswerPhrase && announcesAnswer(text)) problems.push('anuncia uma resposta')
  if (ctx.maxLength && text.length > ctx.maxLength) problems.push('longo demais')
  if (ctx.requireQuestion && !text.includes('?')) problems.push('sem pergunta')
  // Conta quebrada no meio ("Vou te contar 8 + Vamos juntar...").
  if (/\d\s*[+×÷]\s*(?![\d\s]*\d)/.test(text) || /\d\s+[-−]\s+(?!\d)/.test(text)) problems.push('conta pela metade')
  problems.push(...numberRuleProblems(text, ctx))
  return { ok: problems.length === 0, text, problems }
}

/** Reformulação: além das regras do tutor, mantém os números do problema e não inventa outros. */
export function validateRephrase(raw: string, ctx: TutorTextContext & { numbers: readonly number[] }): ValidationResult {
  const base = validateTutorText(raw, ctx)
  const found = extractNumbers(base.text)
  const digitValues = found.filter((n) => n.kind === 'digits').map((n) => n.value)
  for (const n of ctx.numbers) if (!digitValues.includes(n)) base.problems.push(`falta o número ${n}`)
  // "dois/duas" por extenso é comum em frases simples ("as duas crianças") e não muda a conta.
  const foreign = found.filter((n) => !ctx.numbers.includes(n.value) && !(n.kind === 'words' && n.value === 2))
  if (foreign.length) base.problems.push('inventou números')
  if (!base.text.endsWith('?')) base.problems.push('não termina com a pergunta')
  return { ...base, ok: base.problems.length === 0 }
}
