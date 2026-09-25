import { Info, Repeat } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../store/app'
import { Avatar } from './Avatar'
import { Button } from './Button'

/** Aviso discreto de modo básico (sem modelo): o app funciona com textos prontos. */
export function BasicModeNotice() {
  const status = useApp((s) => s.status)
  if (!status?.basicMode) return null
  const loading = status.engine.state === 'loading'
  return (
    <div className="no-print pointer-events-none fixed bottom-4 left-4 z-30">
      <p className="flex items-center gap-2 rounded-pill bg-surface px-4 py-2 text-support text-ink-muted shadow-soft">
        <Info aria-hidden className="h-4 w-4" />
        {loading ? 'Preparando o tutor…' : 'Modo básico: usando textos prontos'}
      </p>
    </div>
  )
}

/** Topo das telas da criança: avatar, "Oi, Ana!" e "Trocar de aluno". */
export function StudentHeader({ children }: { children?: ReactNode }) {
  const student = useApp((s) => s.student)
  const navigate = useNavigate()
  return (
    <header className="flex items-center gap-4 px-8 py-4">
      {student && <Avatar avatarKey={student.avatarKey} colorKey={student.colorKey} size={52} />}
      <p className="text-[24px] font-bold text-ink">{student ? `Oi, ${student.displayName}!` : ''}</p>
      <div className="flex flex-1 items-center justify-end gap-3">
        {children}
        <Button variant="secondary" onClick={() => navigate('/pin')} icon={<Repeat aria-hidden className="h-5 w-5" />}>
          Trocar de aluno
        </Button>
      </div>
    </header>
  )
}
