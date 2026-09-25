import fs from 'node:fs'
import type { TextGenerator } from '@core/tutor'
import type { Repositories } from '../db/repositories'
import type { LlmEngine } from './engine'

export type Priority = 'foreground' | 'background'

interface Job {
  priority: Priority
  controller: AbortController
  start: () => void
}

export type EngineState =
  | { state: 'none' }
  | { state: 'loading'; modelId: string }
  | { state: 'ready'; modelId: string }
  | { state: 'error'; modelId: string; message: string }

/**
 * Ciclo de vida do motor + fila de gerações.
 * Pedidos da criança (foreground) passam na frente e interrompem a pré-geração em segundo plano.
 */
export class LlmService {
  private loadedModelId: string | null = null
  private loading: Promise<boolean> | null = null
  private loadingId: string | null = null
  private lastError: { modelId: string; message: string } | null = null
  private running: Job | null = null
  private queue: Job[] = []

  constructor(
    private readonly engine: LlmEngine,
    private readonly repos: Repositories
  ) {}

  get activeModelId(): string | null {
    return this.repos.settings.get('active_model_id')
  }

  state(): EngineState {
    if (this.loadingId) return { state: 'loading', modelId: this.loadingId }
    if (this.loadedModelId && this.engine.isReady()) return { state: 'ready', modelId: this.loadedModelId }
    if (this.lastError) return { state: 'error', ...this.lastError }
    return { state: 'none' }
  }

  /** Carrega um modelo (sem torná-lo ativo). */
  async loadModel(modelId: string): Promise<boolean> {
    if (this.loadedModelId === modelId && this.engine.isReady()) return true
    if (this.loading && this.loadingId === modelId) return this.loading
    if (this.loading) await this.loading.catch(() => false)
    const row = this.repos.models.get(modelId)
    if (!row || row.status !== 'ready' || !fs.existsSync(row.filePath)) {
      this.lastError = { modelId, message: 'Arquivo do modelo não encontrado.' }
      return false
    }
    this.loadingId = modelId
    this.loading = (async () => {
      try {
        // Espera a geração em andamento terminar antes de trocar o modelo.
        this.running?.controller.abort()
        await this.engine.load(row.filePath)
        this.loadedModelId = modelId
        this.lastError = null
        return true
      } catch (err) {
        this.loadedModelId = null
        this.lastError = { modelId, message: err instanceof Error ? err.message : String(err) }
        return false
      } finally {
        this.loadingId = null
        this.loading = null
      }
    })()
    return this.loading
  }

  async activate(modelId: string): Promise<boolean> {
    const ok = await this.loadModel(modelId)
    if (ok) this.repos.settings.set('active_model_id', modelId)
    return ok
  }

  async deactivate(): Promise<void> {
    this.repos.settings.delete('active_model_id')
    this.loadedModelId = null
    await this.engine.unload()
  }

  /** Garante que o modelo ativo está carregado. false = modo básico. */
  async ensureActiveLoaded(): Promise<boolean> {
    const active = this.activeModelId
    if (!active) return false
    return this.loadModel(active)
  }

  /**
   * Gerador para o core, ou null se não houver modelo (modo básico com fallbacks).
   * Com `modelId`, usa aquele modelo (ex.: botão Testar) em vez do ativo.
   */
  async generator(priority: Priority, modelId?: string): Promise<TextGenerator | null> {
    const ready = modelId ? await this.loadModel(modelId) : await this.ensureActiveLoaded()
    if (!ready) return null
    return {
      generate: async (messages, options) => {
        const request = (signal: AbortSignal, streaming: boolean) =>
          this.engine.generate({
            messages,
            maxTokens: options.maxTokens,
            temperature: options.temperature,
            onToken: streaming ? options.onToken : undefined,
            signal: options.signal ? AbortSignal.any([options.signal, signal]) : signal
          })
        if (priority === 'foreground') return this.exclusive('foreground', (signal) => request(signal, true))
        // Segundo plano: sem streaming e, se for interrompido pela criança, recomeça depois do zero.
        for (;;) {
          let preempted = false
          const text = await this.exclusive('background', async (signal) => {
            const out = await request(signal, false)
            preempted = signal.aborted
            return out
          })
          if (!preempted || options.signal?.aborted) return text
        }
      }
    }
  }

  /** Uma geração por vez. Foreground fura a fila e interrompe background. */
  private exclusive<T>(priority: Priority, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const controller = new AbortController()
      const job: Job = {
        priority,
        controller,
        start: () => {
          this.running = job
          fn(controller.signal)
            .then(resolve, reject)
            .finally(() => {
              this.running = null
              this.next()
            })
        }
      }
      if (priority === 'foreground') {
        const firstBackground = this.queue.findIndex((j) => j.priority === 'background')
        this.queue.splice(firstBackground < 0 ? this.queue.length : firstBackground, 0, job)
        if (this.running?.priority === 'background') this.running.controller.abort()
      } else {
        this.queue.push(job)
      }
      if (!this.running) this.next()
    })
  }

  private next(): void {
    if (this.running) return
    const job = this.queue.shift()
    // Mesmo um job já abortado é iniciado: o motor devolve '' na hora e a promise dele se resolve.
    job?.start()
  }

  async dispose(): Promise<void> {
    this.running?.controller.abort()
    for (const job of this.queue) job.controller.abort()
    this.queue = []
    await this.engine.unload()
  }
}
