import {
  ArrowRight,
  Check,
  CheckCircle2,
  Cpu,
  Download,
  FlaskConical,
  HardDrive,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  TriangleAlert,
  Upload,
  X
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type {
  CatalogModelDto,
  DownloadProgressDto,
  FoundModelDto,
  InstalledModelDto,
  ModelsOverviewDto,
  ModelTestResultDto
} from '@shared/types'
import { Button, IconButton } from '../components/Button'
import { Modal } from '../components/Feedback'
import { Card, Chip } from '../components/Card'
import { AdultPage, PageTitle, Stepper, TeacherGate } from '../components/Layout'
import { call, errorMessage, onEvent } from '../lib/api'
import { formatBytes, formatSpeed } from '../lib/format'
import { useApp } from '../store/app'

export function ModelSetupScreen() {
  const [params] = useSearchParams()
  const onboarding = params.get('onboarding') === '1'
  const navigate = useNavigate()
  return (
    <TeacherGate onCancel={onboarding ? undefined : () => navigate('/pin')}>
      <AdultPage
        wide
        actions={
          onboarding ? (
            <Button onClick={() => navigate('/alunos-iniciais')} iconRight={<ArrowRight aria-hidden className="h-5 w-5" />}>
              Continuar
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => navigate('/professor')}>
              Voltar
            </Button>
          )
        }
      >
        {onboarding && <Stepper current={1} />}
        <ModelSetupPanel />
      </AdultPage>
    </TeacherGate>
  )
}

export function ModelSetupPanel() {
  const toast = useApp((s) => s.toast)
  const setStatus = useApp((s) => s.setStatus)
  const [overview, setOverview] = useState<ModelsOverviewDto | null>(null)
  const [progress, setProgress] = useState<Record<string, DownloadProgressDto>>({})
  const [tests, setTests] = useState<Record<string, ModelTestResultDto>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [removing, setRemoving] = useState<InstalledModelDto | null>(null)

  const reload = useCallback(async () => {
    try {
      setOverview(await call('models:list'))
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }, [toast])

  useEffect(() => {
    void reload()
    return onEvent('models:onProgress', (p) => {
      setProgress((prev) => ({ ...prev, [p.key]: p }))
      if (p.phase === 'done' || p.phase === 'error' || p.phase === 'cancelled') void reload()
    })
  }, [reload])

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key)
    try {
      await action()
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(null)
    }
  }

  const refreshStatus = async () => setStatus(await call('app:status'))
  const download = (key: string) => run(`dl:${key}`, async () => setOverview(await call('models:download', { key })))
  const cancel = (key: string) => run(`cancel:${key}`, async () => setOverview(await call('models:cancelDownload', { key })))
  const test = (modelId: string) =>
    run(`test:${modelId}`, async () => {
      const result = await call('models:test', { modelId })
      setTests((t) => ({ ...t, [modelId]: result }))
    })
  const activate = (m: InstalledModelDto) =>
    run(`use:${m.modelId}`, async () => {
      setOverview(await call('models:activate', { modelId: m.modelId }))
      await refreshStatus()
      toast(`Pronto! O app vai usar o modelo ${m.friendlyName ?? m.displayName}.`, 'success')
    })
  const basicMode = () =>
    run('basic', async () => {
      setOverview(await call('models:useBasicMode'))
      await refreshStatus()
      toast('O app vai usar só os textos prontos (modo básico).', 'success')
    })
  const adopt = (key: string) =>
    run(`adopt:${key}`, async () => {
      setOverview(await call('models:adopt', { key }))
      toast('Arquivo conferido e adicionado. Agora é só escolher o modelo.', 'success')
    })
  const remove = (m: InstalledModelDto) =>
    run(`remove:${m.modelId}`, async () => {
      const result = await call('models:remove', { modelId: m.modelId })
      setOverview(result.overview)
      setTests((t) => {
        const next = { ...t }
        delete next[m.modelId]
        return next
      })
      await refreshStatus()
      toast(
        result.keptFile ? 'Modelo removido do app. O arquivo continua na pasta onde estava.' : 'Modelo removido e espaço liberado.',
        'success'
      )
      setRemoving(null)
    })
  const importFile = () =>
    run('import', async () => {
      const imported = await call('models:import')
      if (imported) {
        toast(`Modelo "${imported.displayName}" importado. Escolha-o em "Modelos neste computador".`, 'success')
        await reload()
      }
    })

  const ramGb = overview ? Math.round(overview.totalRamBytes / 1024 ** 3) : null
  const importProgress = progress.import
  const importing = busy === 'import' && importProgress && importProgress.phase !== 'done'
  const locked = busy !== null && (busy.startsWith('use:') || busy === 'basic' || busy.startsWith('remove:'))

  return (
    <>
      <PageTitle
        title="Escolha o cérebro do app"
        subtitle="O modelo é baixado uma única vez. Depois disso, tudo funciona sem internet."
      />

      <div className="mb-8 flex flex-wrap items-center gap-3">
        {ramGb !== null && (
          <Chip>
            <Cpu aria-hidden className="h-4 w-4" /> Este computador tem <strong className="num text-ink">{ramGb} GB</strong> de memória
          </Chip>
        )}
        {overview?.freeDiskBytes != null && (
          <Chip>
            <HardDrive aria-hidden className="h-4 w-4" /> <span className="num">{formatBytes(overview.freeDiskBytes)}</span> livres no disco
          </Chip>
        )}
      </div>

      {/* ---------- Modelos já no computador: escolher, testar, remover ---------- */}
      <section aria-labelledby="installed-title" className="mb-12">
        <h2 id="installed-title" className="text-[24px] font-bold text-ink">
          Modelos neste computador
        </h2>
        <p className="mb-4 text-support text-ink-muted">Escolha qual o app usa. Dá para trocar quando quiser.</p>

        {overview && (
          <div role="radiogroup" aria-labelledby="installed-title" className="flex flex-col gap-3">
            {overview.installed.map((m) => (
              <InstalledRow
                key={m.modelId}
                model={m}
                test={tests[m.modelId]}
                busy={busy}
                disabled={locked}
                onUse={() => activate(m)}
                onTest={() => test(m.modelId)}
                onRemove={() => setRemoving(m)}
              />
            ))}
            {overview.found.map((f) => (
              <FoundRow key={f.key} found={f} progress={progress[f.key]} busy={busy} onAdopt={() => adopt(f.key)} />
            ))}
            {overview.installed.length === 0 && overview.found.length === 0 && (
              <p className="rounded-card border-2 border-dashed border-border px-6 py-5 text-support text-ink-muted">
                Nenhum modelo neste computador ainda. Baixe um abaixo ou importe um arquivo .gguf.
              </p>
            )}
            <BasicModeRow active={!overview.activeModelId} busy={busy === 'basic'} disabled={locked} onSelect={basicMode} />
          </div>
        )}
      </section>

      {/* ---------- Catálogo: baixar ---------- */}
      <section aria-labelledby="catalog-title">
        <h2 id="catalog-title" className="text-[24px] font-bold text-ink">
          Baixar modelos
        </h2>
        <p className="mb-4 text-support text-ink-muted">Os modelos que já estão no computador aparecem marcados.</p>
        <div className="grid gap-5 pt-4 lg:grid-cols-3">
          {overview?.catalog.map((m) => (
            <ModelCard
              key={m.key}
              model={m}
              progress={progress[m.key] && (m.state === 'downloading' || m.state === 'found') ? progress[m.key]! : m.progress}
              busy={busy}
              onDownload={() => download(m.key)}
              onCancel={() => cancel(m.key)}
              onAdopt={() => adopt(m.key)}
            />
          ))}
        </div>
      </section>

      <Card className="mt-8 flex flex-wrap items-center gap-5">
        <span className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-accent-soft text-accent-ink">
          <Upload aria-hidden className="h-6 w-6" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[20px] font-semibold text-ink">Escola sem internet?</h2>
          <p className="text-support text-ink-muted">
            Baixe o modelo em outro computador, traga o arquivo <strong>.gguf</strong> num pendrive e importe aqui.
          </p>
          {importing && importProgress && (
            <p className="num mt-1 text-support text-ink-muted" role="status">
              {importProgress.phase === 'verifying'
                ? 'Conferindo o arquivo…'
                : `Copiando… ${Math.round((importProgress.downloadedBytes / importProgress.totalBytes) * 100)}%`}
            </p>
          )}
        </div>
        <Button variant="secondary" loading={busy === 'import'} onClick={importFile} icon={<Upload aria-hidden className="h-5 w-5" />}>
          Importar arquivo .gguf
        </Button>
      </Card>

      <RemoveModelModal model={removing} busy={!!removing && busy === `remove:${removing.modelId}`} onCancel={() => setRemoving(null)} onConfirm={remove} />
    </>
  )
}

/** Marcador de rádio (círculo), para deixar claro que só um modelo fica em uso. */
function RadioMark({ checked, loading }: { checked: boolean; loading?: boolean }) {
  return (
    <span
      aria-hidden
      className={[
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[3px] transition-colors',
        checked ? 'border-success bg-success text-ink' : 'border-border bg-surface'
      ].join(' ')}
    >
      {loading ? <LoaderCircle className="h-4 w-4 animate-spin text-ink-muted" /> : checked ? <Check className="h-4 w-4" strokeWidth={3} /> : null}
    </span>
  )
}

function InstalledRow(props: {
  model: InstalledModelDto
  test?: ModelTestResultDto
  busy: string | null
  disabled: boolean
  onUse: () => void
  onTest: () => void
  onRemove: () => void
}) {
  const { model: m, busy } = props
  const using = busy === `use:${m.modelId}`
  const name = m.friendlyName ?? m.displayName
  return (
    <Card className={`flex flex-col gap-3 border-2 py-4 ${m.active ? 'border-success' : 'border-transparent'}`}>
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          role="radio"
          aria-checked={m.active}
          aria-label={`Usar ${name}`}
          disabled={m.active || props.disabled}
          onClick={props.onUse}
          className="flex min-w-0 flex-1 items-center gap-4 rounded-input text-left disabled:cursor-default"
        >
          <RadioMark checked={m.active} loading={using} />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[20px] font-semibold text-ink">{name}</span>
              {m.active && <Chip className="bg-success-soft text-success-strong">Em uso</Chip>}
            </span>
            <span className="block truncate text-support text-ink-muted" title={m.filePath}>
              {m.friendlyName ? `${m.displayName} · ` : ''}
              {m.sizeBytes ? formatBytes(m.sizeBytes) : ''}
              {m.location === 'external' ? ` · arquivo em ${shortDir(m.filePath)}` : ''}
            </span>
          </span>
        </button>
        {!m.active && (
          <Button onClick={props.onUse} loading={using} disabled={props.disabled}>
            Usar este
          </Button>
        )}
        <Button
          variant="secondary"
          loading={busy === `test:${m.modelId}`}
          disabled={props.disabled}
          onClick={props.onTest}
          icon={<FlaskConical aria-hidden className="h-5 w-5" />}
        >
          Testar
        </Button>
        <IconButton label={`Remover ${name}`} onClick={props.onRemove} disabled={props.disabled}>
          <Trash2 aria-hidden className="h-5 w-5" />
        </IconButton>
      </div>
      {props.test && <TestResult result={props.test} />}
    </Card>
  )
}

function FoundRow(props: { found: FoundModelDto; progress?: DownloadProgressDto; busy: string | null; onAdopt: () => void }) {
  const { found: f } = props
  const checking = props.busy === `adopt:${f.key}`
  return (
    <Card className="flex flex-wrap items-center gap-4 border-2 border-[#FFB54766] bg-hint-soft py-4">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-hint text-ink">
        <Search aria-hidden className="h-4 w-4" strokeWidth={2.5} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[20px] font-semibold text-ink">
          {f.friendlyName} <span className="text-support font-normal text-hint-ink">· encontrado neste computador</span>
        </p>
        <p className="truncate text-support text-hint-ink" title={f.filePath}>
          {f.displayName} · {formatBytes(f.sizeBytes)} · {f.location === 'app' ? 'na pasta do app' : `em ${shortDir(f.filePath)}`}
        </p>
        {checking && (
          <p className="mt-1 text-support font-medium text-hint-ink" role="status">
            Conferindo se o arquivo está inteiro… (pode levar alguns segundos)
          </p>
        )}
      </div>
      <Button onClick={props.onAdopt} loading={checking} icon={<ShieldCheck aria-hidden className="h-5 w-5" />}>
        Conferir e adicionar
      </Button>
    </Card>
  )
}

function BasicModeRow(props: { active: boolean; busy: boolean; disabled: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={props.active}
      disabled={props.active || props.disabled}
      onClick={props.onSelect}
      className={[
        'flex items-center gap-4 rounded-card border-2 px-6 py-4 text-left transition-colors',
        props.active ? 'border-success bg-surface' : 'border-dashed border-border hover:border-primary'
      ].join(' ')}
    >
      <RadioMark checked={props.active} loading={props.busy} />
      <span>
        <span className="flex items-center gap-2 text-[18px] font-semibold text-ink">
          Nenhum: modo básico {props.active && <Chip className="bg-success-soft text-success-strong">Em uso</Chip>}
        </span>
        <span className="block text-support text-ink-muted">Só os textos prontos: mais rápido e sempre correto, mas menos variado.</span>
      </span>
    </button>
  )
}

function RemoveModelModal(props: {
  model: InstalledModelDto | null
  busy: boolean
  onCancel: () => void
  onConfirm: (m: InstalledModelDto) => void
}) {
  const m = props.model
  return (
    <Modal
      open={!!m}
      title="Remover modelo?"
      onClose={props.onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={props.onCancel}>
            Cancelar
          </Button>
          <Button variant="danger" loading={props.busy} onClick={() => m && props.onConfirm(m)} icon={<Trash2 aria-hidden className="h-5 w-5" />}>
            Remover
          </Button>
        </>
      }
    >
      {m && (
        <div className="flex flex-col gap-3 text-body text-ink">
          <p>
            <strong>{m.friendlyName ?? m.displayName}</strong> ({m.displayName})
          </p>
          {m.location === 'app' ? (
            <p>
              O arquivo de <span className="num">{m.sizeBytes ? formatBytes(m.sizeBytes) : ''}</span> será apagado deste computador. Você pode
              baixar de novo quando quiser.
            </p>
          ) : (
            <p>
              O app vai deixar de usar este modelo, mas o arquivo <strong>não</strong> será apagado: ele continua em{' '}
              <span className="break-all">{m.filePath}</span>.
            </p>
          )}
          {m.active && (
            <p className="rounded-input bg-hint-soft px-4 py-3 text-hint-ink">
              Este é o modelo em uso. Sem ele, o app passa a usar o modo básico até você escolher outro.
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}

/** "C:\Users\...\Downloads" → "Downloads" (a pasta onde o arquivo está). */
function shortDir(filePath: string): string {
  const parts = filePath.split(/[\\/]/)
  return parts.length >= 2 ? (parts[parts.length - 2] as string) : filePath
}

interface ModelCardProps {
  model: CatalogModelDto
  progress: DownloadProgressDto | null
  busy: string | null
  onDownload: () => void
  onCancel: () => void
  onAdopt: () => void
}

function ModelCard({ model: m, progress, busy, onDownload, onCancel, onAdopt }: ModelCardProps) {
  const pct = progress && progress.totalBytes ? Math.min(100, Math.round((progress.downloadedBytes / progress.totalBytes) * 100)) : 0
  return (
    <Card
      className={`relative flex flex-col gap-4 border-2 ${m.active ? 'border-success' : m.recommended ? 'border-primary' : 'border-transparent'}`}
      aria-label={m.friendlyName}
    >
      {/* Selos presos na borda do card, para os três cards ficarem alinhados. */}
      {(m.recommended || m.active) && (
        <div className="absolute -top-4 left-5 flex gap-2">
          {m.recommended && (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill bg-primary px-3 py-1 text-[15px] font-semibold text-white">
              <Sparkles aria-hidden className="h-4 w-4" /> {m.active ? 'Recomendado' : 'Recomendado para este computador'}
            </span>
          )}
          {m.active && (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill bg-success px-3 py-1 text-[15px] font-semibold text-ink">
              <CheckCircle2 aria-hidden className="h-4 w-4" /> Em uso
            </span>
          )}
        </div>
      )}
      <div>
        <h2 className="text-[24px] font-bold text-ink">{m.friendlyName}</h2>
        <p className="text-support text-ink-muted">{m.displayName}</p>
      </div>
      <p className="text-body text-ink">{m.description}</p>
      <dl className="num grid grid-cols-2 gap-2 text-support">
        <div className="rounded-input bg-surface-2 px-3 py-2">
          <dt className="text-ink-muted">Tamanho</dt>
          <dd className="font-semibold text-ink">{formatBytes(m.sizeBytes)}</dd>
        </div>
        <div className="rounded-input bg-surface-2 px-3 py-2">
          <dt className="text-ink-muted">Memória mínima</dt>
          <dd className="font-semibold text-ink">{m.minRamGb} GB</dd>
        </div>
      </dl>
      {!m.fitsRam && (
        <p className="flex items-start gap-2 text-support text-hint-ink">
          <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" /> Este computador tem menos memória que o recomendado.
        </p>
      )}

      <div className="mt-auto flex flex-col gap-3">
        {m.state === 'downloading' && (
          <div role="status" aria-live="polite" className="flex flex-col gap-2">
            <div className="h-3 overflow-hidden rounded-pill bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso do download">
              <div className="h-full rounded-pill bg-accent transition-[width] duration-200 ease-brand" style={{ width: `${pct}%` }} />
            </div>
            <div className="num flex justify-between text-support text-ink-muted">
              <span>{progress?.phase === 'verifying' ? 'Conferindo o arquivo…' : `${pct}%`}</span>
              <span>{progress && progress.phase === 'downloading' && progress.bytesPerSecond > 0 ? formatSpeed(progress.bytesPerSecond) : ''}</span>
            </div>
            <Button variant="secondary" onClick={onCancel} loading={busy === `cancel:${m.key}`} icon={<X aria-hidden className="h-5 w-5" />}>
              Cancelar
            </Button>
          </div>
        )}
        {m.state === 'not_downloaded' && (
          <Button onClick={onDownload} loading={busy === `dl:${m.key}`} icon={<Download aria-hidden className="h-5 w-5" />}>
            {m.resumable ? 'Continuar download' : 'Baixar'}
          </Button>
        )}
        {m.state === 'error' && (
          <>
            <p className="text-support font-medium text-danger" role="alert">
              {m.error}
            </p>
            <Button variant="secondary" onClick={onDownload} loading={busy === `dl:${m.key}`} icon={<RefreshCw aria-hidden className="h-5 w-5" />}>
              Tentar de novo
            </Button>
          </>
        )}
        {m.state === 'ready' && (
          <p className="flex items-center gap-2 rounded-input bg-success-soft px-4 py-3 text-support font-medium text-success-strong">
            <CheckCircle2 aria-hidden className="h-5 w-5 shrink-0" /> Já está neste computador. Escolha em “Modelos neste computador”.
          </p>
        )}
        {m.state === 'found' && (
          <>
            <p className="rounded-input bg-hint-soft px-4 py-3 text-support text-hint-ink">
              Encontramos este arquivo no computador. Conferimos se ele está inteiro antes de usar, sem baixar de novo.
            </p>
            <Button onClick={onAdopt} loading={busy === `adopt:${m.key}`} icon={<ShieldCheck aria-hidden className="h-5 w-5" />}>
              Conferir e adicionar
            </Button>
          </>
        )}
      </div>
    </Card>
  )
}

function TestResult({ result }: { result: ModelTestResultDto }) {
  const seconds = result.seconds.toLocaleString('pt-BR')
  return (
    <div className={`rounded-input px-4 py-3 text-support ${result.ok && !result.slow ? 'bg-success-soft' : 'bg-hint-soft'}`} role="status">
      {result.ok ? (
        <>
          <p className="font-semibold text-ink">
            Levou <span className="num">{seconds}s</span>. Exemplo:
          </p>
          <p className="mt-1 text-ink">“{result.statement}”</p>
          {result.slow && (
            <p className="mt-2 font-medium text-hint-ink">
              Demorou mais de 20 segundos: o computador pode ficar lento. Experimente um modelo menor.
            </p>
          )}
        </>
      ) : (
        <p className="font-medium text-hint-ink">{result.error ?? 'Não deu certo.'}</p>
      )}
    </div>
  )
}
