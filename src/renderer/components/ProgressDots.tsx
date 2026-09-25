import type { QuestionStatus } from '@shared/types'

export interface ProgressDotsProps {
  total: number
  statuses: QuestionStatus[]
  /** Destaca a questão em andamento. */
  showCurrent?: boolean
  size?: 'sm' | 'md'
}

const LABEL: Record<QuestionStatus, string> = {
  correct: 'resolvida',
  skipped: 'pulada',
  needs_teacher: 'com o professor',
  pending: 'em andamento'
}

/** Progresso da sessão: um ponto por questão. Resolvida = menta; pulada/professor = contorno; atual = anil. */
export function ProgressDots({ total, statuses, showCurrent = true, size = 'md' }: ProgressDotsProps) {
  const done = statuses.filter((s) => s !== 'pending').length
  const dot = size === 'md' ? 'h-4 w-4' : 'h-3 w-3'
  return (
    <div className="flex items-center gap-2" role="img" aria-label={`${done} de ${total} questões`}>
      {Array.from({ length: total }, (_, i) => {
        const status = statuses[i]
        let style: React.CSSProperties = { background: 'var(--surface-2)', border: '2px solid var(--border)' }
        if (status === 'correct') style = { background: 'var(--success)', border: '2px solid var(--success)' }
        else if (status === 'skipped' || status === 'needs_teacher')
          style = { background: 'var(--hint-soft)', border: '2px solid var(--hint)' }
        else if (status === 'pending' && showCurrent)
          style = { background: 'var(--primary)', border: '2px solid var(--primary)', boxShadow: '0 0 0 4px var(--primary-soft)' }
        return <span key={i} title={status ? LABEL[status] : 'a fazer'} className={`${dot} block rounded-full`} style={style} />
      })}
    </div>
  )
}
