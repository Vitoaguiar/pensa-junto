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

export type ModelState = 'not_downloaded' | 'downloading' | 'ready' | 'error'

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

export interface ImportedModelDto {
  modelId: string
  displayName: string
  sizeBytes: number | null
  active: boolean
}

export interface ModelsOverviewDto {
  totalRamBytes: number
  freeDiskBytes: number | null
  recommendedKey: string
  activeModelId: string | null
  engine: EngineStateDto
  catalog: CatalogModelDto[]
  imported: ImportedModelDto[]
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
  kind: string
  total: number
  avgLatencyMs: number
  fallbackPercent: number
}
