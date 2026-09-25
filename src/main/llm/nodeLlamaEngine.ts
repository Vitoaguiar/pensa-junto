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
export class NodeLlamaEngine implements LlmEngine {
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
    const { getLlama } = await loadModule()
    try {
      // Usa a GPU se houver (Vulkan/CUDA/Metal); nunca tenta compilar nada na máquina da escola.
      this.llama = await getLlama({ gpu: 'auto', build: 'never', progressLogs: false })
    } catch {
      this.llama = await getLlama({ gpu: false, build: 'never', progressLogs: false })
    }
    return this.llama
  }

  async load(modelFilePath: string): Promise<void> {
    if (this.modelPath === modelFilePath && this.isReady()) return
    await this.unload()
    const llama = await this.getLlama()
    this.model = await llama.loadModel({ modelPath: modelFilePath })
    // Contexto pequeno: os prompts do app são curtos, e isso economiza RAM em PCs fracos.
    this.context = await this.model.createContext({ contextSize: { min: 1024, max: 4096 } })
    this.sequence = this.context.getSequence()
    this.modelPath = modelFilePath
    this.thinkingModel = /qwen3/i.test(path.basename(modelFilePath))
    // Aquecimento: a primeira geração é bem mais lenta (alocação, shaders da GPU). Paga agora, no carregamento,
    // e não quando a criança pede a primeira questão.
    await this.generateNow({ messages: [{ role: 'user', content: 'Oi' }], maxTokens: 1, temperature: 0 }).catch(() => undefined)
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

    await sequence.clearHistory()
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
