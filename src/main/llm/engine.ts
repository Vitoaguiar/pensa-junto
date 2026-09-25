import type { ChatMessage } from '@core/types'

export type { ChatMessage }

export interface GenerateRequest {
  messages: ChatMessage[]
  maxTokens?: number // padrão 200
  temperature?: number // padrão 0.7 (questões), 0.4 (dicas)
  onToken?: (chunk: string) => void // streaming para a UI
  signal?: AbortSignal
}

/** A única coisa que o resto do app conhece do SLM. */
export interface LlmEngine {
  isReady(): boolean
  load(modelFilePath: string): Promise<void>
  unload(): Promise<void>
  generate(req: GenerateRequest): Promise<string>
}

/** Remove blocos de raciocínio (<think>...</think>) de modelos como o Qwen3. */
export function stripThinking(text: string): string {
  const closed = text.replace(/<think>[\s\S]*?<\/think>/gi, '')
  const open = closed.search(/<think>/i)
  return (open >= 0 ? closed.slice(0, open) : closed).trim()
}
