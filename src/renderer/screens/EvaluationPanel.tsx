import { BarChart3, FileSpreadsheet, FolderOpen, Play, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type {
  EvaluationProgressDto,
  EvaluationReportDto,
  EvaluationSetDto,
  EvaluationStatsDto,
  InstalledModelDto
} from '@shared/types'
import { Button } from '../components/Button'
import { Card, Chip } from '../components/Card'
import { EmptyState } from '../components/Feedback'
import { call, errorMessage, onEvent } from '../lib/api'
import { useApp } from '../store/app'

const SKILLS = [
  { code: 'EF03MA06', label: 'Adição e subtração (problemas)', contextual: true },
  { code: 'EF03MA07', label: 'Multiplicação (problemas)', contextual: true },
  { code: 'EF03MA08', label: 'Divisão (problemas)', contextual: true },
  { code: 'EF03MA03', label: 'Fatos básicos (contas diretas)', contextual: false },
  { code: 'EF03MA05', label: 'Cálculo até 999 (contas diretas)', contextual: false }
]

const pct = (v: number | null) => (v === null ? '—' : `${v}%`)
const num = (v: number | null) => (v === null ? '—' : v.toLocaleString('pt-BR'))

function Checkbox(props: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-input px-3 py-2 hover:bg-surface-2 ${props.disabled ? 'opacity-50' : ''}`}>
      <input
        type="checkbox"
        className="mt-1 h-5 w-5 accent-[var(--primary)]"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span>
        <span className="block text-body text-ink">{props.label}</span>
        {props.hint && <span className="block text-support text-ink-muted">{props.hint}</span>}
      </span>
    </label>
  )
}

export function EvaluationPanel() {
  const toast = useApp((s) => s.toast)
  const [models, setModels] = useState<InstalledModelDto[]>([])
  const [sets, setSets] = useState<EvaluationSetDto[] | null>(null)
  const [includeCode, setIncludeCode] = useState(true)
  const [modelIds, setModelIds] = useState<string[]>([])
  const [kinds, setKinds] = useState<Array<'statement' | 'hint'>>(['statement', 'hint'])
  const [skills, setSkills] = useState<string[]>(['EF03MA06', 'EF03MA07', 'EF03MA08'])
  const [perSkill, setPerSkill] = useState(10)
  const [progress, setProgress] = useState<EvaluationProgressDto | null>(null)
  const [generating, setGenerating] = useState(false)
  const [reports, setReports] = useState<Record<string, EvaluationReportDto>>({})

  const reload = useCallback(async () => {
    try {
      const [overview, list] = await Promise.all([call('models:list'), call('evaluation:list')])
      setModels(overview.installed)
      setSets(list)
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }, [toast])

  useEffect(() => {
    void reload()
    return onEvent('evaluation:onProgress', setProgress)
  }, [reload])

  // Por padrão, compara todos os modelos instalados.
  useEffect(() => {
    setModelIds((ids) => (ids.length ? ids : models.map((m) => m.modelId)))
  }, [models])

  const toggle = <T,>(list: T[], item: T, on: boolean) => (on ? [...new Set([...list, item])] : list.filter((x) => x !== item))
  const conditions = (includeCode ? 1 : 0) + modelIds.length
  const questions = skills.length * perSkill
  const generations = modelIds.length * questions * kinds.length
  const maxItems = conditions * questions * kinds.length

  async function create() {
    setGenerating(true)
    setProgress(null)
    try {
      const set = await call('evaluation:create', { includeCode, modelIds, kinds, skills, perSkill })
      toast(`Rodada ${set.code} pronta, com ${set.items} itens para avaliar.`, 'success')
      await reload()
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setGenerating(false)
      setProgress(null)
    }
  }

  async function importRatings(code: string) {
    try {
      const result = await call('evaluation:importRatings', { code })
      if (!result) return
      for (const e of result.errors) toast(`${e.file}: ${e.message}`, 'error')
      if (result.imported.length) {
        toast(`Importado: ${result.imported.map((i) => `${i.rater} (${i.rated} notas)`).join(', ')}`, 'success')
        await showReport(code)
        await reload()
      }
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  async function showReport(code: string) {
    try {
      const report = await call('evaluation:report', { code })
      setReports((r) => ({ ...r, [code]: report }))
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  const canCreate = conditions > 0 && kinds.length > 0 && skills.length > 0 && perSkill >= 1 && !generating

  return (
    <div className="flex flex-col gap-8">
      <Card className="bg-primary-soft">
        <h2 className="text-[22px] font-bold text-ink">Avaliação dos textos por professores</h2>
        <p className="mt-1 text-body text-ink">
          Professores dão nota, <strong>às cegas</strong>, aos enunciados e dicas que o app mostra às crianças. Todas as condições reescrevem
          as mesmas questões, e o resultado mostra qual modelo (ou o texto do próprio app) os professores usariam em sala.
        </p>
        <ol className="mt-3 grid gap-2 text-support text-ink md:grid-cols-3">
          <li>
            <strong>1. Gere uma rodada</strong> aqui.
          </li>
          <li>
            <strong>2. Envie a pasta</strong> (planilha + LEIA-ME) para os avaliadores. Não envie o gabarito.
          </li>
          <li>
            <strong>3. Importe as planilhas</strong> preenchidas e veja o resultado.
          </li>
        </ol>
      </Card>

      <section aria-labelledby="new-round">
        <h2 id="new-round" className="mb-3 text-[22px] font-bold text-ink">
          Nova rodada
        </h2>
        <Card className="grid gap-6 lg:grid-cols-3">
          <fieldset>
            <legend className="mb-2 text-support font-semibold text-ink">O que comparar</legend>
            <Checkbox checked={includeCode} onChange={setIncludeCode} label="Textos do código (sem modelo)" hint="Linha de base: o que o modo básico mostra." />
            {models.map((m) => (
              <Checkbox
                key={m.modelId}
                checked={modelIds.includes(m.modelId)}
                onChange={(on) => setModelIds((ids) => toggle(ids, m.modelId, on))}
                label={m.friendlyName ? `${m.friendlyName} (${m.displayName})` : m.displayName}
              />
            ))}
            {models.length === 0 && <p className="px-3 text-support text-ink-muted">Nenhum modelo instalado: só dá para avaliar os textos do código.</p>}
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-support font-semibold text-ink">Tipos de texto</legend>
            <Checkbox checked={kinds.includes('statement')} onChange={(on) => setKinds((k) => toggle(k, 'statement', on))} label="Enunciados" />
            <Checkbox
              checked={kinds.includes('hint')}
              onChange={(on) => setKinds((k) => toggle(k, 'hint', on))}
              label="Dicas"
              hint="Níveis 1, 2 e 3 alternados."
            />
            <label className="mt-4 block px-3">
              <span className="block text-support font-semibold text-ink">Questões por habilidade</span>
              <input
                type="number"
                min={1}
                max={100}
                value={perSkill}
                onChange={(e) => setPerSkill(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                className="num mt-1 min-h-target w-28 rounded-input border-2 border-transparent bg-surface-2 px-4 text-body focus:border-primary"
              />
              <span className="mt-1 block text-support text-ink-muted">Para conclusões firmes, o artigo de referência recomenda 50.</span>
            </label>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-support font-semibold text-ink">Habilidades (BNCC)</legend>
            {SKILLS.map((s) => (
              <Checkbox
                key={s.code}
                checked={skills.includes(s.code)}
                onChange={(on) => setSkills((list) => toggle(list, s.code, on))}
                label={`${s.code} · ${s.label}`}
                hint={s.contextual ? undefined : 'O modelo não reescreve contas diretas; só as dicas mudam.'}
              />
            ))}
          </fieldset>

          <div className="flex flex-wrap items-center gap-4 border-t border-border pt-5 lg:col-span-3">
            <p className="num flex-1 text-support text-ink-muted">
              Até <strong className="text-ink">{maxItems}</strong> itens para cada avaliador (textos iguais entre condições viram um item só) ·{' '}
              {generations} gerações com modelo
            </p>
            {generating ? (
              <Button variant="secondary" onClick={() => void call('evaluation:cancel')} icon={<X aria-hidden className="h-5 w-5" />}>
                Cancelar
              </Button>
            ) : null}
            <Button onClick={create} disabled={!canCreate} loading={generating} icon={<Play aria-hidden className="h-5 w-5" />}>
              Gerar rodada
            </Button>
          </div>
          {generating && progress && (
            <div className="lg:col-span-3" role="status" aria-live="polite">
              <div
                className="h-3 overflow-hidden rounded-pill bg-surface-2"
                role="progressbar"
                aria-valuenow={progress.done}
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-label="Progresso da geração"
              >
                <div className="h-full rounded-pill bg-accent transition-[width] duration-200" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
              </div>
              <p className="num mt-2 text-support text-ink-muted">
                {progress.done} de {progress.total} · {progress.label}
              </p>
            </div>
          )}
        </Card>
      </section>

      <section aria-labelledby="rounds">
        <h2 id="rounds" className="mb-3 text-[22px] font-bold text-ink">
          Rodadas
        </h2>
        {sets && sets.length === 0 && <EmptyState title="Nenhuma rodada ainda. Gere a primeira acima." />}
        <div className="flex flex-col gap-4">
          {sets?.map((set) => (
            <Card key={set.code} className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-accent-soft text-accent-ink">
                  <FileSpreadsheet aria-hidden className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[20px] font-semibold text-ink">
                    Rodada <span className="num">{set.code}</span>
                  </p>
                  <p className="text-support text-ink-muted">
                    {new Date(set.createdAt).toLocaleString('pt-BR')} · {set.items} itens · {set.skills.join(', ')} ·{' '}
                    {set.raters === 0 ? 'nenhuma avaliação importada' : `${set.raters} ${set.raters === 1 ? 'avaliador' : 'avaliadores'}`}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {set.conditions.map((c) => (
                      <Chip key={c}>{c}</Chip>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-3">
                <Button variant="secondary" onClick={() => void call('evaluation:openFolder', { code: set.code })} icon={<FolderOpen aria-hidden className="h-5 w-5" />}>
                  Abrir pasta
                </Button>
                <Button variant="secondary" onClick={() => importRatings(set.code)} icon={<Upload aria-hidden className="h-5 w-5" />}>
                  Importar avaliações
                </Button>
                <Button onClick={() => showReport(set.code)} disabled={set.raters === 0} icon={<BarChart3 aria-hidden className="h-5 w-5" />}>
                  Resultado
                </Button>
              </div>
              {reports[set.code] && <ReportSummary report={reports[set.code]!} />}
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}

function ReportSummary({ report }: { report: EvaluationReportDto }) {
  const row = (label: string, s: EvaluationStatsDto, strong = false) => (
    <tr key={label} className="border-b border-border last:border-0">
      <th scope="row" className={`px-4 py-2 text-left ${strong ? 'font-semibold text-ink' : 'font-normal text-ink-muted'}`}>
        {label}
      </th>
      <td className="px-4 py-2">{s.items}</td>
      <td className="px-4 py-2">{num(s.intentionMean)}</td>
      <td className="px-4 py-2 font-semibold">{pct(s.approvalPct)}</td>
      <td className="px-4 py-2">{pct(s.mathCorrectPct)}</td>
      <td className="px-4 py-2">{num(s.adequacyMean)}</td>
      <td className="px-4 py-2">{s.modelTextPct}%</td>
    </tr>
  )
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <p className="text-support text-ink">
        <strong>{report.raters.length}</strong> {report.raters.length === 1 ? 'avaliador' : 'avaliadores'} ({report.raters.join(', ')}) ·{' '}
        {report.ratedItems} de {report.totalItems} itens com nota
        {report.agreement && (
          <>
            {' '}
            · concordância: <strong>{pct(report.agreement.percentAgreement)}</strong> unânime, kappa{' '}
            <strong>{num(report.agreement.kappa)}</strong> ({report.agreement.label})
          </>
        )}
      </p>
      <div className="overflow-x-auto rounded-input border border-border">
        <table className="num w-full text-body">
          <thead className="bg-surface-2 text-support text-ink-muted">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">Condição</th>
              <th className="px-4 py-2 text-left font-semibold">Itens</th>
              <th className="px-4 py-2 text-left font-semibold">Nota média</th>
              <th className="px-4 py-2 text-left font-semibold">Aprovação (≥4)</th>
              <th className="px-4 py-2 text-left font-semibold">Matemática correta</th>
              <th className="px-4 py-2 text-left font-semibold">Adequação</th>
              <th className="px-4 py-2 text-left font-semibold">Texto do modelo</th>
            </tr>
          </thead>
          <tbody>
            {report.conditions.map((c) => [
              row(c.label, c.overall, true),
              ...Object.entries(c.byKind).map(([k, s]) => row(`  ${k}`, s))
            ])}
          </tbody>
        </table>
      </div>
      <div>
        <Button variant="secondary" onClick={() => void call('evaluation:openReport', { code: report.code })} icon={<BarChart3 aria-hidden className="h-5 w-5" />}>
          Abrir relatório completo
        </Button>
      </div>
    </div>
  )
}
