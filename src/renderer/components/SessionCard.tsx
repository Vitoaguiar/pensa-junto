import { ArrowRight, Eye } from 'lucide-react'
import type { SessionSummaryDto } from '@shared/types'
import { relativeTime } from '../lib/format'
import { Button } from './Button'
import { Card } from './Card'
import { FocusGlyph } from './FocusGlyph'
import { ProgressDots } from './ProgressDots'

export interface SessionCardProps {
  session: SessionSummaryDto
  onOpen: () => void
  readOnly?: boolean
}

export function SessionCard({ session, onOpen, readOnly }: SessionCardProps) {
  const statuses = Array.from({ length: session.doneCount }, () => 'correct' as const)
  return (
    <Card className="flex items-center gap-5">
      <FocusGlyph focus={session.focus} />
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[20px] font-semibold text-ink">{session.title}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <ProgressDots total={session.questionsTarget} statuses={statuses} showCurrent={false} size="sm" />
          <span className="num text-support text-ink-muted">
            {session.doneCount} de {session.questionsTarget}
          </span>
          <span className="text-support text-ink-muted">· {relativeTime(session.lastActivityAt)}</span>
        </div>
      </div>
      {readOnly ? (
        <Button variant="secondary" onClick={onOpen} icon={<Eye aria-hidden className="h-5 w-5" />}>
          Ver
        </Button>
      ) : (
        <Button onClick={onOpen} iconRight={<ArrowRight aria-hidden className="h-5 w-5" />}>
          Continuar
        </Button>
      )}
    </Card>
  )
}
