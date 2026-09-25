import path from 'node:path'
import type {
  ChatHistoryItem,
  Llama,
  LlamaContext,
  LlamaContextSequence,
  LlamaModel
} from 'node-llama-cpp'
import { stripThinking, type GenerateRequest, type LlmEngine } from './engine'

// node-llama-cpp é ESM puro: importado dinamicamente para funcionar a partir do main em CommonJS.
type NodeLlamaCpp = typeof import('node-llama-cpp')
let modulePromise: Promise<NodeLlamaCpp> | null = null
const loadModule = () => (modulePromise ??= import('node-llama-cpp'))

/**
 * Motor com node-llama-cpp. O modelo é carregado UMA vez e o contexto é reutilizado;
 * as gerações são serializadas (uma sequência de contexto só atende um pedido por vez).
 */
export interface EngineOptions {
  /** false = só CPU (ex.: simular um PC de escola sem GPU). Padrão: usa a GPU se houver. */
  gpu?: boolean
  /** Limite de threads de CPU (ex.: 2, para simular um processador fraco). Padrão: automático. */
  threads?: number
  /** Mostra avisos do llama.cpp no terminal. Padrão: só erros. */
  verboseLogs?: boolean
}

/** O que o motor está usando de fato (para o relatório de benchmark e para o suporte). */
export interface EngineInfo {
  gpu: string | false
  threads: number | null
  gpuLayers: number | null
  contextSize: number | null
  modelSizeBytes: number | null
}

export class NodeLlamaEngine implements LlmEngine {
  constructor(private readonly options: EngineOptions = {}) {}

  private llama: Llama | null = null
  private model: LlamaModel | null = null
  private context: LlamaContext | null = null
  private sequence: LlamaContextSequence | null = null
  private modelPath: string | null = null
  private thinkingModel = false
  private chain: Promise<unknown> = Promise.resolve()

  isReady(): boolean {
    return this.sequence !== null
  }

  get loadedPath(): string | null {
    return this.modelPath
  }

  private async getLlama(): Promise<Llama> {
    if (this.llama) return this.llama
    const { getLlama, LlamaLogLevel } = await loadModule()
    const common = {
      build: 'never' as const,
      progressLogs: false,
      // Avisos do llama.cpp (ex.: "control-looking token ... was not control-type") são inofensivos e
      // só assustam no terminal; por padrão aparecem apenas erros.
      logLevel: this.options.verboseLogs ? LlamaLogLevel.warn : LlamaLogLevel.error,
      ...(this.options.threads ? { maxThreads: this.options.threads } : {})
    }
    try {
      // Usa a GPU se houver (Vulkan/CUDA/Metal); nunca tenta compilar nada na máquina da escola.
      this.llama = await getLlama({ ...common, gpu: this.options.gpu === false ? false : 'auto' })
    } catch {
      this.llama = await getLlama({ ...common, gpu: false })
    }
    return this.llama
  }

  async load(modelFilePath: string): Promise<void> {
    if (this.modelPath === modelFilePath && this.isReady()) return
    await this.unload()
    const llama = await this.getLlama()
    this.model = await llama.loadModel({ modelPath: modelFilePath })
    // Contexto pequeno: os prompts do app são curtos, e isso economiza RAM em PCs fracos.
    this.context = await this.model.createContext({
      contextSize: { min: 1024, max: 4096 },
      ...(this.options.threads ? { threads: this.options.threads } : {})
    })
    this.sequence = this.context.getSequence()
    this.modelPath = modelFilePath
    this.thinkingModel = /qwen3/i.test(path.basename(modelFilePath))
    // Aquecimento: a primeira geração é bem mais lenta (alocação, shaders da GPU). Paga agora, no carregamento,
    // e não quando a criança pede a primeira questão.
    await this.generateNow({ messages: [{ role: 'user', content: 'Oi' }], maxTokens: 1, temperature: 0 }).catch(() => undefined)
  }

  info(): EngineInfo {
    return {
      gpu: this.llama ? this.llama.gpu : false,
      threads: this.context?.currentThreads ?? null,
      gpuLayers: this.model?.gpuLayers ?? null,
      contextSize: this.context?.contextSize ?? null,
      modelSizeBytes: this.model?.size ?? null
    }
  }

  async unload(): Promise<void> {
    const { context, model } = this
    this.sequence = null
    this.context = null
    this.model = null
    this.modelPath = null
    await context?.dispose()
    await model?.dispose()
  }

  generate(req: GenerateRequest): Promise<string> {
    const run = this.chain.then(() => this.generateNow(req))
    this.chain = run.catch(() => undefined)
    return run
  }

  private async generateNow(req: GenerateRequest): Promise<string> {
    const sequence = this.sequence
    if (!sequence) throw new Error('Modelo não carregado')
    if (req.signal?.aborted) return ''
    const { LlamaChatSession } = await loadModule()

    const messages = [...req.messages]
    const last = messages.pop()
    if (!last || last.role !== 'user') throw new Error('A última mensagem deve ser do usuário')

    const history: ChatHistoryItem[] = messages.map((m) =>
      m.role === 'system'
        ? { type: 'system', text: m.content }
        : m.role === 'user'
          ? { type: 'user', text: m.content }
          : { type: 'model', response: [m.content] }
    )

    // Sem clearHistory(): o node-llama-cpp compara com o que já está no contexto e só reavalia a partir
    // do primeiro token diferente. Os prompts começam pelas partes fixas justamente para aproveitar isso.
    const session = new LlamaChatSession({ contextSequence: sequence, autoDisposeSequence: false })
    try {
      session.setChatHistory(history)
      // Qwen3: desliga o modo de raciocínio (a instrução /no_think e orçamento zero de "pensamento").
      const prompt = this.thinkingModel ? `${last.content} /no_think` : last.content
      const text = await session.prompt(prompt, {
        maxTokens: req.maxTokens ?? 200,
        temperature: req.temperature ?? 0.7,
        signal: req.signal,
        stopOnAbortSignal: true,
        budgets: { thoughtTokens: 0 },
        onTextChunk: req.onToken
      })
      return stripThinking(text)
    } finally {
      session.dispose({ disposeSequence: false })
    }
  }
}
