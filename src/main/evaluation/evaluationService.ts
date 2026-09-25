import { randomInt } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { formatAnswer } from '@core/answer'
import { generateQuestion } from '@core/generator'
import { buildHintPrompt, buildStatementPrompt } from '@core/prompts'
import { findTemplate } from '@core/templates'
import { runTutor, type TextGenerator, type TutorResult } from '@core/tutor'
import type { GeneratedQuestion, HintLevel } from '@core/types'
import { statementPrefixProblem, validateStatement } from '@core/validation'
import type {
  EvaluationConditionReportDto,
  EvaluationCreateOptionsDto,
  EvaluationImportResultDto,
  EvaluationProgressDto,
  EvaluationReportDto,
  EvaluationSetDto,
  EvaluationStatsDto
} from '@shared/types'
import { STATEMENT_BUDGET_MS, statementContext, TUTOR_BUDGET_MS, tutorTextChecks } from '../services/learning'
import {
  fleissKappa,
  kappaLabel,
  mean,
  median,
  parseRatings,
  RATING_HEADER,
  seededShuffle,
  toCsv,
  type RatingRow
} from './stats'

// Modo de avaliação: gera uma "rodada" de textos (enunciados e dicas) para professores avaliarem às cegas,
// com as MESMAS questões para cada condição (textos do código e cada modelo), e depois consolida as notas.

type Kind = 'statement' | 'hint'

interface Condition {
  id: string // 'code' ou o id do modelo
  label: string
  modelId: string | null
}

interface Item {
  itemId: string
  kind: Kind
  skillCode: string
  problem: string
  text: string
  answer: string
}

interface KeyEntry {
  itemId: string
  condition: string
  kind: Kind
  skillCode: string
  templateId: string
  seed: number
  questionIndex: number
  hintLevel: number | null
  /** De onde veio o texto que o avaliador vê: do modelo (aprovado na validação) ou do código. */
  source: 'llm' | 'code'
  retries: number
  latencyMs: number
  problems: string[]
}

interface EvaluationKey {
  code: string
  createdAt: string
  appVersion: string
  perSkill: number
  skills: string[]
  kinds: Kind[]
  conditions: Condition[]
  items: Item[]
  entries: KeyEntry[]
}

export interface EvaluationDeps {
  baseDir: string
  appVersion: string
  /** Modelos instalados que podem entrar na rodada. */
  installedModels: () => Array<{ id: string; name: string }>
  /** Gerador de texto já carregado com aquele modelo (ou null se não abrir). */
  generatorFor: (modelId: string) => Promise<TextGenerator | null>
  emitProgress: (p: EvaluationProgressDto) => void
}

const KIND_LABEL: Record<Kind, string> = { statement: 'Enunciado', hint: 'Dica' }
const CODE_CONDITION: Condition = { id: 'code', label: 'Textos do código (sem modelo)', modelId: null }

export class EvaluationService {
  private running: AbortController | null = null

  constructor(private readonly deps: EvaluationDeps) {
    fs.mkdirSync(deps.baseDir, { recursive: true })
  }

  private folder(code: string): string {
    if (!/^[A-Z0-9]{4,8}$/.test(code)) throw new Error('Código de rodada inválido.')
    return path.join(this.deps.baseDir, code)
  }

  private readKey(code: string): EvaluationKey {
    return JSON.parse(fs.readFileSync(path.join(this.folder(code), `gabarito-${code}.json`), 'utf8')) as EvaluationKey
  }

  folderOf(code: string): string {
    return this.folder(code)
  }

  cancel(): void {
    this.running?.abort()
  }

  list(): EvaluationSetDto[] {
    const sets: EvaluationSetDto[] = []
    for (const code of fs.readdirSync(this.deps.baseDir)) {
      try {
        const key = this.readKey(code)
        sets.push({
          code,
          createdAt: key.createdAt,
          conditions: key.conditions.map((c) => c.label),
          kinds: key.kinds,
          skills: key.skills,
          items: key.items.length,
          raters: this.raterFiles(code).length
        })
      } catch {
        // pasta que não é de uma rodada
      }
    }
    return sets.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  // ---------------- Gerar rodada ----------------

  async create(options: EvaluationCreateOptionsDto): Promise<EvaluationSetDto> {
    if (this.running) throw new Error('Já existe uma rodada sendo gerada.')
    const controller = new AbortController()
    this.running = controller
    try {
      return await this.generate(options, controller.signal)
    } finally {
      this.running = null
    }
  }

  private async generate(options: EvaluationCreateOptionsDto, signal: AbortSignal): Promise<EvaluationSetDto> {
    const installed = this.deps.installedModels()
    const conditions: Condition[] = [
      ...(options.includeCode ? [CODE_CONDITION] : []),
      ...options.modelIds.map((id) => {
        const model = installed.find((m) => m.id === id)
        if (!model) throw new Error('Modelo não encontrado.')
        return { id, label: model.name, modelId: id }
      })
    ]
    if (conditions.length === 0) throw new Error('Escolha pelo menos uma condição.')
    const kinds = options.kinds as Kind[]
    const code = newCode(this.deps.baseDir)
    const baseSeed = randomInt(0, 2 ** 31)

    // As mesmas questões para todas as condições (comparação pareada).
    const questions: Array<{ q: GeneratedQuestion; index: number }> = []
    options.skills.forEach((skill, s) => {
      for (let i = 0; i < options.perSkill; i++) {
        const q = generateQuestion({ focus: 'mixed', seed: (baseSeed + s * 100_003 + i * 7919) >>> 0, enabledSkills: [skill] })
        questions.push({ q, index: questions.length })
      }
    })

    const total = conditions.length * questions.length * kinds.length
    let done = 0
    const progress = (label: string) => this.deps.emitProgress({ code, done, total, label })

    // Textos gerados por condição; depois deduplicados e embaralhados.
    const raw: Array<{ condition: Condition; kind: Kind; qi: number; hintLevel: number | null; text: string; result: TutorResult | null }> = []

    for (const condition of conditions) {
      const generator = condition.modelId ? await this.deps.generatorFor(condition.modelId) : null
      if (condition.modelId && !generator) throw new Error(`Não foi possível abrir o modelo ${condition.label}.`)
      for (const { q, index } of questions) {
        for (const kind of kinds) {
          if (signal.aborted) throw new Error('Geração cancelada.')
          progress(`${condition.label}: ${KIND_LABEL[kind].toLowerCase()} ${index + 1} de ${questions.length}`)
          const hintLevel = kind === 'hint' ? (((index % 3) + 1) as HintLevel) : null
          const result = await this.textFor(generator, q, kind, hintLevel, signal)
          raw.push({ condition, kind, qi: index, hintLevel, text: result ? result.text : this.codeText(q, kind, hintLevel), result })
          done++
        }
      }
    }

    // Deduplica: se dois modelos (ou o modelo e o código) produziram o mesmo texto para a mesma questão,
    // o avaliador vê um item só, e o gabarito aponta as duas condições para ele.
    const itemsByKey = new Map<string, Omit<Item, 'itemId'> & { tmp: string }>()
    const entriesTmp: Array<Omit<KeyEntry, 'itemId'> & { tmp: string }> = []
    for (const r of raw) {
      const q = (questions[r.qi] as { q: GeneratedQuestion }).q
      const dedupKey = `${r.kind}|${r.qi}|${r.hintLevel ?? ''}|${normalize(r.text)}`
      if (!itemsByKey.has(dedupKey)) {
        itemsByKey.set(dedupKey, {
          tmp: dedupKey,
          kind: r.kind,
          skillCode: q.skillCode,
          problem: r.kind === 'hint' ? q.fallbackStatement : '',
          text: r.text,
          answer: formatAnswer(q.answer)
        })
      }
      entriesTmp.push({
        tmp: dedupKey,
        condition: r.condition.id,
        kind: r.kind,
        skillCode: q.skillCode,
        templateId: q.templateId,
        seed: q.seed,
        questionIndex: r.qi,
        hintLevel: r.hintLevel,
        source: r.result?.source === 'llm' ? 'llm' : 'code',
        retries: r.result?.retries ?? 0,
        latencyMs: r.result?.latencyMs ?? 0,
        problems: r.result?.problems.slice(0, 5) ?? []
      })
    }

    const shuffled = seededShuffle([...itemsByKey.values()], baseSeed)
    const idByTmp = new Map<string, string>()
    const items: Item[] = shuffled.map(({ tmp, ...item }, i) => {
      const itemId = `${code}-${String(i + 1).padStart(3, '0')}`
      idByTmp.set(tmp, itemId)
      return { itemId, ...item }
    })
    const entries: KeyEntry[] = entriesTmp.map(({ tmp, ...e }) => ({ itemId: idByTmp.get(tmp) as string, ...e }))

    const key: EvaluationKey = {
      code,
      createdAt: new Date().toISOString(),
      appVersion: this.deps.appVersion,
      perSkill: options.perSkill,
      skills: options.skills,
      kinds,
      conditions,
      items,
      entries
    }
    this.writeSet(key)
    progress('Pronto')
    return this.list().find((s) => s.code === code) as EvaluationSetDto
  }

  /** O que a criança veria nesta condição. null = condição "código" (sem modelo). */
  private async textFor(
    generator: TextGenerator | null,
    q: GeneratedQuestion,
    kind: Kind,
    hintLevel: HintLevel | null,
    signal: AbortSignal
  ): Promise<TutorResult | null> {
    if (!generator) return null
    if (kind === 'statement') {
      // Contas diretas nunca passam pelo modelo no app: o texto é o do código.
      if (findTemplate(q.templateId).direct) return null
      const ctx = statementContext(q)
      return runTutor(generator, {
        kind: 'statement',
        messages: buildStatementPrompt(q),
        temperature: 0.5,
        maxTokens: 160,
        timeoutMs: 15_000,
        totalTimeoutMs: STATEMENT_BUDGET_MS,
        validate: (raw) => validateStatement(raw, ctx),
        prefixProblem: (text) => statementPrefixProblem(text, ctx),
        fallback: () => q.fallbackStatement,
        signal
      })
    }
    const level = hintLevel as HintLevel
    const idea = q.fallbackHints[level - 1] as string
    return runTutor(generator, {
      kind: 'hint',
      messages: buildHintPrompt({ statement: q.fallbackStatement, answer: q.answer, steps: q.steps, lastAttempt: null, hintLevel: level }, idea),
      temperature: 0.4,
      maxTokens: 120,
      maxSentences: 2,
      timeoutMs: 15_000,
      totalTimeoutMs: TUTOR_BUDGET_MS,
      fallback: () => idea,
      signal,
      ...tutorTextChecks(q, { idea })
    })
  }

  private codeText(q: GeneratedQuestion, kind: Kind, hintLevel: number | null): string {
    return kind === 'statement' ? q.fallbackStatement : (q.fallbackHints[(hintLevel ?? 1) - 1] as string)
  }

  private writeSet(key: EvaluationKey): void {
    const dir = this.folder(key.code)
    fs.mkdirSync(path.join(dir, 'respostas'), { recursive: true })
    const rows = [
      [...RATING_HEADER],
      ...key.items.map((it) => [it.itemId, it.skillCode, KIND_LABEL[it.kind], it.problem, it.text, it.answer, '', '', '', ''])
    ]
    fs.writeFileSync(path.join(dir, `avaliacao-${key.code}.csv`), toCsv(rows), 'utf8')
    fs.writeFileSync(path.join(dir, `gabarito-${key.code}.json`), JSON.stringify(key, null, 2), 'utf8')
    fs.writeFileSync(path.join(dir, 'LEIA-ME.txt'), readme(key), 'utf8')
  }

  // ---------------- Importar avaliações ----------------

  private raterFiles(code: string): string[] {
    const dir = path.join(this.folder(code), 'respostas')
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.csv')) : []
  }

  /** Copia as planilhas preenchidas para a rodada. O nome do avaliador vem do nome do arquivo. */
  importRatings(code: string, files: string[]): EvaluationImportResultDto {
    const key = this.readKey(code)
    const known = new Set(key.items.map((i) => i.itemId))
    const dir = path.join(this.folder(code), 'respostas')
    fs.mkdirSync(dir, { recursive: true })
    const result: EvaluationImportResultDto = { imported: [], errors: [] }
    for (const file of files) {
      const base = path.basename(file)
      try {
        let rater = raterFromFile(base, code)
        const rows = parseRatings(fs.readFileSync(file, 'utf8'), rater)
        const matching = rows.filter((r) => known.has(r.itemId))
        if (matching.length === 0) throw new Error('nenhuma linha desta rodada com nota')
        // Mesmo nome de avaliador duas vezes: numera, sem sobrescrever.
        let target = path.join(dir, `${rater}.csv`)
        for (let n = 2; fs.existsSync(target); n++) {
          rater = `${raterFromFile(base, code)}-${n}`
          target = path.join(dir, `${rater}.csv`)
        }
        fs.copyFileSync(file, target)
        result.imported.push({ rater, rated: matching.length, unknown: rows.length - matching.length })
      } catch (err) {
        result.errors.push({ file: base, message: err instanceof Error ? err.message : String(err) })
      }
    }
    return result
  }

  // ---------------- Relatório ----------------

  report(code: string): EvaluationReportDto {
    const key = this.readKey(code)
    const dir = path.join(this.folder(code), 'respostas')
    const ratings: RatingRow[] = []
    for (const f of this.raterFiles(code)) {
      ratings.push(...parseRatings(fs.readFileSync(path.join(dir, f), 'utf8'), f.replace(/\.csv$/i, '')))
    }
    const known = new Set(key.items.map((i) => i.itemId))
    const valid = ratings.filter((r) => known.has(r.itemId))
    const byItem = groupBy(valid, (r) => r.itemId)
    const raters = [...new Set(valid.map((r) => r.rater))].sort()

    const statsOf = (entries: KeyEntry[]): EvaluationStatsDto => {
      const itemIds = [...new Set(entries.map((e) => e.itemId))]
      const rs = itemIds.flatMap((id) => byItem.get(id) ?? [])
      const intentions = rs.map((r) => r.intention).filter((v): v is number => v !== null)
      const math = rs.map((r) => r.mathCorrect).filter((v): v is boolean => v !== null)
      const adequacy = rs.map((r) => r.adequacy).filter((v): v is number => v !== null)
      return {
        items: itemIds.length,
        ratings: intentions.length,
        intentionMean: round(mean(intentions)),
        intentionMedian: median(intentions),
        approvalPct: intentions.length ? Math.round((intentions.filter((v) => v >= 4).length / intentions.length) * 100) : null,
        mathCorrectPct: math.length ? Math.round((math.filter(Boolean).length / math.length) * 100) : null,
        adequacyMean: round(mean(adequacy)),
        modelTextPct: entries.length ? Math.round((entries.filter((e) => e.source === 'llm').length / entries.length) * 100) : 0
      }
    }

    const conditions: EvaluationConditionReportDto[] = key.conditions.map((c) => {
      const entries = key.entries.filter((e) => e.condition === c.id)
      return {
        label: c.label,
        overall: statsOf(entries),
        byKind: Object.fromEntries(key.kinds.map((k) => [KIND_LABEL[k], statsOf(entries.filter((e) => e.kind === k))])),
        bySkill: Object.fromEntries(key.skills.map((s) => [s, statsOf(entries.filter((e) => e.skillCode === s))]))
      }
    })

    // Concordância: itens com "Eu usaria em sala" de TODOS os avaliadores; aprovado = nota ≥ 4.
    let agreement: EvaluationReportDto['agreement'] = null
    if (raters.length >= 2) {
      const complete = [...byItem.values()]
        .map((rs) => rs.filter((r) => r.intention !== null))
        .filter((rs) => new Set(rs.map((r) => r.rater)).size === raters.length && rs.length === raters.length)
      const counts = complete.map((rs) => {
        const approve = rs.filter((r) => (r.intention as number) >= 4).length
        return [approve, rs.length - approve]
      })
      const unanimous = counts.filter(([a, b]) => a === 0 || b === 0).length
      const kappa = fleissKappa(counts)
      agreement = {
        items: complete.length,
        percentAgreement: complete.length ? Math.round((unanimous / complete.length) * 100) : null,
        kappa: kappa === null ? null : Math.round(kappa * 100) / 100,
        label: kappaLabel(kappa)
      }
    }

    const reportPath = path.join(this.folder(code), `relatorio-${code}.html`)
    const dto: EvaluationReportDto = {
      code,
      raters,
      ratedItems: byItem.size,
      totalItems: key.items.length,
      conditions,
      agreement,
      reportPath
    }
    fs.writeFileSync(reportPath, reportHtml(key, dto, byItem), 'utf8')
    return dto
  }
}

// ---------------- auxiliares ----------------

function newCode(baseDir: string): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  for (;;) {
    const code = Array.from({ length: 5 }, () => alphabet[randomInt(0, alphabet.length)]).join('')
    if (!fs.existsSync(path.join(baseDir, code))) return code
  }
}

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()
const round = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100)

function groupBy<T>(items: readonly T[], key: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const it of items) {
    const k = key(it)
    map.set(k, [...(map.get(k) ?? []), it])
  }
  return map
}

function raterFromFile(fileName: string, code: string): string {
  const name = fileName
    .replace(/\.csv$/i, '')
    .replace(new RegExp(`^avaliacao-${code}-?`, 'i'), '')
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .trim()
  return name || 'avaliador'
}

function readme(key: EvaluationKey): string {
  return [
    `RODADA DE AVALIAÇÃO ${key.code} — Pensa Junto`,
    '',
    'Obrigado por ajudar! Você vai avaliar textos que o app mostra para crianças do 3º ano:',
    'enunciados de problemas e dicas. Alguns foram escritos por um modelo de linguagem e outros',
    'pelo próprio app. Você NÃO sabe qual é qual, de propósito: avalie cada texto como ele é.',
    '',
    `1. Abra o arquivo avaliacao-${key.code}.csv no Excel, LibreOffice ou Google Planilhas.`,
    '2. Para cada linha, preencha:',
    '   - "Eu usaria em sala (1-5)": 1 = discordo totalmente ... 5 = concordo totalmente',
    '     ("Eu usaria este texto com meus alunos do 3º ano, do jeito que está.")',
    '   - "Matemática correta (S/N)": o texto está matematicamente correto e não confunde?',
    '   - "Adequado ao 3º ano (1-5)": linguagem e dificuldade adequadas à idade.',
    '   - "Comentário": opcional, mas muito útil quando a nota for baixa.',
    '   Nas DICAS, o "Problema" é a questão que a criança está resolvendo; avalie a dica para aquele problema.',
    '   A "Resposta correta" está ali só para você conferir; a criança nunca a vê.',
    '3. Salve em CSV com o seu nome no arquivo, por exemplo:',
    `   avaliacao-${key.code}-Maria.csv`,
    '4. Devolva o arquivo para quem organizou a avaliação.',
    '',
    'Avalie sozinho(a), sem conversar com os outros avaliadores: isso é importante para medir a concordância.',
    '',
    `NÃO entregue o arquivo gabarito-${key.code}.json aos avaliadores: ele diz de onde veio cada texto.`,
    ''
  ].join('\r\n')
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const fmt = (v: number | null, suffix = '') => (v === null ? '—' : `${String(v).replace('.', ',')}${suffix}`)

function reportHtml(key: EvaluationKey, dto: EvaluationReportDto, byItem: Map<string, RatingRow[]>): string {
  const labelOf = (id: string) => key.conditions.find((c) => c.id === id)?.label ?? id
  const itemById = new Map(key.items.map((i) => [i.itemId, i]))
  const conditionsOf = (itemId: string) =>
    [...new Set(key.entries.filter((e) => e.itemId === itemId).map((e) => labelOf(e.condition)))].join(', ')

  const statRow = (label: string, s: EvaluationStatsDto) =>
    `<tr><th scope="row">${esc(label)}</th><td>${s.items}</td><td>${s.ratings}</td><td>${fmt(s.intentionMean)}</td><td>${fmt(s.intentionMedian)}</td><td><strong>${fmt(s.approvalPct, '%')}</strong></td><td>${fmt(s.mathCorrectPct, '%')}</td><td>${fmt(s.adequacyMean)}</td><td>${s.modelTextPct}%</td></tr>`
  const head =
    '<tr><th></th><th>Itens</th><th>Notas</th><th>Média</th><th>Mediana</th><th>Aprovação (≥4)</th><th>Matemática correta</th><th>Adequação</th><th>Texto do modelo</th></tr>'

  const scored = [...byItem.entries()]
    .map(([id, rs]) => {
      const vals = rs.map((r) => r.intention).filter((v): v is number => v !== null)
      return { id, rs, avg: mean(vals), spread: vals.length ? Math.max(...vals) - Math.min(...vals) : 0 }
    })
    .filter((x) => x.avg !== null)
  const itemBlock = (x: (typeof scored)[number]) => {
    const it = itemById.get(x.id) as Item
    const comments = x.rs.filter((r) => r.comment).map((r) => `<li><em>${esc(r.rater)}:</em> ${esc(r.comment)}</li>`).join('')
    return `<div class="item"><p class="meta">${esc(x.id)} · ${esc(it.skillCode)} · ${KIND_LABEL[it.kind]} · ${esc(conditionsOf(x.id))} · notas: ${x.rs
      .map((r) => r.intention ?? '—')
      .join(', ')}</p>${it.problem ? `<p class="problem">Problema: ${esc(it.problem)}</p>` : ''}<p>${esc(it.text)}</p>${comments ? `<ul>${comments}</ul>` : ''}</div>`
  }
  const lowest = [...scored].sort((a, b) => (a.avg as number) - (b.avg as number)).slice(0, 12)
  const disagreements = scored.filter((x) => x.spread >= 2).sort((a, b) => b.spread - a.spread).slice(0, 12)

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório da rodada ${esc(key.code)}</title>
<style>
body{font-family:system-ui,Segoe UI,sans-serif;color:#1E2240;background:#F6F7FB;margin:0;padding:32px;line-height:1.5}
main{max-width:1100px;margin:auto}h1{margin:0 0 4px}h2{margin-top:40px}.muted{color:#5B6180}
table{border-collapse:collapse;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(30,34,64,.08);margin:12px 0}
th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #DDE2EE;font-variant-numeric:tabular-nums}thead th{background:#EDF0F8}
.card{background:#fff;border-radius:16px;padding:16px 20px;box-shadow:0 4px 16px rgba(30,34,64,.08);margin:12px 0}
.item{background:#fff;border-radius:12px;padding:12px 16px;margin:10px 0;border-left:4px solid #4F5BD5}.meta{font-size:13px;color:#5B6180;margin:0}.problem{color:#5B6180;margin:4px 0}
@media print{body{background:#fff;padding:0}table,.card,.item{box-shadow:none}}
</style></head><body><main>
<h1>Relatório da rodada ${esc(key.code)}</h1>
<p class="muted">Gerada em ${new Date(key.createdAt).toLocaleString('pt-BR')} · app ${esc(key.appVersion)} · ${key.perSkill} questões por habilidade (${esc(key.skills.join(', '))}) · ${key.items.length} itens para avaliar</p>
<div class="card"><strong>Avaliadores:</strong> ${dto.raters.length ? esc(dto.raters.join(', ')) : 'nenhuma planilha importada ainda'} · <strong>itens com nota:</strong> ${dto.ratedItems} de ${dto.totalItems}
${dto.agreement ? `<br><strong>Concordância entre avaliadores</strong> (aprovado = nota ≥ 4, em ${dto.agreement.items} itens avaliados por todos): ${fmt(dto.agreement.percentAgreement, '%')} de acordo unânime · kappa de Fleiss ${fmt(dto.agreement.kappa)} (${esc(dto.agreement.label)})` : '<br>Com 2 ou mais avaliadores, o relatório calcula a concordância (kappa de Fleiss).'}</div>

<h2>Por condição</h2>
<p class="muted">"Texto do modelo" = em quantos % dos casos o texto mostrado veio do modelo (nos outros, a validação recusou o texto do modelo e entrou o texto do código — como aconteceria com a criança).</p>
<table><thead>${head}</thead><tbody>${dto.conditions.map((c) => statRow(c.label, c.overall)).join('')}</tbody></table>

${dto.conditions
  .map(
    (c) => `<h2>${esc(c.label)}</h2>
<table><thead>${head}</thead><tbody>${Object.entries(c.byKind)
      .map(([k, s]) => statRow(k, s))
      .join('')}${Object.entries(c.bySkill)
      .map(([k, s]) => statRow(k, s))
      .join('')}</tbody></table>`
  )
  .join('')}

<h2>Itens com as notas mais baixas</h2>
${lowest.length ? lowest.map(itemBlock).join('') : '<p class="muted">Sem notas ainda.</p>'}

<h2>Itens em que os avaliadores mais discordaram</h2>
${disagreements.length ? disagreements.map(itemBlock).join('') : '<p class="muted">Nenhuma discordância de 2 pontos ou mais.</p>'}

<p class="muted" style="margin-top:40px">Método inspirado em Monteiro et al. (AIED 2026): intenção de uso (TAM) em escala de 1 a 5, aprovação = nota ≥ 4. Recomendação do artigo: pelo menos 50 questões por habilidade e de 3 a 5 avaliadores para conclusões mais firmes.</p>
</main></body></html>`
}
