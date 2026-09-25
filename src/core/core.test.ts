import { describe, expect, it } from 'vitest'
import { checkAnswer, parseNatural } from './answer'
import { createRng, deriveSeed } from './rng'
import { runTutor, type StreamEvent, type TextGenerator } from './tutor'
import { tutorPrefixProblem, validateTutorText } from './validation'
import { buildStatementPrompt, buildTutorSystem } from './prompts'
import { generateQuestion } from './generator'
import { THEMES } from './themes'
import { divisionPartHint } from './templates/helpers'
import type { Answer } from './types'

describe('rng', () => {
  it('é determinístico', () => {
    const a = createRng(123)
    const b = createRng(123)
    const xs = Array.from({ length: 20 }, () => a.int(0, 1000))
    const ys = Array.from({ length: 20 }, () => b.int(0, 1000))
    expect(xs).toEqual(ys)
  })

  it('respeita os limites', () => {
    const r = createRng(7)
    for (let i = 0; i < 10000; i++) {
      const v = r.int(3, 9)
      expect(v).toBeGreaterThanOrEqual(3)
      expect(v).toBeLessThanOrEqual(9)
    }
  })

  it('deriva seeds diferentes por sal', () => {
    expect(deriveSeed(1, 'a')).not.toBe(deriveSeed(1, 'b'))
    expect(deriveSeed(1, 'a')).toBe(deriveSeed(1, 'a'))
  })
})

describe('answer', () => {
  const correct: Answer = { kind: 'integer', value: 222 }

  it('aceita espaços e zeros à esquerda', () => {
    expect(checkAnswer(correct, { kind: 'integer', value: ' 222 ' }).correct).toBe(true)
    expect(checkAnswer(correct, { kind: 'integer', value: '0222' }).correct).toBe(true)
    expect(checkAnswer(correct, { kind: 'integer', value: '2 22' }).correct).toBe(true)
    expect(checkAnswer(correct, { kind: 'integer', value: '221' }).correct).toBe(false)
  })

  it('recusa entradas que não são número', () => {
    expect(parseNatural('')).toBeNull()
    expect(parseNatural('abc')).toBeNull()
    expect(parseNatural('-3')).toBeNull()
    expect(checkAnswer(correct, { kind: 'integer', value: '' }).valid).toBe(false)
  })

  it('confere quociente e resto', () => {
    const div: Answer = { kind: 'division', quotient: 7, remainder: 3 }
    expect(checkAnswer(div, { kind: 'division', quotient: '7', remainder: '3' }).correct).toBe(true)
    expect(checkAnswer(div, { kind: 'division', quotient: '7', remainder: '' }).correct).toBe(false)
    const exact: Answer = { kind: 'division', quotient: 7, remainder: 0 }
    expect(checkAnswer(exact, { kind: 'division', quotient: '07', remainder: '' }).correct).toBe(true)
  })
})

describe('prompts', () => {
  it('o prompt do enunciado leva os números e o tema, nunca a resposta', () => {
    const q = generateQuestion({ focus: 'add_sub', seed: 99 })
    const text = buildStatementPrompt(q).map((m) => m.content).join('\n')
    for (const n of q.numbers) expect(text).toContain(String(n))
    expect(text).toContain(q.theme.label)
    expect(text).toContain('NÃO escreva a resposta')
  })

  it('o prompt do tutor marca a resposta como segredo', () => {
    const system = buildTutorSystem({
      statement: 'Quanto é 3 + 4?',
      answer: { kind: 'integer', value: 7 },
      steps: ['3 + 4 = 7'],
      lastAttempt: null,
      hintLevel: 2
    })
    expect(system).toContain('SEGREDO')
    expect(system).toContain('nenhuma')
    expect(system).toContain('2 = aponta o próximo passo')
  })
})

/** Motor falso que "digita" o texto em pedaços pequenos, como o streaming real. */
function fakeLlm(outputs: string[]): TextGenerator & { calls: number } {
  const llm = {
    calls: 0,
    async generate(_messages: unknown, opts: { onToken?: (c: string) => void; signal?: AbortSignal }) {
      const text = outputs[Math.min(llm.calls, outputs.length - 1)] as string
      llm.calls++
      let out = ''
      for (let i = 0; i < text.length; i += 3) {
        if (opts.signal?.aborted) return out
        const chunk = text.slice(i, i + 3)
        out += chunk
        opts.onToken?.(chunk)
      }
      return out
    }
  }
  return llm
}

describe('tutor (retry e fallback)', () => {
  const answer: Answer = { kind: 'integer', value: 222 }
  const base = {
    kind: 'hint' as const,
    messages: [],
    temperature: 0.4,
    maxTokens: 100,
    validate: (raw: string) => validateTutorText(raw, { answer, operands: [347, 125] }),
    prefixProblem: (t: string) => tutorPrefixProblem(t, { answer, operands: [347, 125] }),
    fallback: () => 'Comece pelas unidades: quanto é 7 - 5?'
  }

  it('usa o texto do LLM quando é válido', async () => {
    const llm = fakeLlm(['Quanto é 7 - 5? Comece pelas unidades.'])
    const r = await runTutor(llm, base)
    expect(r).toMatchObject({ source: 'llm', retries: 0, fellBack: false })
  })

  it('tenta de novo quando a resposta vaza e depois aceita', async () => {
    const llm = fakeLlm(['A resposta é 222, fácil!', 'Olhe as unidades. Quanto é 7 - 5?'])
    const r = await runTutor(llm, base)
    expect(r.source).toBe('llm')
    expect(r.retries).toBe(1)
  })

  it('cai no fallback depois de 3 tentativas', async () => {
    const llm = fakeLlm(['É duzentos e vinte e dois.'])
    const r = await runTutor(llm, base)
    expect(llm.calls).toBe(3)
    expect(r).toMatchObject({ source: 'fallback', fellBack: true, retries: 3 })
    expect(r.text).toBe('Comece pelas unidades: quanto é 7 - 5?')
  })

  it('funciona sem modelo (modo básico)', async () => {
    const r = await runTutor(null, base)
    expect(r).toMatchObject({ source: 'fallback', retries: 0 })
  })

  it('o streaming nunca mostra a resposta, mesmo por extenso ou em pedaços', async () => {
    const events: StreamEvent[] = []
    const llm = fakeLlm([
      'Muito bem, pense assim: o resultado é duzentos e vinte e dois reais.',
      'Pense assim: são 347 e você tira 125. Dá 222 no fim.',
      'Comece pelas unidades. Quanto é 7 - 5?'
    ])
    await runTutor(llm, { ...base, onStream: (e) => events.push(e) })
    for (const e of events) {
      if (e.type === 'text') expect(validateTutorText(e.text, { answer, operands: [347, 125] }).ok, e.text).toBe(true)
    }
    expect(events.some((e) => e.type === 'reset')).toBe(true)
  })

  it('para de gerar ao atingir o limite de frases', async () => {
    const llm = fakeLlm(['Pense nas unidades. Quanto é 7 - 5? Depois as dezenas. E depois as centenas. Fim.'])
    const r = await runTutor(llm, { ...base, maxSentences: 2 })
    expect(r.text).toBe('Pense nas unidades. Quanto é 7 - 5?')
  })
})

describe('orçamento de tempo', () => {
  const answer: Answer = { kind: 'integer', value: 222 }
  it('com um motor lento que ignora o cancelamento, a criança recebe o texto pronto no prazo', async () => {
    // Simula a CPU fraca: o motor só devolve depois de 2 s, mesmo cancelado.
    const slow: TextGenerator = { generate: () => new Promise((resolve) => setTimeout(() => resolve('Quanto é 7 - 5?'), 2000)) }
    const t0 = Date.now()
    const r = await runTutor(slow, {
      kind: 'hint',
      messages: [],
      temperature: 0.4,
      maxTokens: 50,
      timeoutMs: 150,
      totalTimeoutMs: 300,
      validate: (raw) => validateTutorText(raw, { answer, operands: [347, 125] }),
      fallback: () => 'Comece pelas unidades: quanto é 7 - 5?'
    })
    expect(Date.now() - t0).toBeLessThan(600)
    expect(r).toMatchObject({ source: 'fallback', fellBack: true })
    expect(r.problems).toContain('tempo esgotado')
  })
})

describe('temas e dica de divisão (achados da 1ª rodada de avaliação)', () => {
  it('todo item tem recipientes próprios (nada de "balões em cada canteiro")', () => {
    for (const theme of THEMES) {
      for (const it of theme.items) expect(it.containers.length, `${theme.key}/${it.plural}`).toBeGreaterThan(0)
      // Todo tema precisa de pelo menos um item que possa ser arrumado em fileiras.
      expect(theme.items.some((i) => i.rows !== false), theme.key).toBe(true)
    }
    const parque = THEMES.find((t) => t.key === 'parque')!
    const baloes = parque.items.find((i) => i.plural === 'balões')!
    expect(baloes.containers.map((c) => c.plural)).not.toContain('canteiros')
  })

  it('dica concreta de divisão respeita o significado: repartir ≠ medida', () => {
    // 12 ÷ 6 = 2: nenhuma tentativa da tabuada é segura, então entra a atividade concreta.
    expect(divisionPartHint(12, 6, 2, 0, 'repartir')).toMatch(/Desenhe 6 círculos, um para cada amigo/)
    expect(divisionPartHint(12, 6, 2, 0, 'medida')).toMatch(/faça grupos de 6/)
  })
})
