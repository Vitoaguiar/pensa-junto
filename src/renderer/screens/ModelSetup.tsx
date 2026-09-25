import {
  ArrowRight,
  CheckCircle2,
  Cpu,
  Download,
  FlaskConical,
  HardDrive,
  Info,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  Upload,
  X
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { CatalogModelDto, DownloadProgressDto, ModelsOverviewDto, ModelTestResultDto } from '@shared/types'
import { Button } from '../components/Button'
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

  const download = (key: string) =>
    run(`dl:${key}`, async () => setOverview(await call('models:download', { key })))
  const cancel = (key: string) => run(`cancel:${key}`, async () => setOverview(await call('models:cancelDownload', { key })))
  const test = (modelId: string) =>
    run(`test:${modelId}`, async () => {
      const result = await call('models:test', { modelId })
      setTests((t) => ({ ...t, [modelId]: result }))
    })
  const activate = (modelId: string) =>
    run(`use:${modelId}`, async () => {
      setOverview(await call('models:activate', { modelId }))
      setStatus(await call('app:status'))
      toast('Pronto! O app vai usar este modelo.', 'success')
    })
  const importFile = () =>
    run('import', async () => {
      const imported = await call('models:import')
      if (imported) {
        toast(`Modelo "${imported.displayName}" importado.`, 'success')
        await reload()
      }
    })
  const basicMode = () =>
    run('basic', async () => {
      setOverview(await call('models:useBasicMode'))
      setStatus(await call('app:status'))
    })

  const ramGb = overview ? Math.round(overview.totalRamBytes / 1024 ** 3) : null
  const importProgress = progress.import
  const importing = busy === 'import' && importProgress && importProgress.phase !== 'done'

  return (
    <>
      <PageTitle
        title="Escolha o cérebro do app"
        subtitle="O modelo é baixado uma única vez. Depois disso, tudo funciona sem internet."
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
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
        {overview && !overview.activeModelId && (
          <Chip className="bg-hint-soft text-hint-ink">
            <Info aria-hidden className="h-4 w-4" /> Sem modelo, o app funciona em modo básico, com textos prontos.
          </Chip>
        )}
      </div>

      <div className="grid gap-5 pt-4 lg:grid-cols-3">
        {overview?.catalog.map((m) => (
          <ModelCard
            key={m.key}
            model={m}
            progress={progress[m.key] && m.state === 'downloading' ? progress[m.key]! : m.progress}
            test={m.modelId ? tests[m.modelId] : undefined}
            busy={busy}
            onDownload={() => download(m.key)}
            onCancel={() => cancel(m.key)}
            onTest={() => m.modelId && test(m.modelId)}
            onActivate={() => m.modelId && activate(m.modelId)}
          />
        ))}
      </div>

      {overview && overview.imported.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-[22px] font-semibold text-ink">Modelos importados</h2>
          <div className="flex flex-col gap-3">
            {overview.imported.map((m) => (
              <Card key={m.modelId} className="flex flex-wrap items-center gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[18px] font-semibold text-ink">{m.displayName}</p>
                  <p className="text-support text-ink-muted">{m.sizeBytes ? formatBytes(m.sizeBytes) : ''}</p>
                  {tests[m.modelId] && <TestResult result={tests[m.modelId]!} />}
                </div>
                {m.active ? (
                  <Chip className="bg-success-soft text-success-strong">
                    <CheckCircle2 aria-hidden className="h-4 w-4" /> Em uso
                  </Chip>
                ) : null}
                <Button variant="secondary" loading={busy === `test:${m.modelId}`} onClick={() => test(m.modelId)} icon={<FlaskConical aria-hidden className="h-5 w-5" />}>
                  Testar
                </Button>
                {!m.active && (
                  <Button loading={busy === `use:${m.modelId}`} onClick={() => activate(m.modelId)}>
                    Usar este
                  </Button>
                )}
              </Card>
            ))}
          </div>
        </section>
      )}

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
              {importProgress.phase === 'verifying' ? 'Conferindo o arquivo…' : `Copiando… ${Math.round((importProgress.downloadedBytes / importProgress.totalBytes) * 100)}%`}
            </p>
          )}
        </div>
        <Button variant="secondary" loading={busy === 'import'} onClick={importFile} icon={<Upload aria-hidden className="h-5 w-5" />}>
          Importar arquivo .gguf
        </Button>
      </Card>

      {overview?.activeModelId && (
        <div className="mt-6 text-right">
          <Button variant="ghost" loading={busy === 'basic'} onClick={basicMode}>
            Usar o modo básico (sem modelo)
          </Button>
        </div>
      )}
    </>
  )
}

interface ModelCardProps {
  model: CatalogModelDto
  progress: DownloadProgressDto | null
  test?: ModelTestResultDto
  busy: string | null
  onDownload: () => void
  onCancel: () => void
  onTest: () => void
  onActivate: () => void
}

function ModelCard({ model: m, progress, test, busy, onDownload, onCancel, onTest, onActivate }: ModelCardProps) {
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
          <>
            {test && <TestResult result={test} />}
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" loading={busy === `test:${m.modelId}`} onClick={onTest} icon={<FlaskConical aria-hidden className="h-5 w-5" />}>
                Testar
              </Button>
              {!m.active && (
                <Button className="flex-1" loading={busy === `use:${m.modelId}`} onClick={onActivate}>
                  Usar este
                </Button>
              )}
            </div>
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
