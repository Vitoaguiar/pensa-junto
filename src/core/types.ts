// Tipos do núcleo pedagógico. TypeScript puro: sem electron, node, react ou fs.

export type Operation = 'add' | 'sub' | 'mul' | 'div'

/** Foco escolhido pelo aluno ao abrir uma nova conversa. */
export type Focus = 'add_sub' | 'mul' | 'div' | 'mixed'

export type Answer =
  | { kind: 'integer'; value: number }
  | { kind: 'division'; quotient: number; remainder: number }

export type ThemeKey =
  | 'escola'
  | 'feira'
  | 'futebol'
  | 'animais'
  | 'cozinha'
  | 'parque'
  | 'biblioteca'
  | 'festa-junina'
  | 'horta'
  | 'brinquedos'

/** Substantivo com gênero, para concordância nos textos de fallback. */
export interface Noun {
  singular: string
  plural: string
  feminine: boolean
}

export interface Theme {
  key: ThemeKey
  label: string
  /** Locução de lugar: "na feira", "no parque". */
  place: string
  /** Coisas que se contam neste tema. */
  items: Noun[]
  /** Onde as coisas são agrupadas: caixas, cestas, pacotes. */
  containers: Noun[]
}

export interface Rng {
  readonly seed: number
  /** Número em [0, 1). */
  next(): number
  /** Inteiro em [min, max], inclusivo. */
  int(min: number, max: number): number
  pick<T>(items: readonly T[]): T
}

export interface QuestionTemplate<P = unknown> {
  id: string
  skillCode: string
  operation: Operation
  /** Significado da operação, explicado ao LLM (ex.: "retirar"). */
  meaning: string
  /** O mesmo significado em linguagem de criança, usado no fallback de "Não entendi". */
  meaningForKids: string
  /** Extensões ficam fora do sorteio padrão (ex.: divisão com resto). */
  extension?: boolean
  /** Contas diretas ("Quanto é 7 + 5?") em vez de problemas contextualizados. */
  direct?: boolean
  generateParams(rng: Rng): P
  solve(p: P): Answer
  steps(p: P): string[]
  numbersInStatement(p: P): number[]
  fallbackStatement(p: P, theme: Theme, rng: Rng): string
  fallbackHints(p: P): [string, string, string]
  /** Expressão da conta, ex.: "347 - 125". Usada para detectar vazamento. */
  expression(p: P): string
}

export interface BnccSkill {
  code: string
  grade: number
  thematicUnit: string
  objectOfKnowledge: string
  description: string
}

/** Tudo que o código sabe sobre uma questão. Fica no processo main; nunca vai inteiro ao renderer. */
export interface GeneratedQuestion {
  templateId: string
  skillCode: string
  operation: Operation
  meaning: string
  seed: number
  params: unknown
  answer: Answer
  theme: Theme
  numbers: number[]
  expression: string
  steps: string[]
  fallbackStatement: string
  fallbackHints: [string, string, string]
}

export type HintLevel = 1 | 2 | 3

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type TutorKind = 'statement' | 'hint' | 'rephrase' | 'example' | 'chat' | 'feedback'
