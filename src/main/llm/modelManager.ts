import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { generateQuestion } from '@core/generator'
import { buildStatementPrompt } from '@core/prompts'
import { runTutor } from '@core/tutor'
import { statementPrefixProblem, validateStatement } from '@core/validation'
import type {
  CatalogModelDto,
  DownloadProgressDto,
  ModelsOverviewDto,
  ModelTestResultDto
} from '@shared/types'
import type { Repositories } from '../db/repositories'
import type { LlmModelRow } from '../db/schema'
import type { LlmService } from './llmService'
import { findCatalogModel, MODEL_CATALOG, recommendModel, type CatalogModel } from './modelCatalog'

type Downloader = Awaited<ReturnType<(typeof import('node-llama-cpp'))['createModelDownloader']>>

const SLOW_TEST_SECONDS = 20
const DISK_MARGIN_BYTES = 300 * 1024 ** 2

export class FriendlyError extends Error {}

/** Download (retomável), importação, verificação, teste e ativação de modelos. */
export class ModelManager {
  private downloads = new Map<string, Downloader>()
  private progress = new Map<string, DownloadProgressDto>()
  private errors = new Map<string, string>()

  constructor(
    private readonly repos: Repositories,
    private readonly llm: LlmService,
    private readonly modelsDir: string,
    private readonly emitProgress: (p: DownloadProgressDto) => void
  ) {
    fs.mkdirSync(modelsDir, { recursive: true })
    // Downloads interrompidos (app fechado no meio) ficam como "retomáveis".
    for (const row of repos.models.list()) {
      if (row.status === 'downloading') repos.models.update(row.id, { status: 'error' })
    }
  }

  async overview(): Promise<ModelsOverviewDto> {
    const totalRamBytes = os.totalmem()
    const recommendedKey = recommendModel(totalRamBytes)
    const activeModelId = this.llm.activeModelId
    const rows = this.repos.models.list()
    const catalog: CatalogModelDto[] = MODEL_CATALOG.map((entry) => {
      const row = rows.find((r) => r.catalogKey === entry.key)
      const downloading = this.downloads.has(entry.key)
      const error = this.errors.get(entry.key) ?? null
      let state: CatalogModelDto['state'] = 'not_downloaded'
      if (downloading) state = 'downloading'
      else if (row?.status === 'ready' && fs.existsSync(row.filePath)) state = 'ready'
      else if (error) state = 'error'
      return {
        key: entry.key,
        displayName: entry.displayName,
        friendlyName: entry.friendlyName,
        description: entry.description,
        quantization: entry.quantization,
        sizeBytes: entry.sizeBytes,
        minRamGb: entry.minRamGb,
        recommended: entry.key === recommendedKey,
        fitsRam: totalRamBytes / 1024 ** 3 >= entry.minRamGb - 0.5,
        state,
        resumable: !downloading && !!row && row.status !== 'ready',
        modelId: row?.id ?? null,
        active: !!row && row.id === activeModelId,
        error,
        progress: this.progress.get(entry.key) ?? null
      }
    })
    const imported = rows
      .filter((r) => r.source === 'imported' && !r.catalogKey && r.status === 'ready')
      .map((r) => ({
        modelId: r.id,
        displayName: r.displayName,
        sizeBytes: r.fileSizeBytes,
        active: r.id === activeModelId
      }))
    return {
      totalRamBytes,
      freeDiskBytes: await freeDiskBytes(this.modelsDir),
      recommendedKey,
      activeModelId,
      engine: this.llm.state(),
      catalog,
      imported
    }
  }

  async download(key: string): Promise<void> {
    const entry = findCatalogModel(key)
    if (!entry) throw new FriendlyError('Modelo desconhecido.')
    if (this.downloads.has(key)) return

    const free = await freeDiskBytes(this.modelsDir)
    if (free !== null && free < entry.sizeBytes + DISK_MARGIN_BYTES) {
      throw new FriendlyError(
        `Falta espaço no disco: são necessários ${formatGb(entry.sizeBytes + DISK_MARGIN_BYTES)} e há ${formatGb(free)} livres.`
      )
    }

    const filePath = path.join(this.modelsDir, entry.fileName)
    let row = this.repos.models.findByCatalogKey(key)
    if (!row) {
      row = this.repos.models.insert({
        catalogKey: key,
        displayName: entry.displayName,
        filePath,
        fileSizeBytes: entry.sizeBytes,
        quantization: entry.quantization,
        source: 'catalog',
        status: 'downloading',
        sha256: null
      })
    } else {
      this.repos.models.update(row.id, { status: 'downloading', filePath })
    }
    const modelId = row.id
    this.errors.delete(key)

    const { createModelDownloader } = await import('node-llama-cpp')
    let lastEmit = 0
    const downloader = await createModelDownloader({
      modelUri: entry.uri,
      dirPath: this.modelsDir,
      fileName: entry.fileName,
      skipExisting: true,
      // Mantém o arquivo parcial: o download continua de onde parou (inclusive depois de fechar o app).
      deleteTempFileOnCancel: false,
      onProgress: ({ downloadedSize, totalSize, averageSpeed }) => {
        const now = Date.now()
        if (now - lastEmit < 250 && downloadedSize < totalSize) return
        lastEmit = now
        this.setProgress({
          key,
          phase: 'downloading',
          downloadedBytes: downloadedSize,
          totalBytes: totalSize || entry.sizeBytes,
          bytesPerSecond: averageSpeed
        })
      }
    })
    this.downloads.set(key, downloader)
    this.setProgress({ key, phase: 'downloading', downloadedBytes: 0, totalBytes: entry.sizeBytes, bytesPerSecond: 0 })

    void (async () => {
      let cancelled = false
      try {
        const file = await downloader.download()
        if (!this.downloads.has(key)) {
          cancelled = true
          return
        }
        this.setProgress({ key, phase: 'verifying', downloadedBytes: entry.sizeBytes, totalBytes: entry.sizeBytes, bytesPerSecond: 0 })
        const digest = await sha256File(file)
        if (digest !== entry.sha256) {
          await fs.promises.rm(file, { force: true })
          throw new FriendlyError('O arquivo baixado veio corrompido. Tente de novo.')
        }
        const size = (await fs.promises.stat(file)).size
        this.repos.models.update(modelId, { status: 'ready', filePath: file, sha256: digest, fileSizeBytes: size })
        this.setProgress({ key, phase: 'done', downloadedBytes: size, totalBytes: size, bytesPerSecond: 0 })
      } catch (err) {
        cancelled = cancelled || !this.downloads.has(key)
        this.repos.models.update(modelId, { status: 'error' })
        if (cancelled) {
          this.setProgress({ key, phase: 'cancelled', downloadedBytes: 0, totalBytes: entry.sizeBytes, bytesPerSecond: 0 })
        } else {
          const message =
            err instanceof FriendlyError ? err.message : 'Não foi possível baixar. Confira a internet e tente de novo.'
          this.errors.set(key, message)
          this.setProgress({ key, phase: 'error', downloadedBytes: 0, totalBytes: entry.sizeBytes, bytesPerSecond: 0, error: message })
        }
      } finally {
        this.downloads.delete(key)
        this.progress.delete(key)
      }
    })()
  }

  async cancelDownload(key: string): Promise<void> {
    const downloader = this.downloads.get(key)
    if (!downloader) return
    this.downloads.delete(key)
    await downloader.cancel({ deleteTempFile: false })
  }

  /** Importa um .gguf (ex.: trazido por pendrive). Copia para a pasta de modelos e abre o cabeçalho como teste. */
  async importFile(sourcePath: string): Promise<LlmModelRow> {
    if (path.extname(sourcePath).toLowerCase() !== '.gguf') {
      throw new FriendlyError('Escolha um arquivo com extensão .gguf.')
    }
    const handle = await fs.promises.open(sourcePath, 'r')
    const magic = Buffer.alloc(4)
    await handle.read(magic, 0, 4, 0)
    await handle.close()
    if (magic.toString('ascii') !== 'GGUF') throw new FriendlyError('Este arquivo não é um modelo GGUF válido.')

    const { readGgufFileInfo } = await import('node-llama-cpp')
    let metadataName: string | null = null
    try {
      const info = await readGgufFileInfo(sourcePath, { readTensorInfo: false, logWarnings: false })
      const general = (info.metadata as { general?: { name?: string } }).general
      metadataName = general?.name ?? null
    } catch {
      throw new FriendlyError('Não foi possível abrir este arquivo. Ele pode estar incompleto ou corrompido.')
    }

    const baseName = path.basename(sourcePath)
    const catalogEntry = MODEL_CATALOG.find((m) => m.fileName === baseName)
    const target = uniquePath(path.join(this.modelsDir, baseName), sourcePath)
    if (path.resolve(target) !== path.resolve(sourcePath)) {
      const total = (await fs.promises.stat(sourcePath)).size
      await copyWithProgress(sourcePath, target, (copied) =>
        this.setProgress({ key: 'import', phase: 'copying', downloadedBytes: copied, totalBytes: total, bytesPerSecond: 0 })
      )
    }
    const size = (await fs.promises.stat(target)).size

    // Arquivo do catálogo trazido por pendrive: confere o hash e liga ao card do catálogo.
    let digest: string | null = null
    let catalogKey: CatalogModel['key'] | null = null
    if (catalogEntry) {
      this.setProgress({ key: 'import', phase: 'verifying', downloadedBytes: size, totalBytes: size, bytesPerSecond: 0 })
      digest = await sha256File(target)
      if (digest === catalogEntry.sha256) catalogKey = catalogEntry.key
    }
    this.setProgress({ key: 'import', phase: 'done', downloadedBytes: size, totalBytes: size, bytesPerSecond: 0 })

    const existing = catalogKey ? this.repos.models.findByCatalogKey(catalogKey) : undefined
    const fields = {
      catalogKey,
      displayName: catalogEntry && catalogKey ? catalogEntry.displayName : (metadataName ?? baseName.replace(/\.gguf$/i, '')),
      filePath: target,
      fileSizeBytes: size,
      quantization: catalogKey ? (catalogEntry?.quantization ?? null) : guessQuantization(baseName),
      source: 'imported' as const,
      status: 'ready' as const,
      sha256: digest
    }
    if (existing) {
      this.repos.models.update(existing.id, fields)
      return { ...existing, ...fields }
    }
    return this.repos.models.insert(fields)
  }

  /** Gera um enunciado de exemplo e mede o tempo. */
  async test(modelId: string): Promise<ModelTestResultDto> {
    const loaded = await this.llm.loadModel(modelId)
    if (!loaded) {
      const state = this.llm.state()
      return {
        ok: false,
        seconds: 0,
        statement: '',
        source: 'fallback',
        slow: false,
        error: state.state === 'error' ? `Não foi possível abrir o modelo: ${state.message}` : 'Modelo não encontrado.'
      }
    }
    // Mesmo caminho das questões de verdade: um problema contextualizado e um exemplo do mesmo template.
    const q = generateQuestion({ focus: 'add_sub', seed: 20260925, enabledSkills: ['EF03MA06'] })
    const generator = await this.llm.generator('foreground', modelId)
    // Mede só a geração (o carregamento acontece uma vez, na abertura do app).
    const started = Date.now()
    const ctx = { numbers: q.numbers, answer: q.answer, orderedNumbers: q.operation === 'sub' }
    const result = await runTutor(generator, {
      kind: 'statement',
      messages: buildStatementPrompt(q),
      temperature: 0.5,
      maxTokens: 160,
      validate: (raw) => validateStatement(raw, ctx),
      prefixProblem: (text) => statementPrefixProblem(text, ctx),
      fallback: () => q.fallbackStatement,
      timeoutMs: 60_000
    })
    const seconds = (Date.now() - started) / 1000
    return {
      ok: result.source === 'llm',
      seconds: Math.round(seconds * 10) / 10,
      statement: result.text,
      source: result.source,
      slow: seconds > SLOW_TEST_SECONDS,
      error:
        result.source === 'llm'
          ? undefined
          : `Levou ${Math.round(seconds)}s, mas o texto do modelo não passou na conferência desta vez. Quando isso acontece, o app usa um texto pronto. Teste de novo ou experimente outro modelo.`
    }
  }

  async activate(modelId: string): Promise<boolean> {
    return this.llm.activate(modelId)
  }

  private setProgress(p: DownloadProgressDto): void {
    if (p.phase === 'downloading' || p.phase === 'verifying' || p.phase === 'copying') this.progress.set(p.key, p)
    this.emitProgress(p)
  }
}

async function freeDiskBytes(dir: string): Promise<number | null> {
  try {
    const stats = await fs.promises.statfs(dir)
    return stats.bavail * stats.bsize
  } catch {
    return null
  }
}

export function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    fs.createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')))
  })
}

async function copyWithProgress(from: string, to: string, onProgress: (copied: number) => void): Promise<void> {
  let copied = 0
  let last = 0
  await new Promise<void>((resolve, reject) => {
    const read = fs.createReadStream(from)
    const write = fs.createWriteStream(to)
    read.on('data', (chunk) => {
      copied += chunk.length
      if (Date.now() - last > 250) {
        last = Date.now()
        onProgress(copied)
      }
    })
    read.on('error', reject)
    write.on('error', reject)
    write.on('finish', () => resolve())
    read.pipe(write)
  })
}

function uniquePath(target: string, source: string): string {
  if (path.resolve(target) === path.resolve(source) || !fs.existsSync(target)) return target
  const ext = path.extname(target)
  const base = target.slice(0, -ext.length)
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}${ext}`
    if (!fs.existsSync(candidate)) return candidate
  }
}

function guessQuantization(fileName: string): string | null {
  return /(Q\d_[A-Z0-9_]+|Q\d_\d|F16|BF16|Q8_0)/i.exec(fileName)?.[1]?.toUpperCase() ?? null
}

const formatGb = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1).replace('.', ',')} GB`
