import { motion } from 'framer-motion'
import { Lightbulb, BookOpen, MessageCircleQuestion } from 'lucide-react'
import type { ReactNode } from 'react'

export function TypingDots({ label = 'digitando' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 py-1" role="status" aria-label={label}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          aria-hidden
          className="block h-2.5 w-2.5 rounded-full bg-ink-muted"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
        />
      ))}
    </span>
  )
}

export interface ChatBubbleProps {
  from: 'student' | 'tutor'
  children?: ReactNode
  /** Mostra o indicador "digitando" (streaming ainda sem texto). */
  typing?: boolean
  kind?: 'chat' | 'rephrase' | 'example' | 'feedback'
}

const KIND_LABEL = {
  rephrase: { icon: MessageCircleQuestion, text: 'Com outras palavras' },
  example: { icon: BookOpen, text: 'Exemplo parecido' }
} as const

export function ChatBubble({ from, children, typing, kind = 'chat' }: ChatBubbleProps) {
  const student = from === 'student'
  const tag = kind === 'rephrase' || kind === 'example' ? KIND_LABEL[kind] : null
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
      className={['flex', student ? 'justify-end' : 'justify-start'].join(' ')}
    >
      <div
        className={[
          'max-w-[88%] rounded-[20px] px-5 py-3 text-body',
          student ? 'rounded-br-md bg-primary-soft text-ink' : 'rounded-bl-md bg-surface text-ink shadow-soft'
        ].join(' ')}
      >
        {tag && (
          <span className="mb-1 flex items-center gap-1.5 text-support font-medium text-primary">
            <tag.icon aria-hidden className="h-4 w-4" strokeWidth={2} />
            {tag.text}
          </span>
        )}
        {typing && !children ? <TypingDots /> : children}
      </div>
    </motion.div>
  )
}

export interface HintCardProps {
  level: number
  children?: ReactNode
  typing?: boolean
}

/** Dica: card em "sol" que desliza de baixo, com o nível 1–3. */
export function HintCard({ level, children, typing }: HintCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
      className="rounded-[20px] border-2 border-[#FFB54766] bg-hint-soft px-5 py-4 text-hint-ink"
    >
      <div className="mb-1.5 flex items-center gap-2 text-support font-semibold">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-hint text-ink">
          <Lightbulb aria-hidden className="h-5 w-5" strokeWidth={2} />
        </span>
        Dica {level}/3
        <span className="ml-1 flex gap-1" aria-hidden>
          {[1, 2, 3].map((n) => (
            <span key={n} className="block h-2 w-2 rounded-full" style={{ background: n <= level ? 'var(--hint-ink)' : 'var(--hint)' }} />
          ))}
        </span>
      </div>
      <div className="text-body">{typing && !children ? <TypingDots /> : children}</div>
    </motion.div>
  )
}

/** Marcador de evento na conversa ("Questão 2", "Você acertou!"). */
export function EventLine({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'success' | 'retry' }) {
  const color = tone === 'success' ? 'text-success-strong' : tone === 'retry' ? 'text-ink' : 'text-ink-muted'
  return (
    <div className="flex items-center gap-3 py-1" role="note">
      <span aria-hidden className="h-px flex-1 bg-border" />
      <span className={`text-support font-medium ${color}`}>{children}</span>
      <span aria-hidden className="h-px flex-1 bg-border" />
    </div>
  )
}
