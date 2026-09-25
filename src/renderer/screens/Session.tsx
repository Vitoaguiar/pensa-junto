import { AnimatePresence, motion, useAnimationControls } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Hand,
  House,
  Lightbulb,
  MessageCircleQuestion,
  Send,
  Shuffle,
  Sparkles
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import type { MessageDto, QuestionDto, SessionStateDto, SessionSummaryDto } from '@shared/types'
import { Avatar } from '../components/Avatar'
import { Button } from '../components/Button'
import { Card, Chip } from '../components/Card'
import { ChatBubble, EventLine, HintCard, TypingDots } from '../components/ChatBubble'
import { Celebration } from '../components/Decor'
import { NumericKeypad } from '../components/NumericKeypad'
import { ProgressDots } from '../components/ProgressDots'
import { BasicModeNotice } from '../components/StudentChrome'
import { call, errorMessage, newRequestId, onEvent } from '../lib/api'
import { plural } from '../lib/format'
import { useApp } from '../store/app'

type HelpKind = 'hint' | 'rephrase' | 'example' | 'chat' | 'feedback'

interface PendingTutor {
  requestId: string
  kind: HelpKind
  studentText: string | null
  hintLevel?: number
  text: string
}

type Feedback = { type: 'correct' } | { type: 'wrong' } | { type: 'invalid' } | null

const CHAT_LIMIT = 200
const STUDENT_TEXT: Record<Exclude<HelpKind, 'chat' | 'feedback'>, string> = {
  hint: 'Me dá uma dica?',
  rephrase: 'Não entendi.',
  example: 'Me mostra um exemplo parecido?'
}

export function SessionScreen() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const student = useApp((s) => s.student)
  const toast = useApp((s) => s.toast)

  const [state, setState] = useState<SessionStateDto | null>(null)
  const [statementStream, setStatementStream] = useState<{ requestId: string; text: string } | null>(null)
  const [pending, setPending] = useState<PendingTutor | null>(null)
  const [answer, setAnswer] = useState({ value: '', quotient: '', remainder: '' })
  const [field, setField] = useState<'value' | 'quotient' | 'remainder'>('value')
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [celebrate, setCelebrate] = useState(0)
  const [busy, setBusy] = useState<'answer' | 'next' | 'help' | null>(null)
  const [finished, setFinished] = useState<SessionSummaryDto | null>(null)
  const pop = useAnimationControls()
  const statementReq = useRef<string | null>(null)
  const pendingReq = useRef<string | null>(null)
  const feedbackReq = useRef<string | null>(null)

  // Streaming: só texto já validado chega aqui (o main segura números incompletos e dá "reset" se precisar).
  useEffect(
    () =>
      onEvent('tutor:onToken', ({ requestId, event }) => {
        const text = event.type === 'text' ? event.text : ''
        if (requestId === statementReq.current) setStatementStream({ requestId, text })
        if (requestId === pendingReq.current) setPending((p) => (p && p.requestId === requestId ? { ...p, text } : p))
        // Pergunta automática do tutor depois de um erro.
        if (requestId === feedbackReq.current) setPending({ requestId, kind: 'feedback', studentText: null, text })
      }),
    []
  )

  const loadNext = useCallback(
    async (sessionId: string) => {
      const requestId = newRequestId()
      statementReq.current = requestId
      setStatementStream({ requestId, text: '' })
      setBusy('next')
      setFeedback(null)
      setAnswer({ value: '', quotient: '', remainder: '' })
      setField('value')
      try {
        const next = await call('questions:next', { sessionId, requestId })
        setState(next)
        if (next.session.status === 'finished') setFinished(next.session)
      } catch (err) {
        toast(errorMessage(err))
      } finally {
        statementReq.current = null
        setStatementStream(null)
        setBusy(null)
      }
    },
    [toast]
  )

  useEffect(() => {
    if (!student) return
    let alive = true
    call('sessions:get', { sessionId: id }).then(
      (s) => {
        if (!alive) return
        setState(s)
        if (s.session.status === 'finished') setFinished(s.session)
        else if (!s.current) void loadNext(s.session.id)
      },
      () => navigate('/inicio', { replace: true })
    )
    return () => {
      alive = false
    }
  }, [id, student, navigate, loadNext])

  const current = state?.current ?? null
  const questionClosed = !!current && current.status !== 'pending'
  const canAnswer = !!current && current.status === 'pending' && !busy && !pending

  const updateQuestion = (q: QuestionDto, extra: Partial<SessionStateDto> = {}) =>
    setState((s) =>
      s
        ? {
            ...s,
            ...extra,
            current: q,
            progress: s.progress.map((st, i) => (i === q.position - 1 ? q.status : st))
          }
        : s
    )
  const appendMessages = (...msgs: Array<MessageDto | null | undefined>) =>
    setState((s) => (s ? { ...s, messages: [...s.messages, ...msgs.filter((m): m is MessageDto => !!m)] } : s))

  // ---------- Resposta ----------

  const typeDigit = useCallback(
    (d: string) => {
      if (!canAnswer) return
      setFeedback(null)
      setAnswer((a) => ({ ...a, [field]: (a[field] + d).slice(0, 5) }))
    },
    [canAnswer, field]
  )
  const eraseDigit = useCallback(() => {
    if (!canAnswer) return
    setAnswer((a) => ({ ...a, [field]: a[field].slice(0, -1) }))
  }, [canAnswer, field])

  const submit = useCallback(async () => {
    if (!current || !canAnswer) return
    const input =
      current.answerKind === 'division'
        ? { kind: 'division' as const, quotient: answer.quotient, remainder: answer.remainder }
        : { kind: 'integer' as const, value: answer.value }
    const empty = input.kind === 'integer' ? !input.value : !input.quotient
    if (empty) {
      setFeedback({ type: 'invalid' })
      return
    }
    setBusy('answer')
    const requestId = newRequestId()
    feedbackReq.current = requestId
    try {
      const result = await call('questions:submitAnswer', { questionId: current.id, answer: input, requestId })
      if (!result.valid) {
        setFeedback({ type: 'invalid' })
        return
      }
      if (result.correct) {
        setFeedback({ type: 'correct' })
        setCelebrate((c) => c + 1)
        void pop.start({ scale: [1, 1.035, 1], transition: { type: 'spring', stiffness: 420, damping: 14 } })
        updateQuestion(result.question, { session: result.session })
        const fresh = await call('sessions:get', { sessionId: result.session.id })
        setState((s) => (s ? { ...fresh, current: s.current, progress: fresh.progress } : fresh))
        if (result.sessionFinished) setTimeout(() => setFinished(result.session), 1400)
      } else {
        setFeedback({ type: 'wrong' })
        setAnswer({ value: '', quotient: '', remainder: '' })
        setField(current.answerKind === 'division' ? 'quotient' : 'value')
        const fresh = await call('sessions:get', { sessionId: result.session.id })
        setState(fresh)
      }
    } catch (err) {
      toast(errorMessage(err))
    } finally {
      feedbackReq.current = null
      setPending(null)
      setBusy(null)
    }
  }, [current, canAnswer, answer, toast, pop])

  // Teclado físico: números, apagar e Enter (fora do campo do chat).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if (e.ctrlKey || e.altKey || e.metaKey) return
      if (/^\d$/.test(e.key)) typeDigit(e.key)
      else if (e.key === 'Backspace') eraseDigit()
      else if (e.key === 'Enter' && target?.tagName !== 'BUTTON') void submit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [typeDigit, eraseDigit, submit])

  // ---------- Ajuda ----------

  async function help(kind: Exclude<HelpKind, 'feedback'>, chatText?: string) {
    if (!current || current.status !== 'pending' || pending) return
    const requestId = newRequestId()
    pendingReq.current = requestId
    const hintLevel = kind === 'hint' ? Math.min(current.hintsUsed + 1, 3) : undefined
    setPending({ requestId, kind, studentText: kind === 'chat' ? (chatText ?? '') : STUDENT_TEXT[kind], hintLevel, text: '' })
    setBusy('help')
    try {
      const reply =
        kind === 'hint'
          ? await call('tutor:hint', { questionId: current.id, requestId })
          : kind === 'rephrase'
            ? await call('tutor:rephrase', { questionId: current.id, requestId })
            : kind === 'example'
              ? await call('tutor:example', { questionId: current.id, requestId })
              : await call('tutor:chat', { questionId: current.id, text: chatText ?? '', requestId })
      appendMessages(reply.studentMessage, reply.tutorMessage)
      updateQuestion(reply.question)
    } catch (err) {
      toast(errorMessage(err))
    } finally {
      pendingReq.current = null
      setPending(null)
      setBusy(null)
    }
  }

  async function closeQuestion(action: 'callTeacher' | 'skip') {
    if (!current) return
    setBusy('help')
    try {
      const result =
        action === 'callTeacher'
          ? await call('questions:callTeacher', { questionId: current.id })
          : await call('questions:skip', { questionId: current.id })
      appendMessages(result.event)
      updateQuestion(result.question, { session: result.session })
      if (result.sessionFinished) setFinished(result.session)
      else if (action === 'skip') await loadNext(result.session.id)
    } catch (err) {
      toast(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  // Enquanto a resposta é conferida (e, se errou, o tutor prepara a pergunta), mostra "digitando".
  const awaitingFeedback = busy === 'answer' && !pending

  if (!student) return <Navigate to="/pin" replace />
  if (!state) {
    return (
      <div className="flex h-full items-center justify-center">
        <TypingDots label="Carregando" />
      </div>
    )
  }
  if (finished) return <SessionComplete session={finished} messages={state.messages} />

  const session = state.session
  const nextHintLevel = current ? Math.min(current.hintsUsed + 1, 3) : 1
  const generating = busy === 'next'
  const statementText = generating ? (statementStream?.text ?? '') : (current?.statement ?? '')

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 px-8 py-4">
        <Button variant="ghost" onClick={() => navigate('/inicio')} icon={<ArrowLeft aria-hidden className="h-5 w-5" />}>
          Início
        </Button>
        <div className="flex flex-1 flex-col items-center gap-1">
          <p className="text-support font-medium text-ink-muted">{session.title}</p>
          <ProgressDots total={session.questionsTarget} statuses={state.progress} />
        </div>
        <Avatar avatarKey={student.avatarKey} colorKey={student.colorKey} size={48} label={student.displayName} />
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-y-auto px-8 pb-6 wide:grid-cols-[3fr_2fr] wide:overflow-hidden">
        {/* ---------- Coluna principal ---------- */}
        <section className="flex min-h-0 flex-col gap-5 wide:overflow-y-auto wide:pr-1" aria-label="Questão">
          <motion.div animate={pop} className="relative">
            <Card className="relative p-8">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="num text-support font-semibold text-primary">
                  Questão {current && !generating ? current.position : Math.min(state.progress.length + 1, session.questionsTarget)} de {session.questionsTarget}
                </span>
                {current && !generating && <Chip title="Habilidade da BNCC">{current.skillCode}</Chip>}
              </div>
              {generating && !statementText ? (
                <div className="flex items-center gap-3 py-3 text-statement text-ink-muted" role="status">
                  Pensando numa questão pra você… <TypingDots />
                </div>
              ) : (
                <p className="num text-statement text-ink" aria-live="polite">
                  {statementText}
                </p>
              )}
              {celebrate > 0 && feedback?.type === 'correct' && <Celebration key={celebrate} />}
            </Card>
          </motion.div>

          <div className="flex flex-wrap items-start gap-6">
            <div className="flex min-w-[280px] flex-1 flex-col gap-4">
              {current?.answerKind === 'division' ? (
                <div className="grid grid-cols-2 gap-3">
                  <AnswerBox label="Quanto cada um" value={answer.quotient} active={field === 'quotient'} onSelect={() => setField('quotient')} disabled={!canAnswer} />
                  <AnswerBox label="Quanto sobra" value={answer.remainder} active={field === 'remainder'} onSelect={() => setField('remainder')} disabled={!canAnswer} />
                </div>
              ) : (
                <AnswerBox label="Sua resposta" value={answer.value} active onSelect={() => setField('value')} disabled={!canAnswer} />
              )}

              <FeedbackBanner feedback={feedback} name={student.displayName} />

              {questionClosed ? (
                <Button size="lg" onClick={() => void loadNext(session.id)} loading={busy === 'next'} iconRight={<ArrowRight aria-hidden className="h-6 w-6" />}>
                  Próxima
                </Button>
              ) : (
                <Button size="lg" onClick={() => void submit()} disabled={!canAnswer} loading={busy === 'answer'} icon={<Check aria-hidden className="h-6 w-6" />}>
                  Conferir
                </Button>
              )}
            </div>
            <NumericKeypad onDigit={typeDigit} onDelete={eraseDigit} disabled={!canAnswer} className="w-[288px]" label="Teclado da resposta" />
          </div>

          {current?.offerHelp && !questionClosed ? (
            <Card className="flex flex-wrap items-center gap-4 border-2 border-hint bg-hint-soft">
              <p className="flex-1 text-body text-hint-ink">Essa está difícil, né? Tudo bem! O que você prefere fazer?</p>
              <Button variant="secondary" onClick={() => void closeQuestion('callTeacher')} disabled={!!busy} icon={<Hand aria-hidden className="h-5 w-5" />}>
                Chamar o professor
              </Button>
              <Button onClick={() => void closeQuestion('skip')} disabled={!!busy} icon={<Shuffle aria-hidden className="h-5 w-5" />}>
                Tentar outra questão
              </Button>
            </Card>
          ) : null}

          <div className="flex flex-wrap gap-3" role="group" aria-label="Pedir ajuda">
            <Button
              variant="hint"
              onClick={() => void help('hint')}
              disabled={!canAnswer}
              icon={<Lightbulb aria-hidden className="h-6 w-6" />}
              aria-label={`Me dá uma dica, nível ${nextHintLevel} de 3`}
            >
              Me dá uma dica
              <span className="num rounded-pill bg-surface px-2.5 py-0.5 text-support font-semibold text-hint-ink">{nextHintLevel}/3</span>
            </Button>
            <Button variant="secondary" onClick={() => void help('rephrase')} disabled={!canAnswer} icon={<MessageCircleQuestion aria-hidden className="h-6 w-6" />}>
              Não entendi
            </Button>
            <Button variant="secondary" onClick={() => void help('example')} disabled={!canAnswer} icon={<BookOpen aria-hidden className="h-6 w-6" />}>
              Exemplo parecido
            </Button>
          </div>
        </section>

        {/* ---------- Conversa com o tutor ---------- */}
        <TutorColumn
          messages={state.messages}
          pending={pending}
          awaitingFeedback={awaitingFeedback}
          canChat={canAnswer}
          onSend={(text) => void help('chat', text)}
        />
      </div>
      <BasicModeNotice />
    </div>
  )
}

function AnswerBox(props: { label: string; value: string; active: boolean; onSelect: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={props.onSelect}
      disabled={props.disabled}
      aria-label={`${props.label}: ${props.value || 'vazio'}`}
      aria-pressed={props.active}
      className={[
        'flex min-h-[88px] flex-col items-start justify-center rounded-card border-[3px] bg-surface px-6 text-left shadow-soft transition-colors',
        props.active ? 'border-primary' : 'border-border'
      ].join(' ')}
    >
      <span className="text-support font-medium text-ink-muted">{props.label}</span>
      <span className="num flex h-[44px] items-center text-[40px] font-semibold leading-none text-ink">
        {props.value}
        {props.active && !props.disabled && (
          <motion.span
            aria-hidden
            className="ml-1 inline-block h-9 w-[3px] rounded bg-primary"
            animate={{ opacity: [1, 0, 1] }}
            transition={{ duration: 1.1, repeat: Infinity }}
          />
        )}
      </span>
    </button>
  )
}

function FeedbackBanner({ feedback, name }: { feedback: Feedback; name: string }) {
  return (
    <div aria-live="polite" className="min-h-0">
      <AnimatePresence mode="wait">
        {feedback?.type === 'correct' && (
          <motion.p
            key="ok"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 18 }}
            className="flex items-center gap-3 rounded-card bg-success-soft px-5 py-4 text-[22px] font-semibold text-success-strong"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success text-ink">
              <Check aria-hidden className="h-6 w-6" strokeWidth={3} />
            </span>
            Isso aí, {name}! Você chegou lá.
          </motion.p>
        )}
        {feedback?.type === 'wrong' && (
          <motion.p
            key="retry"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-3 rounded-card bg-retry-soft px-5 py-4 text-[20px] font-semibold text-ink"
          >
            <span aria-hidden className="h-4 w-4 rounded-full bg-retry" />
            Quase! Vamos olhar juntos?
          </motion.p>
        )}
        {feedback?.type === 'invalid' && (
          <motion.p key="invalid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="rounded-card bg-surface-2 px-5 py-3 text-body text-ink">
            Digite um número no teclado para conferir.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}

function MessageView({ m }: { m: MessageDto }) {
  if (m.role === 'event') {
    const tone = m.content.startsWith('Você acertou') ? 'success' : 'muted'
    return <EventLine tone={tone}>{m.content}</EventLine>
  }
  if (m.role === 'student') return <ChatBubble from="student">{m.content}</ChatBubble>
  if (m.kind === 'hint') return <HintCard level={m.hintLevel ?? 1}>{m.content}</HintCard>
  return (
    <ChatBubble from="tutor" kind={m.kind === 'rephrase' || m.kind === 'example' ? m.kind : 'chat'}>
      {m.content}
    </ChatBubble>
  )
}

function TutorColumn(props: {
  messages: MessageDto[]
  pending: PendingTutor | null
  awaitingFeedback: boolean
  canChat: boolean
  onSend: (text: string) => void
}) {
  const [text, setText] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  const { messages, pending, awaitingFeedback } = props

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, pending?.text, awaitingFeedback])

  function send(e: FormEvent) {
    e.preventDefault()
    const clean = text.trim()
    if (!clean || !props.canChat) return
    props.onSend(clean)
    setText('')
  }

  return (
    <aside className="flex h-[520px] min-h-0 flex-col rounded-card bg-surface-2 wide:h-auto" aria-label="Conversa com o tutor">
      <div className="flex items-center gap-3 px-5 pt-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-ink">
          <Sparkles aria-hidden className="h-5 w-5" strokeWidth={2} />
        </span>
        <h2 className="text-[20px] font-semibold text-ink">Pensa comigo</h2>
      </div>
      <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4" role="log" aria-label="Mensagens">
        {messages.length === 0 && !pending && (
          <p className="m-auto max-w-[280px] text-center text-support text-ink-muted">
            Se travar, peça uma dica ou me escreva aqui. Eu não conto a resposta, mas te ajudo a chegar lá!
          </p>
        )}
        {messages.map((m) => (
          <MessageView key={m.id} m={m} />
        ))}
        {pending && (
          <>
            {pending.studentText && <ChatBubble from="student">{pending.studentText}</ChatBubble>}
            <div aria-live="polite">
              {pending.kind === 'hint' ? (
                <HintCard level={pending.hintLevel ?? 1} typing>
                  {pending.text || null}
                </HintCard>
              ) : (
                <ChatBubble from="tutor" typing kind={pending.kind === 'rephrase' || pending.kind === 'example' ? pending.kind : 'chat'}>
                  {pending.text || null}
                </ChatBubble>
              )}
            </div>
          </>
        )}
        {awaitingFeedback && (
          // Aparece com atraso: num acerto a conferência é instantânea e o balão nem chega a surgir.
          <motion.div aria-live="polite" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
            <ChatBubble from="tutor" typing />
          </motion.div>
        )}
      </div>
      <form onSubmit={send} className="flex items-end gap-2 border-t border-border p-3">
        <label className="sr-only" htmlFor="chat-input">
          Escreva para o tutor
        </label>
        <div className="relative flex-1">
          <input
            id="chat-input"
            value={text}
            maxLength={CHAT_LIMIT}
            onChange={(e) => setText(e.target.value.slice(0, CHAT_LIMIT))}
            placeholder="Escreva sua dúvida…"
            disabled={!props.canChat}
            className="min-h-target w-full rounded-pill border-2 border-transparent bg-surface px-5 pr-16 text-body text-ink placeholder:text-ink-muted focus:border-primary disabled:opacity-60"
          />
          <span className="num pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[14px] text-ink-muted">
            {text.length}/{CHAT_LIMIT}
          </span>
        </div>
        <button
          type="submit"
          aria-label="Enviar"
          disabled={!props.canChat || !text.trim()}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white transition-colors hover:bg-primary-strong disabled:opacity-50"
        >
          <Send aria-hidden className="h-6 w-6" strokeWidth={2} />
        </button>
      </form>
    </aside>
  )
}

function SessionComplete({ session, messages }: { session: SessionSummaryDto; messages: MessageDto[] }) {
  const navigate = useNavigate()
  const [showHistory, setShowHistory] = useState(false)
  return (
    <div className="flex h-full flex-col items-center overflow-y-auto px-8 py-12">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        className={`relative w-full max-w-2xl ${showHistory ? '' : 'my-auto'}`}
      >
        <Card className="relative flex flex-col items-center gap-5 p-10 text-center">
          <Celebration />
          <span className="flex h-24 w-24 items-center justify-center rounded-full bg-success-soft">
            <Sparkles aria-hidden className="h-12 w-12 text-success-strong" strokeWidth={2} />
          </span>
          <h1 className="text-title text-ink">Conversa concluída!</h1>
          <p className="text-[24px] text-ink">
            Você resolveu {plural(session.correctCount, 'questão', 'questões')} e usou {plural(session.hintsUsed, 'dica', 'dicas')}!
          </p>
          <ProgressDots total={session.questionsTarget} statuses={Array.from({ length: session.doneCount }, () => 'correct' as const)} showCurrent={false} />
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Button variant="secondary" onClick={() => navigate('/inicio')} icon={<House aria-hidden className="h-5 w-5" />}>
              Voltar ao início
            </Button>
            <Button onClick={() => setShowHistory((v) => !v)} variant="ghost">
              {showHistory ? 'Esconder a conversa' : 'Ver a conversa'}
            </Button>
          </div>
        </Card>
      </motion.div>
      {showHistory && (
        <div className="mt-6 flex w-full max-w-2xl flex-col gap-3" role="log" aria-label="Conversa">
          {messages.map((m) => (
            <MessageView key={m.id} m={m} />
          ))}
        </div>
      )}
    </div>
  )
}
