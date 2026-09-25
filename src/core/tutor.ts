import { safeReleaseIndex } from './numberWords'
import type { ChatMessage, TutorKind } from './types'
import { cleanOutput, countSentences, limitSentences, type ValidationResult } from './validation'

// Orquestra: pedir ao LLM -> validar -> retry -> fallback.
// O LLM é só uma dependência injetada; o core não sabe se é node-llama-cpp, um mock ou nada.

export interface GenerateOptions {
  temperature: number
  maxTokens: number
  onToken?: (chunk: string) => void
  signal?: AbortSignal
}

export interface TextGenerator {
  generate(messages: ChatMessage[], options: GenerateOptions): Promise<string>
}

/** Evento de streaming para a UI: sempre o texto seguro inteiro até agora (nunca texto não validado). */
export type StreamEvent = { type: 'text'; text: string } | { type: 'reset' }

export interface TutorRequest {
  kind: TutorKind
  messages: ChatMessage[]
  temperature: number
  maxTokens: number
  validate: (raw: string) => ValidationResult
  /** Problema detectável já no meio do texto (ex.: vazou a resposta) → aborta e tenta de novo. */
  prefixProblem?: (text: string) => string | null
  /** Ao completar esta quantidade de frases, para de gerar (economiza tempo em PCs fracos). */
  maxSentences?: number
  fallback: () => string
  onStream?: (event: StreamEvent) => void
  maxAttempts?: number
  /** Tempo máximo por tentativa. */
  timeoutMs?: number
  /** Tempo máximo somando todas as tentativas; estourou, usa o fallback (PCs fracos não travam a criança). */
  totalTimeoutMs?: number
  signal?: AbortSignal
  now?: () => number
}

export interface TutorResult {
  text: string
  source: 'llm' | 'fallback'
  /** Tentativas que falharam antes do resultado. */
  retries: number
  fellBack: boolean
  latencyMs: number
  problems: string[]
}

export async function runTutor(llm: TextGenerator | null, req: TutorRequest): Promise<TutorResult> {
  const now = req.now ?? (() => Date.now())
  const started = now()
  const maxAttempts = req.maxAttempts ?? 3
  const problems: string[] = []
  let retries = 0

  if (llm) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (req.signal?.aborted) break
      const remaining = req.totalTimeoutMs ? req.totalTimeoutMs - (now() - started) : Infinity
      if (remaining <= 0) {
        problems.push('sem tempo para outra tentativa')
        break
      }
      const limit = Math.min(req.timeoutMs ?? Infinity, remaining)
      const controller = new AbortController()
      const onOuterAbort = () => controller.abort()
      req.signal?.addEventListener('abort', onOuterAbort)
      let timer: ReturnType<typeof setTimeout> | null = null
      let raw = ''
      let released = ''
      let rejected: string | null = null
      let enough = false
      // Estourou o tempo: a criança não espera o motor terminar de ler um prompt já cancelado
      // (em CPU fraca isso levava dezenas de segundos). A geração é abandonada e segue o fallback.
      let abandoned = false

      try {
        const generation = llm.generate(req.messages, {
          // Cada nova tentativa varia um pouco mais.
          temperature: Math.min(1.1, req.temperature + attempt * 0.15),
          maxTokens: req.maxTokens,
          signal: controller.signal,
          onToken: (chunk) => {
            if (rejected || enough || abandoned) return
            raw += chunk
            const clean = cleanOutput(raw)
            const safe = clean.slice(0, safeReleaseIndex(clean)).trimEnd()
            const problem = req.prefixProblem?.(safe) ?? null
            if (problem) {
              rejected = problem
              controller.abort()
              return
            }
            if (safe !== released && safe.length > 0) {
              released = safe
              req.onStream?.({ type: 'text', text: req.maxSentences ? limitSentences(safe, req.maxSentences) : safe })
            }
            if (req.maxSentences && countSentences(safe) >= req.maxSentences) {
              enough = true
              controller.abort()
            }
          }
        })
        const deadline = Number.isFinite(limit)
          ? new Promise<'timeout'>((resolve) => {
              timer = setTimeout(() => {
                controller.abort()
                resolve('timeout')
              }, limit)
            })
          : null
        const winner = deadline ? await Promise.race([generation, deadline]) : await generation
        if (winner === 'timeout') {
          abandoned = true
          generation.catch(() => undefined)
        } else {
          raw = winner || raw
        }
      } catch (err) {
        if (!rejected && !enough && !controller.signal.aborted) {
          problems.push(`erro do modelo: ${err instanceof Error ? err.message : String(err)}`)
        }
      } finally {
        if (timer) clearTimeout(timer)
        req.signal?.removeEventListener('abort', onOuterAbort)
      }

      if (rejected) {
        problems.push(rejected)
      } else if (abandoned) {
        problems.push('tempo esgotado')
        retries++
        if (released) req.onStream?.({ type: 'reset' })
        // O motor ainda está ocupado com a geração abandonada: outra tentativa só esperaria na fila.
        break
      } else if (controller.signal.aborted && !enough) {
        problems.push(req.signal?.aborted ? 'cancelado' : 'tempo esgotado')
      } else {
        const result = req.validate(raw)
        if (result.ok) {
          const text = req.maxSentences ? limitSentences(result.text, req.maxSentences) : result.text
          req.onStream?.({ type: 'text', text })
          return { text, source: 'llm', retries, fellBack: false, latencyMs: now() - started, problems }
        }
        problems.push(...result.problems)
      }
      retries++
      if (released) req.onStream?.({ type: 'reset' })
    }
  }

  // Fallback: texto dos templates, também validado. Se até ele falhar, uma frase neutra e segura.
  const fallbackRaw = req.fallback()
  const checked = req.validate(fallbackRaw)
  const text = checked.ok ? checked.text : 'Vamos ler o problema de novo, com calma? O que ele pede para descobrir?'
  req.onStream?.({ type: 'text', text })
  return {
    text,
    source: 'fallback',
    retries,
    fellBack: true,
    latencyMs: now() - started,
    problems: checked.ok ? problems : [...problems, 'fallback inválido']
  }
}
