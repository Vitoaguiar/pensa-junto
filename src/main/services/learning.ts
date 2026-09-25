import { randomInt } from 'node:crypto'
import { checkAnswer, formatAnswer, type AnswerInput } from '@core/answer'
import { diagnoseAttempt } from '@core/feedback'
import { generateExample, generateQuestion, rebuildQuestion, sessionTitle } from '@core/generator'
import {
  buildChatPrompt,
  buildExamplePrompt,
  buildFeedbackPrompt,
  buildHintPrompt,
  buildRephrasePrompt,
  buildStatementPrompt,
  fallbackChatReply,
  type ChatTurn,
  type TutorContext
} from '@core/prompts'
import { findTemplate } from '@core/templates'
import { THEMES } from '@core/themes'
import { runTutor, type StreamEvent, type TutorRequest, type TutorResult } from '@core/tutor'
import type { Answer, Focus, GeneratedQuestion, HintLevel, TutorKind } from '@core/types'
import {
  statementPrefixProblem,
  tutorNumberVocabulary,
  tutorPrefixProblem,
  validateRephrase,
  validateStatement,
  validateTutorText,
  type StatementContext,
  type TutorTextContext
} from '@core/validation'
import { extractNumbers } from '@core/numberWords'
import { answerNumbers } from '@core/templates/helpers'
import type {
  HelpActionResultDto,
  MessageDto,
  QuestionDto,
  SessionStateDto,
  SessionSummaryDto,
  SubmitResultDto,
  TutorReplyDto
} from '@shared/types'
import type { Repositories } from '../db/repositories'
import type { MessageRow, QuestionRow, SessionRow } from '../db/schema'
import type { Priority } from '../llm/llmService'
import type { TextGenerator } from '@core/tutor'

export class LearningError extends Error {}

/** O que o serviço precisa do motor: um gerador (ou null no modo básico) e o id do modelo, para os logs. */
export interface LlmProvider {
  generator(priority: Priority): Promise<TextGenerator | null>
  readonly activeModelId: string | null
}

export type StreamEmitter = (requestId: string, event: StreamEvent) => void

interface Pregenerated {
  position: number
  generated: GeneratedQuestion
  statement: string
  source: 'llm' | 'fallback'
}

const MAX_WRONG_BEFORE_HELP = 3
/** Dica, chat e pergunta depois do erro: curtos (no máximo ~2 frases). */
const SHORT_TUTOR_LENGTH = 260
/** Tempo total para um texto aparecer (tentativas incluídas) antes de usar o texto pronto. */
const STATEMENT_BUDGET_MS = 20_000
const TUTOR_BUDGET_MS = 25_000
const MAX_CHAT_LENGTH = 200

/** Regras do enunciado: contas diretas podem mostrar a conta; em subtração e divisão a ordem dos números importa. */
export function statementContext(q: GeneratedQuestion): StatementContext {
  return {
    numbers: q.numbers,
    answer: q.answer,
    allowExpression: findTemplate(q.templateId).direct,
    orderedNumbers: q.operation === 'sub' || q.operation === 'div'
  }
}

/** Exemplo parecido pronto (sem modelo): enunciado, conta e resposta DO EXEMPLO. */
export function exampleFallback(ex: GeneratedQuestion): string {
  return `Veja este exemplo: ${ex.fallbackStatement} A conta é ${ex.expression}, e a resposta do exemplo é ${formatAnswer(ex.answer)}. Agora tente fazer do mesmo jeito no seu problema!`
}

/** "Não entendi" pronto (sem modelo): o sentido da situação + o enunciado com os mesmos números. */
export function rephraseFallback(q: GeneratedQuestion): string {
  return `${findTemplate(q.templateId).meaningForKids} ${q.fallbackStatement}`
}

const toMessageDto = (m: MessageRow): MessageDto => ({
  id: m.id,
  questionId: m.questionId,
  role: m.role,
  kind: m.kind,
  hintLevel: m.hintLevel,
  content: m.content,
  source: m.source,
  createdAt: m.createdAt
})

/** Sessões, questões, correção e ajuda. A resposta correta nunca sai deste serviço. */
export class LearningService {
  private cache = new Map<string, GeneratedQuestion>()
  private pregenerated = new Map<string, Pregenerated>()
  private pregenerating = new Map<string, { position: number; promise: Promise<Pregenerated | null> }>()

  constructor(
    private readonly repos: Repositories,
    private readonly llm: LlmProvider,
    private readonly emit: StreamEmitter,
    private readonly newSeed: () => number = () => randomInt(0, 2 ** 31)
  ) {}

  // ---------------- Sessões ----------------

  listSessions(studentId: string): { active: SessionSummaryDto[]; finished: SessionSummaryDto[] } {
    return {
      active: this.repos.sessions.listByStudent(studentId, 'active').map((s) => this.summary(s)),
      finished: this.repos.sessions.listByStudent(studentId, 'finished').map((s) => this.summary(s))
    }
  }

  createSession(studentId: string, focus: Focus): SessionSummaryDto {
    const theme = THEMES[this.newSeed() % THEMES.length] ?? THEMES[0]!
    const session = this.repos.sessions.create({ studentId, focus, title: sessionTitle(focus, theme.label) })
    return this.summary(session)
  }

  getState(studentId: string, sessionId: string): SessionStateDto {
    const session = this.session(studentId, sessionId)
    const questions = this.repos.questions.listBySession(session.id)
    const current = questions.find((q) => q.status === 'pending') ?? null
    if (current && session.status === 'active') this.schedulePregeneration(session)
    return {
      session: this.summary(session, questions),
      current: current ? this.questionDto(current) : null,
      progress: questions.map((q) => q.status),
      messages: this.repos.messages.listBySession(session.id).map(toMessageDto)
    }
  }

  /** Questão atual (se houver) ou a próxima, gerada agora com streaming (ou já pré-gerada). */
  async nextQuestion(studentId: string, sessionId: string, requestId: string): Promise<SessionStateDto> {
    const session = this.session(studentId, sessionId)
    if (session.status !== 'active') return this.getState(studentId, sessionId)
    const questions = this.repos.questions.listBySession(session.id)
    const pending = questions.find((q) => q.status === 'pending')
    if (pending) {
      this.emit(requestId, { type: 'text', text: pending.statement })
      return this.getState(studentId, sessionId)
    }
    if (questions.length >= session.questionsTarget) {
      this.finish(session)
      return this.getState(studentId, sessionId)
    }

    const position = questions.length + 1
    // Pré-geração em andamento para esta posição? Espera por ela (a fila fica livre para ela agora).
    const inFlight = this.pregenerating.get(session.id)
    if (inFlight?.position === position) await inFlight.promise
    const ready = this.pregenerated.get(session.id)
    let prepared: Pregenerated
    if (ready && ready.position === position) {
      this.pregenerated.delete(session.id)
      prepared = ready
      this.emit(requestId, { type: 'text', text: prepared.statement })
    } else {
      prepared = await this.prepareQuestion(session, questions, position, 'foreground', requestId)
    }

    const row = this.repos.questions.insert({
      sessionId: session.id,
      studentId,
      position,
      skillCode: prepared.generated.skillCode,
      templateId: prepared.generated.templateId,
      seed: prepared.generated.seed,
      paramsJson: JSON.stringify(prepared.generated.params),
      correctAnswerJson: JSON.stringify(prepared.generated.answer),
      statement: prepared.statement,
      statementSource: prepared.source,
      theme: prepared.generated.theme.key
    })
    this.cache.set(row.id, prepared.generated)
    this.repos.messages.insert({
      sessionId: session.id,
      questionId: row.id,
      role: 'event',
      kind: 'event',
      content: `Questão ${position}`,
      source: 'system'
    })
    this.repos.sessions.touch(session.id)
    const state = this.getState(studentId, sessionId)
    return state
  }

  // ---------------- Resposta ----------------

  async submitAnswer(studentId: string, questionId: string, input: AnswerInput, requestId: string): Promise<SubmitResultDto> {
    const { row, session } = this.pendingQuestion(studentId, questionId)
    const correctAnswer = JSON.parse(row.correctAnswerJson) as Answer
    if (input.kind !== correctAnswer.kind) throw new LearningError('Formato de resposta inválido.')
    const check = checkAnswer(correctAnswer, input)
    if (!check.valid || !check.parsed) {
      return {
        valid: false,
        correct: false,
        question: this.questionDto(row),
        tutorMessage: null,
        session: this.summary(session),
        sessionFinished: false
      }
    }

    this.repos.questions.addAttempt(row.id, JSON.stringify(check.parsed), check.correct)
    const attemptsCount = row.attemptsCount + 1
    this.repos.sessions.touch(session.id)

    if (check.correct) {
      this.repos.questions.update(row.id, { status: 'correct', attemptsCount, answeredAt: new Date().toISOString() })
      this.event(session.id, row.id, `Você acertou a questão ${row.position}!`)
      const finished = this.finishIfDone(session)
      if (!finished) this.schedulePregeneration(session)
      const updated = this.repos.questions.get(row.id) as QuestionRow
      return {
        valid: true,
        correct: true,
        question: this.questionDto(updated),
        tutorMessage: null,
        session: this.summary(this.repos.sessions.getForStudent(session.id, studentId) as SessionRow),
        sessionFinished: finished
      }
    }

    this.repos.questions.update(row.id, { attemptsCount })
    this.event(session.id, row.id, `Você respondeu ${formatAnswer(check.parsed)}.`)
    const q = this.generated(row)
    const updatedRow = this.repos.questions.get(row.id) as QuestionRow
    const ctx = this.tutorContext(updatedRow, q, check.parsed)
    const diagnosis = diagnoseAttempt(q, check.parsed)
    const result = await this.tutor(requestId, {
      kind: 'feedback',
      messages: buildFeedbackPrompt(ctx, diagnosis),
      temperature: 0.4,
      maxTokens: 120,
      maxSentences: 2,
      fallback: () => diagnosis,
      ...this.tutorChecks(q, { idea: diagnosis })
    })
    const message = this.repos.messages.insert({
      sessionId: session.id,
      questionId: row.id,
      role: 'tutor',
      kind: 'feedback',
      content: result.text,
      source: result.source,
      modelId: result.source === 'llm' ? this.llm.activeModelId : null
    })
    return {
      valid: true,
      correct: false,
      question: this.questionDto(this.repos.questions.get(row.id) as QuestionRow),
      tutorMessage: toMessageDto(message),
      session: this.summary(session),
      sessionFinished: false
    }
  }

  // ---------------- Ajuda ----------------

  async hint(studentId: string, questionId: string, requestId: string): Promise<TutorReplyDto> {
    const { row, session } = this.pendingQuestion(studentId, questionId)
    const level = Math.min(row.hintsUsed + 1, 3) as HintLevel
    this.repos.questions.update(row.id, { hintsUsed: row.hintsUsed + 1 })
    const studentMessage = this.studentMessage(session.id, row.id, 'hint', 'Me dá uma dica?')
    const q = this.generated(row)
    const ctx = { ...this.tutorContext(row, q, this.lastAttempt(row.id)), hintLevel: level }
    const fallbackHint = q.fallbackHints[level - 1] as string
    const result = await this.tutor(requestId, {
      kind: 'hint',
      messages: buildHintPrompt(ctx, fallbackHint),
      temperature: 0.4,
      maxTokens: 120,
      maxSentences: 2,
      fallback: () => fallbackHint,
      ...this.tutorChecks(q, { idea: fallbackHint })
    })
    return this.reply(session, row.id, studentMessage, 'hint', result, level)
  }

  async rephrase(studentId: string, questionId: string, requestId: string): Promise<TutorReplyDto> {
    const { row, session } = this.pendingQuestion(studentId, questionId)
    const studentMessage = this.studentMessage(session.id, row.id, 'rephrase', 'Não entendi.')
    const q = this.generated(row)
    const result = await this.tutor(requestId, {
      kind: 'rephrase',
      messages: buildRephrasePrompt(row.statement, q.numbers),
      temperature: 0.5,
      maxTokens: 160,
      maxSentences: 6,
      validate: (raw) => validateRephrase(raw, { answer: q.answer, operands: q.numbers, numbers: q.numbers, maxSentences: 6 }),
      prefixProblem: (text) => tutorPrefixProblem(text, { answer: q.answer, operands: q.numbers }),
      fallback: () => rephraseFallback(q)
    })
    return this.reply(session, row.id, studentMessage, 'rephrase', result)
  }

  async example(studentId: string, questionId: string, requestId: string): Promise<TutorReplyDto> {
    const { row, session } = this.pendingQuestion(studentId, questionId)
    const studentMessage = this.studentMessage(session.id, row.id, 'example', 'Me mostra um exemplo parecido?')
    const q = this.generated(row)
    const ex = generateExample(q, this.newSeed())
    const template = findTemplate(q.templateId)
    const result = await this.tutor(requestId, {
      kind: 'example',
      messages: buildExamplePrompt({ ...ex, meaningForKids: template.meaningForKids }),
      temperature: 0.4,
      maxTokens: 220,
      maxSentences: 6,
      fallback: () => exampleFallback(ex),
      // No exemplo valem os números DO EXEMPLO (e a resposta dele); a resposta original continua proibida.
      ...this.tutorChecks(q, { extraNumbers: [...ex.numbers, ...answerNumbers(ex.answer)], allowAnswerPhrase: true })
    })
    return this.reply(session, row.id, studentMessage, 'example', result)
  }

  async chat(studentId: string, questionId: string, text: string, requestId: string): Promise<TutorReplyDto> {
    const clean = text.trim().slice(0, MAX_CHAT_LENGTH)
    if (!clean) throw new LearningError('Mensagem vazia.')
    const { row, session } = this.pendingQuestion(studentId, questionId)
    const history: ChatTurn[] = this.repos.messages
      .listBySession(session.id)
      .filter((m) => m.questionId === row.id && m.role !== 'event')
      .map((m) => ({ from: m.role === 'student' ? 'student' : 'tutor', text: m.content }))
    const studentMessage = this.studentMessage(session.id, row.id, 'chat', clean)
    const q = this.generated(row)
    const level = Math.max(1, Math.min(row.hintsUsed, 3)) as HintLevel
    const ctx = { ...this.tutorContext(row, q, this.lastAttempt(row.id)), hintLevel: level }
    const result = await this.tutor(requestId, {
      kind: 'chat',
      messages: buildChatPrompt(ctx, history, clean),
      temperature: 0.5,
      maxTokens: 120,
      maxSentences: 2,
      fallback: () => fallbackChatReply(level, history.length),
      ...this.tutorChecks(q, { requireQuestion: true })
    })
    return this.reply(session, row.id, studentMessage, 'chat', result)
  }

  callTeacher(studentId: string, questionId: string): HelpActionResultDto {
    return this.closeQuestion(
      studentId,
      questionId,
      'needs_teacher',
      'Avisamos o professor. Enquanto ele não chega, você pode seguir para a próxima questão.'
    )
  }

  skip(studentId: string, questionId: string): HelpActionResultDto {
    return this.closeQuestion(studentId, questionId, 'skipped', 'Tudo bem! Vamos tentar outra questão.')
  }

  // ---------------- Internos ----------------

  private closeQuestion(
    studentId: string,
    questionId: string,
    status: 'skipped' | 'needs_teacher',
    text: string
  ): HelpActionResultDto {
    const { row, session } = this.pendingQuestion(studentId, questionId)
    if (!this.helpOffered(row)) throw new LearningError('Ainda dá para tentar mais um pouco!')
    this.repos.questions.update(row.id, { status, answeredAt: new Date().toISOString() })
    const event = this.event(session.id, row.id, text)
    const finished = this.finishIfDone(session)
    if (!finished) this.schedulePregeneration(session)
    return {
      question: this.questionDto(this.repos.questions.get(row.id) as QuestionRow),
      event: toMessageDto(event),
      session: this.summary(this.repos.sessions.getForStudent(session.id, studentId) as SessionRow),
      sessionFinished: finished
    }
  }

  private async tutor(
    requestId: string | null,
    req: Omit<TutorRequest, 'onStream'> & { kind: TutorKind },
    priority: Priority = 'foreground'
  ): Promise<TutorResult> {
    const llm = await this.llm.generator(priority)
    const modelId = llm ? this.llm.activeModelId : null
    const result = await runTutor(llm, {
      // Em segundo plano o pedido pode esperar na fila; o limite de tempo vale só para a criança.
      timeoutMs: priority === 'foreground' ? 15_000 : undefined,
      totalTimeoutMs: priority === 'foreground' ? (req.kind === 'statement' ? STATEMENT_BUDGET_MS : TUTOR_BUDGET_MS) : undefined,
      maxAttempts: this.attemptsFor(req.kind, modelId),
      ...req,
      onStream: requestId ? (event) => this.emit(requestId, event) : undefined
    })
    if (llm && result.fellBack) console.info(`[tutor] ${req.kind}: texto pronto (${result.problems.join('; ')})`)
    this.repos.logs.insert({
      kind: req.kind,
      modelId,
      latencyMs: result.latencyMs,
      retries: result.retries,
      fellBack: result.fellBack
    })
    return result
  }

  /**
   * Até 3 tentativas (seção 5.4). Se este modelo quase nunca acerta este tipo de texto (ex.: 1B reformulando),
   * tenta só 1 vez: num PC fraco, isso poupa a criança de esperar três gerações para ver o texto pronto.
   */
  private attemptsFor(kind: TutorKind, modelId: string | null): number {
    if (!modelId) return 3
    const recent = this.repos.logs.recent(kind, modelId, 8)
    if (recent.length < 6) return 3
    const successes = recent.filter((r) => !r.fellBack).length
    return successes / recent.length < 0.25 ? 1 : 3
  }

  /**
   * Regras de número por tipo de texto. O tutor só pode citar os números do problema (e seus algarismos
   * e ordens) mais os números da ideia que o código mandou reescrever, e esses precisam continuar lá.
   */
  private tutorChecks(
    q: GeneratedQuestion,
    options: { idea?: string; extraNumbers?: readonly number[]; allowAnswerPhrase?: boolean; requireQuestion?: boolean } = {}
  ): Pick<TutorRequest, 'validate' | 'prefixProblem'> {
    const ideaNumbers = options.idea
      ? extractNumbers(options.idea)
          .filter((n) => n.kind === 'digits')
          .map((n) => n.value)
      : []
    const ctx: TutorTextContext = {
      answer: q.answer,
      operands: q.numbers,
      // Se a ideia do código era uma pergunta, a versão do modelo também tem que ser (método socrático).
      requireQuestion: options.requireQuestion ?? (options.idea ? options.idea.includes('?') : false),
      allowAnswerPhrase: options.allowAnswerPhrase,
      allowedNumbers: [...tutorNumberVocabulary([...q.numbers, ...(options.extraNumbers ?? [])]), ...ideaNumbers],
      requiredNumbers: ideaNumbers,
      maxLength: options.allowAnswerPhrase ? undefined : SHORT_TUTOR_LENGTH
    }
    return {
      validate: (raw) => validateTutorText(raw, ctx),
      prefixProblem: (text) => tutorPrefixProblem(text, ctx)
    }
  }

  private async prepareQuestion(
    session: SessionRow,
    existing: QuestionRow[],
    position: number,
    priority: Priority,
    requestId: string | null,
    signal?: AbortSignal
  ): Promise<Pregenerated> {
    const titleTheme = THEMES.find((t) => session.title.endsWith(`· ${t.label}`))
    const generated = generateQuestion({
      focus: session.focus,
      seed: this.newSeed(),
      avoidTemplateIds: existing.slice(-2).map((q) => q.templateId),
      themeKey: position === 1 ? titleTheme?.key : undefined,
      enabledSkills: this.repos.bncc.enabledCodes()
    })
    // Contas diretas ("Resolva: 753 - 460") não precisam de contexto: o texto do código já é o ideal.
    // Nos testes, o modelo 1B transformava essas contas em frases sem sentido.
    if (findTemplate(generated.templateId).direct) {
      if (requestId) this.emit(requestId, { type: 'text', text: generated.fallbackStatement })
      return { position, generated, statement: generated.fallbackStatement, source: 'fallback' }
    }
    const ctx = statementContext(generated)
    const result = await this.tutor(
      requestId,
      {
        kind: 'statement',
        messages: buildStatementPrompt(generated),
        temperature: 0.5,
        maxTokens: 160,
        validate: (raw) => validateStatement(raw, ctx),
        prefixProblem: (text) => statementPrefixProblem(text, ctx),
        fallback: () => generated.fallbackStatement,
        signal
      },
      priority
    )
    return { position, generated, statement: result.text, source: result.source }
  }

  /** Gera a próxima questão em segundo plano enquanto a criança resolve a atual. */
  private schedulePregeneration(session: SessionRow): void {
    if (this.pregenerating.has(session.id)) return
    const questions = this.repos.questions.listBySession(session.id)
    const nextPosition = questions.length + 1
    if (nextPosition > session.questionsTarget) return
    if (this.pregenerated.get(session.id)?.position === nextPosition) return
    const promise = (async () => {
      try {
        const prepared = await this.prepareQuestion(session, questions, nextPosition, 'background', null)
        this.pregenerated.set(session.id, prepared)
        return prepared
      } catch {
        return null // Pré-geração é só otimização.
      } finally {
        this.pregenerating.delete(session.id)
      }
    })()
    this.pregenerating.set(session.id, { position: nextPosition, promise })
  }

  private reply(
    session: SessionRow,
    questionId: string,
    studentMessage: MessageRow,
    kind: 'hint' | 'rephrase' | 'example' | 'chat',
    result: TutorResult,
    hintLevel?: HintLevel
  ): TutorReplyDto {
    const message = this.repos.messages.insert({
      sessionId: session.id,
      questionId,
      role: 'tutor',
      kind,
      hintLevel: hintLevel ?? null,
      content: result.text,
      source: result.source,
      modelId: result.source === 'llm' ? this.llm.activeModelId : null
    })
    this.repos.sessions.touch(session.id)
    this.schedulePregeneration(session)
    return {
      question: this.questionDto(this.repos.questions.get(questionId) as QuestionRow),
      studentMessage: toMessageDto(studentMessage),
      tutorMessage: toMessageDto(message)
    }
  }

  private studentMessage(sessionId: string, questionId: string, kind: MessageRow['kind'], content: string): MessageRow {
    return this.repos.messages.insert({
      sessionId,
      questionId,
      role: 'student',
      kind,
      content,
      source: 'system'
    })
  }

  private event(sessionId: string, questionId: string | null, content: string): MessageRow {
    return this.repos.messages.insert({ sessionId, questionId, role: 'event', kind: 'event', content, source: 'system' })
  }

  private session(studentId: string, sessionId: string): SessionRow {
    const session = this.repos.sessions.getForStudent(sessionId, studentId)
    if (!session) throw new LearningError('Conversa não encontrada.')
    return session
  }

  private pendingQuestion(studentId: string, questionId: string): { row: QuestionRow; session: SessionRow } {
    const row = this.repos.questions.get(questionId)
    if (!row || row.studentId !== studentId) throw new LearningError('Questão não encontrada.')
    if (row.status !== 'pending') throw new LearningError('Esta questão já foi encerrada.')
    const session = this.session(studentId, row.sessionId)
    return { row, session }
  }

  /** Reconstrói a questão pela seed (mesmo template, mesmo tema, mesmos números). */
  private generated(row: QuestionRow): GeneratedQuestion {
    const cached = this.cache.get(row.id)
    if (cached) return cached
    const rebuilt = rebuildQuestion(row.templateId, row.seed, row.theme)
    // A resposta salva é a fonte da verdade, mesmo que um template mude numa atualização.
    const q = { ...rebuilt, answer: JSON.parse(row.correctAnswerJson) as Answer }
    if (JSON.stringify(rebuilt.params) !== row.paramsJson) {
      console.warn(`[learning] parâmetros reconstruídos diferentes do salvo na questão ${row.id}`)
    }
    this.cache.set(row.id, q)
    return q
  }

  private lastAttempt(questionId: string): Answer | null {
    const attempts = this.repos.questions.listAttempts(questionId)
    const last = attempts[attempts.length - 1]
    return last ? (JSON.parse(last.answerJson) as Answer) : null
  }

  private tutorContext(row: QuestionRow, q: GeneratedQuestion, lastAttempt: Answer | null): TutorContext {
    return {
      statement: row.statement,
      answer: q.answer,
      steps: q.steps,
      lastAttempt,
      hintLevel: Math.max(1, Math.min(row.hintsUsed, 3)) as HintLevel
    }
  }

  private wrongAttempts(questionId: string): number {
    return this.repos.questions.listAttempts(questionId).filter((a) => a.isCorrect === 0).length
  }

  private helpOffered(row: QuestionRow): boolean {
    return row.hintsUsed >= 3 && this.wrongAttempts(row.id) >= MAX_WRONG_BEFORE_HELP
  }

  private questionDto(row: QuestionRow): QuestionDto {
    const answer = JSON.parse(row.correctAnswerJson) as Answer
    return {
      id: row.id,
      position: row.position,
      statement: row.statement,
      statementSource: row.statementSource,
      skillCode: row.skillCode,
      answerKind: answer.kind,
      status: row.status,
      hintsUsed: row.hintsUsed,
      attemptsCount: row.attemptsCount,
      wrongAttempts: this.wrongAttempts(row.id),
      offerHelp: row.status === 'pending' && this.helpOffered(row)
    }
  }

  private summary(session: SessionRow, questions = this.repos.questions.listBySession(session.id)): SessionSummaryDto {
    return {
      id: session.id,
      title: session.title,
      focus: session.focus,
      status: session.status,
      questionsTarget: session.questionsTarget,
      doneCount: questions.filter((q) => q.status !== 'pending').length,
      correctCount: questions.filter((q) => q.status === 'correct').length,
      hintsUsed: questions.reduce((sum, q) => sum + q.hintsUsed, 0),
      lastActivityAt: session.lastActivityAt
    }
  }

  private finishIfDone(session: SessionRow): boolean {
    const done = this.repos.questions.listBySession(session.id).filter((q) => q.status !== 'pending').length
    if (done < session.questionsTarget) return false
    this.finish(session)
    return true
  }

  private finish(session: SessionRow): void {
    if (session.status === 'finished') return
    this.repos.sessions.setStatus(session.id, 'finished')
    this.pregenerated.delete(session.id)
  }
}
