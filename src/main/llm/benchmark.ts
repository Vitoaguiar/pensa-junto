import fs from 'node:fs'
import os from 'node:os'
import { generateQuestion } from '@core/generator'
import { buildHintPrompt, buildStatementPrompt } from '@core/prompts'
import { runTutor, type TutorRequest } from '@core/tutor'
import type { GeneratedQuestion, HintLevel } from '@core/types'
import { statementPrefixProblem, validateStatement } from '@core/validation'
import type { Repositories } from '../db/repositories'
import {
  STATEMENT_BUDGET_MS,
  statementContext,
  TUTOR_BUDGET_MS,
  tutorTextChecks
} from '../services/learning'
import type { LlmService } from './llmService'
import { findCatalogModel } from './modelCatalog'
import type { EngineInfo } from './nodeLlamaEngine'

// Benchmark: mede, NESTE computador, o que a criança vai sentir com cada modelo. Usa os mesmos prompts,
// as mesmas regras de validação e os mesmos limites de tempo do app. Não grava nada no banco.

export interface BenchmarkOptions {
  /** Quantos enunciados e quantas dicas por modelo. */
  n: number
  /** "all" = todos os modelos instalados; "active" = só o em uso; ou uma lista de chaves do catálogo. */
  models: 'all' | 'active' | string[]
  simulation: { threads: number | null; gpu: 'auto' | 'off' }
}

interface Stats {
  median: number
  p90: number
  max: number
}

interface KindReport {
  n: number
  /** Tempo até o primeiro pedaço de texto aparecer (o que a criança percebe como "começou"). */
  firstTextMs: Stats | null
  /** Tempo até o texto final (inclui tentativas e, se for o caso, a troca pelo texto pronto). */
  totalMs: Stats
  /** Em quantos % o texto do modelo passou na conferência. */
  modelPercent: number
  retriesAvg: number
}

export interface ModelBenchmark {
  modelId: string
  key: string | null
  name: string
  sizeBytes: number | null
  loadSeconds: number
  engine: EngineInfo | null
  peakRssMb: number
  minFreeRamMb: number
  statement: KindReport
  hint: KindReport
  /** Meta do MVP: enunciado em até ~10 s. */
  meetsStatementGoal: boolean
  samples: Array<{ kind: string; source: string; ms: number; text: string; problems: string[] }>
  error?: string
}

export interface BenchmarkReport {
  version: string
  date: string
  machine: { cpu: string; cores: number; totalRamGb: number; platform: string; arch: string }
  simulation: BenchmarkOptions['simulation']
  n: number
  models: ModelBenchmark[]
}

function stats(values: number[]): Stats {
  const sorted = [...values].sort((a, b) => a - b)
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0
  return { median: Math.round(at(0.5)), p90: Math.round(at(0.9)), max: Math.round(sorted[sorted.length - 1] ?? 0) }
}

/** Questões contextualizadas (as contas diretas não passam pelo modelo no app). */
function benchQuestions(n: number): GeneratedQuestion[] {
  return Array.from({ length: n }, (_, i) =>
    generateQuestion({ focus: 'mixed', seed: 7000 + i * 13, enabledSkills: ['EF03MA06', 'EF03MA07', 'EF03MA08'] })
  )
}

interface Deps {
  repos: Repositories
  llm: LlmService
  engineInfo: () => EngineInfo | null
  version: string
  log: (line: string) => void
}

export async function runBenchmark(deps: Deps, options: BenchmarkOptions): Promise<BenchmarkReport> {
  const installed = deps.repos.models.list().filter((r) => r.status === 'ready' && fs.existsSync(r.filePath))
  const selected =
    options.models === 'all'
      ? installed
      : options.models === 'active'
        ? installed.filter((r) => r.id === deps.llm.activeModelId)
        : installed.filter((r) => r.catalogKey && (options.models as string[]).includes(r.catalogKey))

  const cpus = os.cpus()
  const report: BenchmarkReport = {
    version: deps.version,
    date: new Date().toISOString(),
    machine: {
      cpu: cpus[0]?.model.trim() ?? 'desconhecido',
      cores: cpus.length,
      totalRamGb: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
      platform: `${os.type()} ${os.release()}`,
      arch: os.arch()
    },
    simulation: options.simulation,
    n: options.n,
    models: []
  }
  if (selected.length === 0) deps.log('Nenhum modelo instalado para medir. Baixe ou adicione um modelo no app.')

  const questions = benchQuestions(options.n)

  for (const row of selected) {
    const name = row.catalogKey ? (findCatalogModel(row.catalogKey)?.displayName ?? row.displayName) : row.displayName
    deps.log(`\n▶ ${name}: carregando...`)

    // Memória: pico do processo e mínimo de RAM livre no sistema durante a medição deste modelo.
    let peakRss = process.memoryUsage().rss
    let minFree = os.freemem()
    const sampler = setInterval(() => {
      peakRss = Math.max(peakRss, process.memoryUsage().rss)
      minFree = Math.min(minFree, os.freemem())
    }, 200)

    const base: ModelBenchmark = {
      modelId: row.id,
      key: row.catalogKey,
      name,
      sizeBytes: row.fileSizeBytes,
      loadSeconds: 0,
      engine: null,
      peakRssMb: 0,
      minFreeRamMb: 0,
      statement: { n: 0, firstTextMs: null, totalMs: stats([]), modelPercent: 0, retriesAvg: 0 },
      hint: { n: 0, firstTextMs: null, totalMs: stats([]), modelPercent: 0, retriesAvg: 0 },
      meetsStatementGoal: false,
      samples: []
    }

    try {
      const t0 = Date.now()
      const loaded = await deps.llm.loadModel(row.id) // inclui o aquecimento
      base.loadSeconds = Math.round((Date.now() - t0) / 100) / 10
      if (!loaded) throw new Error(deps.llm.state().state === 'error' ? 'não foi possível carregar o modelo' : 'modelo indisponível')
      base.engine = deps.engineInfo()
      deps.log(`  carregado em ${base.loadSeconds}s (${base.engine?.gpu ? `GPU: ${base.engine.gpu}` : 'só CPU'}, ${base.engine?.threads ?? '?'} threads)`)
      const generator = await deps.llm.generator('foreground', row.id)

      const measure = async (kind: 'statement' | 'hint', req: Omit<TutorRequest, 'onStream' | 'kind'>) => {
        const started = Date.now()
        let first: number | null = null
        const result = await runTutor(generator, {
          ...req,
          kind,
          onStream: (e) => {
            if (first === null && e.type === 'text' && e.text) first = Date.now() - started
          }
        })
        const ms = Date.now() - started
        if (base.samples.filter((s) => s.kind === kind).length < 4) {
          base.samples.push({ kind, source: result.source, ms, text: result.text.slice(0, 200), problems: result.problems.slice(0, 4) })
        }
        return { ms, first, result }
      }

      const summarize = (runs: Array<{ ms: number; first: number | null; result: { source: string; retries: number } }>): KindReport => {
        const firsts = runs.filter((r) => r.result.source === 'llm' && r.first !== null).map((r) => r.first as number)
        return {
          n: runs.length,
          firstTextMs: firsts.length ? stats(firsts) : null,
          totalMs: stats(runs.map((r) => r.ms)),
          modelPercent: Math.round((runs.filter((r) => r.result.source === 'llm').length / Math.max(1, runs.length)) * 100),
          retriesAvg: Math.round((runs.reduce((s, r) => s + r.result.retries, 0) / Math.max(1, runs.length)) * 10) / 10
        }
      }

      // Enunciados
      const statementRuns = []
      for (const [i, q] of questions.entries()) {
        const ctx = statementContext(q)
        const run = await measure('statement', {
          messages: buildStatementPrompt(q),
          temperature: 0.5,
          maxTokens: 160,
          timeoutMs: 15_000,
          totalTimeoutMs: STATEMENT_BUDGET_MS,
          validate: (raw) => validateStatement(raw, ctx),
          prefixProblem: (text) => statementPrefixProblem(text, ctx),
          fallback: () => q.fallbackStatement
        })
        statementRuns.push(run)
        deps.log(`  enunciado ${i + 1}/${options.n}: ${run.ms} ms (${run.result.source === 'llm' ? 'modelo' : 'texto pronto'})`)
      }
      base.statement = summarize(statementRuns)

      // Dicas (níveis 1, 2 e 3 alternados), com as regras de reescrita do app.
      const hintRuns = []
      for (const [i, q] of questions.entries()) {
        const level = ((i % 3) + 1) as HintLevel
        const idea = q.fallbackHints[level - 1] as string
        const run = await measure('hint', {
          messages: buildHintPrompt(
            { statement: q.fallbackStatement, answer: q.answer, steps: q.steps, lastAttempt: null, hintLevel: level },
            idea
          ),
          temperature: 0.4,
          maxTokens: 120,
          maxSentences: 2,
          timeoutMs: 15_000,
          totalTimeoutMs: TUTOR_BUDGET_MS,
          fallback: () => idea,
          ...tutorTextChecks(q, { idea })
        })
        hintRuns.push(run)
        deps.log(`  dica ${i + 1}/${options.n}: ${run.ms} ms (${run.result.source === 'llm' ? 'modelo' : 'texto pronto'})`)
      }
      base.hint = summarize(hintRuns)
      base.meetsStatementGoal = base.statement.totalMs.median <= 10_000
    } catch (err) {
      base.error = err instanceof Error ? err.message : String(err)
      deps.log(`  erro: ${base.error}`)
    } finally {
      clearInterval(sampler)
      base.peakRssMb = Math.round(peakRss / 1024 ** 2)
      base.minFreeRamMb = Math.round(minFree / 1024 ** 2)
    }
    report.models.push(base)
  }
  return report
}

/** Resumo legível para o terminal. */
export function formatBenchmark(report: BenchmarkReport): string {
  const s = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')}s`
  const lines = [
    '',
    '=== Benchmark Pensa Junto ===',
    `Computador: ${report.machine.cpu} · ${report.machine.cores} núcleos lógicos · ${report.machine.totalRamGb} GB`,
    `Simulação: ${report.simulation.threads ? `${report.simulation.threads} threads` : 'threads automáticas'} · GPU ${report.simulation.gpu === 'off' ? 'desligada' : 'automática'}`,
    ''
  ]
  for (const m of report.models) {
    lines.push(`> ${m.name}${m.error ? `  (erro: ${m.error})` : ''}`)
    if (m.error) continue
    lines.push(`  Carregar: ${m.loadSeconds.toString().replace('.', ',')}s · memória do app (pico): ${m.peakRssMb} MB · RAM livre (mínimo): ${m.minFreeRamMb} MB`)
    lines.push(
      `  Enunciado: começa em ${m.statement.firstTextMs ? s(m.statement.firstTextMs.median) : '—'} · pronto em ${s(m.statement.totalMs.median)} (p90 ${s(m.statement.totalMs.p90)}) · modelo aprovado em ${m.statement.modelPercent}%`
    )
    lines.push(
      `  Dica:      começa em ${m.hint.firstTextMs ? s(m.hint.firstTextMs.median) : '—'} · pronta em ${s(m.hint.totalMs.median)} (p90 ${s(m.hint.totalMs.p90)}) · modelo aprovado em ${m.hint.modelPercent}%`
    )
    lines.push(`  Meta do enunciado (~10 s): ${m.meetsStatementGoal ? 'OK' : 'NÃO ATINGIU'}`)
    lines.push('')
  }
  return lines.join('\n')
}
