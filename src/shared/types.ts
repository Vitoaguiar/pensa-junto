// DTOs trocados entre main e renderer. A resposta correta NUNCA aparece aqui.

import type { Focus } from '@core/types'

export type { Focus }

export type ColorKey = 'anil' | 'turquesa' | 'sol' | 'menta' | 'coral' | 'lilas'

export const AVATAR_KEYS = [
  'cat',
  'dog',
  'rabbit',
  'turtle',
  'bird',
  'fish',
  'squirrel',
  'snail',
  'rocket',
  'star',
  'sun',
  'moon',
  'flower',
  'leaf',
  'music',
  'bike',
  'palette',
  'crown'
] as const
export type AvatarKey = (typeof AVATAR_KEYS)[number]
export const COLOR_KEYS: readonly ColorKey[] = ['anil', 'turquesa', 'sol', 'menta', 'coral', 'lilas']

export interface AppStatusDto {
  onboardingDone: boolean
  hasTeacherPassword: boolean
  teacherUnlocked: boolean
  basicMode: boolean
  engine: EngineStateDto
  activeModelName: string | null
  isDev: boolean
  syncEnabled: boolean
}

export type EngineStateDto =
  | { state: 'none' }
  | { state: 'loading'; modelId: string }
  | { state: 'ready'; modelId: string }
  | { state: 'error'; modelId: string; message: string }

// ---------- Alunos e turmas ----------

/** O que a criança e a tela de PIN podem ver. */
export interface StudentPublicDto {
  id: string
  displayName: string
  avatarKey: string
  colorKey: string
}

/** O que o professor vê. */
export interface StudentDto extends StudentPublicDto {
  fullName: string
  grade: number
  classroomId: string | null
  isActive: boolean
}

export interface ClassroomDto {
  id: string
  name: string
  grade: number
  schoolYear: number
}

/** O PIN em texto aparece só uma vez, logo depois de gerado. */
export interface StudentWithPinDto {
  student: StudentDto
  pin: string
}

export type VerifyPinResult =
  | { ok: true; student: StudentPublicDto }
  | { ok: false; reason: 'not_found'; remainingBeforeLock: number }
  | { ok: false; reason: 'locked'; retryInSeconds: number }

// ---------- Sessões e questões ----------

export type SessionStatus = 'active' | 'finished' | 'archived'
export type QuestionStatus = 'pending' | 'correct' | 'skipped' | 'needs_teacher'

export interface SessionSummaryDto {
  id: string
  title: string
  focus: Focus
  status: SessionStatus
  questionsTarget: number
  /** Questões encerradas (acertadas, puladas ou com o professor). */
  doneCount: number
  correctCount: number
  hintsUsed: number
  lastActivityAt: string
}

export interface QuestionDto {
  id: string
  position: number
  statement: string
  statementSource: 'llm' | 'fallback'
  skillCode: string
  answerKind: 'integer' | 'division'
  status: QuestionStatus
  hintsUsed: number
  attemptsCount: number
  wrongAttempts: number
  /** Dica 3/3 usada e 3 erros: oferecer "Chamar o professor" e "Tentar outra questão". */
  offerHelp: boolean
}

export interface MessageDto {
  id: string
  questionId: string | null
  role: 'student' | 'tutor' | 'event'
  kind: 'chat' | 'hint' | 'rephrase' | 'example' | 'feedback' | 'event'
  hintLevel: number | null
  content: string
  source: 'llm' | 'fallback' | 'system'
  createdAt: string
}

export interface SessionStateDto {
  session: SessionSummaryDto
  current: QuestionDto | null
  progress: QuestionStatus[]
  messages: MessageDto[]
}

export type AnswerInputDto =
  | { kind: 'integer'; value: string }
  | { kind: 'division'; quotient: string; remainder: string }

export interface SubmitResultDto {
  valid: boolean
  correct: boolean
  question: QuestionDto
  /** Pergunta automática do tutor depois de um erro. */
  tutorMessage: MessageDto | null
  session: SessionSummaryDto
  sessionFinished: boolean
}

export interface TutorReplyDto {
  question: QuestionDto
  studentMessage: MessageDto | null
  tutorMessage: MessageDto
}

export interface HelpActionResultDto {
  question: QuestionDto
  event: MessageDto
  session: SessionSummaryDto
  sessionFinished: boolean
}

/** Evento de streaming: texto seguro inteiro até agora, ou "apague e recomece". */
export interface StreamEventDto {
  requestId: string
  event: { type: 'text'; text: string } | { type: 'reset' }
}

// ---------- Modelos ----------

/** "found" = o arquivo oficial já está neste computador (ex.: baixado antes), falta só conferir e usar. */
export type ModelState = 'not_downloaded' | 'downloading' | 'ready' | 'found' | 'error'

export interface DownloadProgressDto {
  key: string
  phase: 'downloading' | 'verifying' | 'copying' | 'done' | 'error' | 'cancelled'
  downloadedBytes: number
  totalBytes: number
  bytesPerSecond: number
  error?: string
}

export interface CatalogModelDto {
  key: string
  displayName: string
  friendlyName: string
  description: string
  quantization: string
  sizeBytes: number
  minRamGb: number
  recommended: boolean
  fitsRam: boolean
  state: ModelState
  resumable: boolean
  modelId: string | null
  active: boolean
  error: string | null
  progress: DownloadProgressDto | null
}

/** Modelo pronto para usar neste computador (baixado pelo app, importado ou encontrado). */
export interface InstalledModelDto {
  modelId: string
  catalogKey: string | null
  displayName: string
  friendlyName: string | null
  sizeBytes: number | null
  filePath: string
  /** "app": arquivo na pasta do app (remover apaga o arquivo). "external": o app só aponta para ele. */
  location: 'app' | 'external'
  active: boolean
}

/** Arquivo oficial do catálogo encontrado no computador, ainda não registrado no app. */
export interface FoundModelDto {
  key: string
  displayName: string
  friendlyName: string
  filePath: string
  sizeBytes: number
  location: 'app' | 'external'
}

export interface ModelsOverviewDto {
  totalRamBytes: number
  freeDiskBytes: number | null
  recommendedKey: string
  activeModelId: string | null
  engine: EngineStateDto
  catalog: CatalogModelDto[]
  installed: InstalledModelDto[]
  found: FoundModelDto[]
}

export interface RemoveModelResultDto {
  overview: ModelsOverviewDto
  /** Arquivo que ficou no computador (quando estava fora da pasta do app). */
  keptFile: string | null
}

export interface ModelTestResultDto {
  ok: boolean
  seconds: number
  statement: string
  source: 'llm' | 'fallback'
  slow: boolean
  error?: string
}

export interface GenerationStatsDto {
  modelId: string | null
  /** Nome do modelo; null = modo básico (textos prontos, sem modelo). */
  modelName: string | null
  kind: string
  total: number
  avgLatencyMs: number
  fallbackPercent: number
}

// ---------- Modo de avaliação (professores avaliam os textos às cegas) ----------

export interface EvaluationCreateOptionsDto {
  /** Inclui a condição "textos do código (sem modelo)" como linha de base. */
  includeCode: boolean
  modelIds: string[]
  kinds: Array<'statement' | 'hint'>
  skills: string[]
  /** Questões por habilidade (o artigo de referência recomenda 50). */
  perSkill: number
}

export interface EvaluationSetDto {
  code: string
  createdAt: string
  conditions: string[]
  kinds: Array<'statement' | 'hint'>
  skills: string[]
  items: number
  /** Planilhas de avaliadores já importadas. */
  raters: number
}

export interface EvaluationProgressDto {
  code: string
  done: number
  total: number
  label: string
}

export interface EvaluationImportResultDto {
  imported: Array<{ rater: string; rated: number; unknown: number }>
  errors: Array<{ file: string; message: string }>
}

export interface EvaluationStatsDto {
  items: number
  ratings: number
  intentionMean: number | null
  intentionMedian: number | null
  /** % de notas ≥ 4 em "Eu usaria em sala". */
  approvalPct: number | null
  mathCorrectPct: number | null
  adequacyMean: number | null
  /** % dos textos desta condição que vieram do modelo (o resto foi o texto do código, após recusa da validação). */
  modelTextPct: number
}

export interface EvaluationConditionReportDto {
  label: string
  overall: EvaluationStatsDto
  byKind: Record<string, EvaluationStatsDto>
  bySkill: Record<string, EvaluationStatsDto>
}

export interface EvaluationReportDto {
  code: string
  raters: string[]
  ratedItems: number
  totalItems: number
  conditions: EvaluationConditionReportDto[]
  agreement: { items: number; percentAgreement: number | null; kappa: number | null; label: string } | null
  reportPath: string
}
