import { ArrowLeft, Printer } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ClassroomDto, StudentWithPinDto } from '@shared/types'
import { Avatar } from '../components/Avatar'
import { Button } from '../components/Button'
import { Logo } from '../components/Decor'
import { SelectField } from '../components/Field'
import { TeacherGate } from '../components/Layout'
import { call, errorMessage } from '../lib/api'
import { useApp } from '../store/app'

/** Cartões de PIN (nome + avatar + PIN) para imprimir e recortar. */
export function PinCardsPrint() {
  const navigate = useNavigate()
  const toast = useApp((s) => s.toast)
  const [classrooms, setClassrooms] = useState<ClassroomDto[]>([])
  const [classroomId, setClassroomId] = useState<string>('')
  const [cards, setCards] = useState<StudentWithPinDto[] | null>(null)
  const unlocked = useApp((s) => s.status?.teacherUnlocked)

  useEffect(() => {
    if (!unlocked) return
    call('classrooms:list').then(setClassrooms, () => undefined)
  }, [unlocked])

  useEffect(() => {
    if (!unlocked) return
    setCards(null)
    call('students:pinCards', { classroomId: classroomId || null }).then(setCards, (err) => toast(errorMessage(err), 'error'))
  }, [classroomId, unlocked, toast])

  return (
    <TeacherGate onCancel={() => navigate('/pin')}>
      <div className="h-full overflow-y-auto bg-bg print:overflow-visible">
        <div className="no-print flex flex-wrap items-end gap-4 px-10 py-6">
          <Button variant="ghost" onClick={() => navigate('/professor')} icon={<ArrowLeft aria-hidden className="h-5 w-5" />}>
            Voltar
          </Button>
          <div className="w-72">
            <SelectField label="Turma" value={classroomId} onChange={(e) => setClassroomId(e.target.value)}>
              <option value="">Todos os alunos ativos</option>
              {classrooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
          </div>
          <Button onClick={() => window.print()} disabled={!cards?.length} icon={<Printer aria-hidden className="h-5 w-5" />}>
            Imprimir
          </Button>
          <p className="basis-full text-support text-ink-muted">Dica: imprima, recorte e guarde os cartões com você. Cada criança só precisa do próprio.</p>
        </div>
        <div className="grid grid-cols-3 gap-4 px-10 pb-10 print:grid-cols-3 print:gap-3 print:px-0">
          {cards?.map(({ student, pin }) => (
            <div
              key={student.id}
              className="flex break-inside-avoid flex-col items-center gap-3 rounded-card border-2 border-dashed border-border bg-surface p-6 text-center"
            >
              <Avatar avatarKey={student.avatarKey} colorKey={student.colorKey} size={72} />
              <p className="text-[24px] font-bold text-ink">{student.displayName}</p>
              <p className="text-support text-ink-muted">Seu código secreto</p>
              <p className="num text-[40px] font-bold tracking-[0.25em] text-primary-strong">{pin}</p>
              <div className="opacity-80">
                <Logo size={20} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </TeacherGate>
  )
}
