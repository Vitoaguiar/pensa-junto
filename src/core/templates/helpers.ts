import type { Answer, Rng } from '../types'

/** Sorteia parâmetros até satisfazer as restrições (determinístico para a mesma seed). */
export function drawUntil<P>(rng: Rng, draw: (rng: Rng) => P, ok: (p: P) => boolean, maxTries = 500): P {
  for (let i = 0; i < maxTries; i++) {
    const p = draw(rng)
    if (ok(p)) return p
  }
  throw new Error('Não foi possível gerar parâmetros válidos')
}

export const int = (value: number): Answer => ({ kind: 'integer', value })

export function answerNumbers(answer: Answer): number[] {
  return answer.kind === 'integer' ? [answer.value] : [answer.quotient, answer.remainder]
}

/** Garante: números distintos, resposta ≥ 2 e fora do enunciado. */
export function distinctFromAnswer(numbers: number[], answer: Answer): boolean {
  const main = answer.kind === 'integer' ? answer.value : answer.quotient
  if (main < 2) return false
  if (new Set(numbers).size !== numbers.length) return false
  return !numbers.includes(main)
}

const digits = (n: number) => ({ c: Math.floor(n / 100) % 10, d: Math.floor(n / 10) % 10, u: n % 10 })

/** Passos da adição pelo algoritmo das colunas (para o tutor; inclui o resultado, que é segredo). */
export function additionSteps(a: number, b: number): string[] {
  if (a < 10 && b < 10) {
    return [`Juntar ${a} com ${b}.`, `Contar a partir do ${Math.max(a, b)} mais ${Math.min(a, b)}.`, `${a} + ${b} = ${a + b}.`]
  }
  const x = digits(a)
  const y = digits(b)
  const steps: string[] = [`Armar a conta ${a} + ${b} alinhando unidades, dezenas e centenas.`]
  const su = x.u + y.u
  steps.push(`Unidades: ${x.u} + ${y.u} = ${su}${su >= 10 ? `; fica ${su % 10} e vai 1 para as dezenas` : ''}.`)
  const carryD = su >= 10 ? 1 : 0
  const sd = x.d + y.d + carryD
  steps.push(
    `Dezenas: ${x.d} + ${y.d}${carryD ? ' + 1' : ''} = ${sd}${sd >= 10 ? `; fica ${sd % 10} e vai 1 para as centenas` : ''}.`
  )
  if (a >= 100 || b >= 100 || sd >= 10) {
    const carryC = sd >= 10 ? 1 : 0
    steps.push(`Centenas: ${x.c} + ${y.c}${carryC ? ' + 1' : ''} = ${x.c + y.c + carryC}.`)
  }
  steps.push(`Resultado: ${a + b}.`)
  return steps
}

/** Passos da subtração pelo algoritmo das colunas, com reagrupamento ("pedir emprestado"). */
export function subtractionSteps(a: number, b: number): string[] {
  if (a < 20 && b < 10) {
    return [`Tirar ${b} de ${a}.`, `Começar no ${a} e voltar ${b} números.`, `${a} - ${b} = ${a - b}.`]
  }
  const x = digits(a)
  const y = digits(b)
  const steps: string[] = [`Armar a conta ${a} - ${b} alinhando unidades, dezenas e centenas.`]
  let { u, d, c } = x
  if (u < y.u) {
    steps.push(`Unidades: ${u} é menor que ${y.u}; trocar 1 dezena por 10 unidades (${u} vira ${u + 10}).`)
    u += 10
    d -= 1
  }
  steps.push(`Unidades: ${u} - ${y.u} = ${u - y.u}.`)
  if (d < y.d) {
    steps.push(`Dezenas: ${d} é menor que ${y.d}; trocar 1 centena por 10 dezenas (${d} vira ${d + 10}).`)
    d += 10
    c -= 1
  }
  steps.push(`Dezenas: ${d} - ${y.d} = ${d - y.d}.`)
  if (a >= 100) steps.push(`Centenas: ${c} - ${y.c} = ${c - y.c}.`)
  steps.push(`Resultado: ${a - b}.`)
  return steps
}

/** Dica nível 3 para adição: uma parte da conta, nunca a conta inteira. */
export function additionPartHint(a: number, b: number): string {
  if (a < 10 && b < 10) {
    const big = Math.max(a, b)
    const small = Math.min(a, b)
    return `Guarde o ${big} na cabeça e conte mais ${small} nos dedos, um de cada vez. Em que número você parou?`
  }
  const x = digits(a)
  const y = digits(b)
  if (x.u + y.u >= 10) {
    return `Comece pelas unidades: ${x.u} + ${y.u}. Deu mais que 10? Então uma dezena "sobe" para a coluna das dezenas.`
  }
  return `Comece pelas unidades: quanto é ${x.u} + ${y.u}? Depois some as dezenas${a >= 100 || b >= 100 ? ' e as centenas' : ''}.`
}

/** Dica nível 3 para subtração: uma parte da conta, nunca a conta inteira. */
export function subtractionPartHint(a: number, b: number): string {
  if (a < 20 && b < 10) {
    return `Comece no ${a} e volte ${b} números, contando nos dedos. Em que número você parou?`
  }
  const x = digits(a)
  const y = digits(b)
  if (x.u < y.u) {
    return `Olhe as unidades: dá para tirar ${y.u} de ${x.u}? Se não der, troque 1 dezena por 10 unidades primeiro.`
  }
  return `Comece pelas unidades: quanto é ${x.u} - ${y.u}? Depois faça as dezenas${a >= 100 ? ' e as centenas' : ''}.`
}

/** Dica nível 3 para multiplicação: contar de tanto em tanto sem chegar ao fim. */
export function multiplicationPartHint(groups: number, size: number): string {
  if (groups === 2) return `São 2 grupos de ${size}. É o mesmo que ${size} + ${size}. Quanto dá?`
  if (size === 10) return `Conte de 10 em 10, uma vez para cada grupo: 10, 20, ... Quantos grupos são mesmo? Continue até o último.`
  return `Conte de ${size} em ${size}, um salto para cada grupo: comece com ${size} e vá somando mais ${size} até dar ${groups} saltos.`
}

/** Dica nível 3 para divisão: uma tentativa da tabuada que não seja a resposta. */
export function divisionPartHint(total: number, divisor: number, quotient: number, remainder = 0): string {
  const secret = [quotient, remainder]
  for (let k = 2; k <= 9; k++) {
    const product = k * divisor
    if (!secret.includes(k) && !secret.includes(product) && !secret.includes(divisor) && product < total) {
      return `Tente um número: ${k} × ${divisor} = ${product}. Chegou em ${total}? Se ainda falta, tente um número maior.`
    }
  }
  return `Desenhe ${total} bolinhas e faça grupos de ${divisor}. Depois conte quantos grupos você fez.`
}
