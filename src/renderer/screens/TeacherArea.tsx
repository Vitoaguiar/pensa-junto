import {
  BarChart3,
  Brain,
  KeyRound,
  LogOut,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  School,
  Trash2,
  UserRoundCheck,
  UserRoundX,
  Users
} from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { StudentInputDto } from '@shared/channels'
import { AVATAR_KEYS, COLOR_KEYS, type ClassroomDto, type GenerationStatsDto, type StudentDto } from '@shared/types'
import { Avatar, AVATAR_COLORS, AVATAR_ICONS } from '../components/Avatar'
import { Button, IconButton } from '../components/Button'
import { Card, Chip } from '../components/Card'
import { EmptyState, Modal } from '../components/Feedback'
import { SelectField, TextField } from '../components/Field'
import { AdultPage, PageTitle, TeacherGate } from '../components/Layout'
import { call, errorMessage } from '../lib/api'
import { useApp } from '../store/app'
import { ModelSetupPanel } from './ModelSetup'

type Tab = 'alunos' | 'turmas' | 'modelo' | 'uso'

const TABS: Array<{ key: Tab; label: string; icon: typeof Users }> = [
  { key: 'alunos', label: 'Alunos', icon: Users },
  { key: 'turmas', label: 'Turmas', icon: School },
  { key: 'modelo', label: 'Modelo', icon: Brain },
  { key: 'uso', label: 'Uso do app', icon: BarChart3 }
]

export function TeacherArea() {
  const navigate = useNavigate()
  const refreshStatus = useApp((s) => s.refreshStatus)
  const [tab, setTab] = useState<Tab>('alunos')
  const [passwordOpen, setPasswordOpen] = useState(false)

  async function leave() {
    await call('auth:lockTeacher')
    await refreshStatus()
    navigate('/pin')
  }

  return (
    <TeacherGate onCancel={() => navigate('/pin')}>
      <AdultPage
        wide
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/professor/cartoes')} icon={<Printer aria-hidden className="h-5 w-5" />}>
              Imprimir cartões de PIN
            </Button>
            <IconButton label="Trocar senha do professor" onClick={() => setPasswordOpen(true)}>
              <KeyRound aria-hidden className="h-6 w-6" />
            </IconButton>
            <Button variant="ghost" onClick={leave} icon={<LogOut aria-hidden className="h-5 w-5" />}>
              Sair
            </Button>
          </>
        }
      >
        <PageTitle title="Área do professor" />
        <div role="tablist" aria-label="Seções" className="mb-8 flex flex-wrap gap-2 rounded-pill bg-surface p-1.5 shadow-soft">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={[
                'flex min-h-target flex-1 items-center justify-center gap-2 rounded-pill px-5 text-[18px] font-semibold transition-colors duration-200',
                tab === t.key ? 'bg-primary text-white' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
              ].join(' ')}
            >
              <t.icon aria-hidden className="h-5 w-5" /> {t.label}
            </button>
          ))}
        </div>
        <div role="tabpanel">
          {tab === 'alunos' && <StudentsManager />}
          {tab === 'turmas' && <ClassroomsManager />}
          {tab === 'modelo' && <ModelSetupPanel />}
          {tab === 'uso' && <StatsPanel />}
        </div>
        <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
      </AdultPage>
    </TeacherGate>
  )
}

// ---------------- Alunos ----------------

const emptyStudent = (classroomId: string | null): StudentInputDto => ({
  fullName: '',
  displayName: '',
  grade: 3,
  avatarKey: 'cat',
  colorKey: 'anil',
  classroomId
})

export function StudentsManager() {
  const toast = useApp((s) => s.toast)
  const [students, setStudents] = useState<StudentDto[]>([])
  const [classrooms, setClassrooms] = useState<ClassroomDto[]>([])
  const [filter, setFilter] = useState<string>('all')
  const [editing, setEditing] = useState<{ id: string | null; data: StudentInputDto } | null>(null)
  const [revealed, setRevealed] = useState<{ student: StudentDto; pin: string } | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([call('students:list'), call('classrooms:list')])
      setStudents(s)
      setClassrooms(c)
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void reload()
  }, [reload])

  const visible = students.filter((s) => filter === 'all' || s.classroomId === filter || (filter === 'none' && !s.classroomId))
  const classroomName = (id: string | null) => classrooms.find((c) => c.id === id)?.name ?? 'Sem turma'

  async function save(data: StudentInputDto) {
    try {
      if (editing?.id) {
        await call('students:update', { id: editing.id, patch: data })
        toast('Aluno atualizado.', 'success')
      } else {
        const created = await call('students:create', data)
        setRevealed(created)
      }
      setEditing(null)
      await reload()
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  async function resetPin(student: StudentDto) {
    try {
      setRevealed(await call('students:resetPin', { id: student.id }))
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  async function toggleActive(student: StudentDto) {
    try {
      const result = await call('students:update', { id: student.id, patch: { isActive: !student.isActive } })
      if ('pin' in result) setRevealed(result)
      toast(student.isActive ? `${student.displayName} foi desativado(a).` : `${student.displayName} voltou para a turma.`, 'success')
      await reload()
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {classrooms.length === 0 && !loading && <QuickClassroom onCreated={reload} />}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="w-72">
          <SelectField label="Mostrar" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">Todas as turmas</option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="none">Sem turma</option>
          </SelectField>
        </div>
        <Button
          onClick={() => setEditing({ id: null, data: emptyStudent(filter !== 'all' && filter !== 'none' ? filter : (classrooms[0]?.id ?? null)) })}
          icon={<Plus aria-hidden className="h-5 w-5" />}
        >
          Adicionar aluno
        </Button>
      </div>

      {!loading && visible.length === 0 ? (
        <EmptyState title="Nenhum aluno por aqui ainda." action={null}>
          Clique em “Adicionar aluno”. O código de 4 números é criado na hora.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((s) => (
            <li key={s.id}>
              <Card className={`flex flex-wrap items-center gap-4 py-4 ${s.isActive ? '' : 'opacity-70'}`}>
                <Avatar avatarKey={s.avatarKey} colorKey={s.colorKey} size={52} />
                <div className="min-w-0 flex-1">
                  <p className="text-[19px] font-semibold text-ink">
                    {s.displayName} <span className="text-support font-normal text-ink-muted">· {s.fullName}</span>
                  </p>
                  <p className="text-support text-ink-muted">
                    {classroomName(s.classroomId)} · {s.grade}º ano
                  </p>
                </div>
                {!s.isActive && <Chip>Desativado</Chip>}
                <IconButton
                  label={`Editar ${s.displayName}`}
                  onClick={() =>
                    setEditing({
                      id: s.id,
                      data: {
                        fullName: s.fullName,
                        displayName: s.displayName,
                        grade: s.grade,
                        avatarKey: s.avatarKey,
                        colorKey: s.colorKey,
                        classroomId: s.classroomId
                      }
                    })
                  }
                >
                  <Pencil aria-hidden className="h-5 w-5" />
                </IconButton>
                {s.isActive && (
                  <Button variant="secondary" onClick={() => resetPin(s)} icon={<RefreshCw aria-hidden className="h-5 w-5" />}>
                    Redefinir PIN
                  </Button>
                )}
                <IconButton label={s.isActive ? `Desativar ${s.displayName}` : `Reativar ${s.displayName}`} onClick={() => toggleActive(s)}>
                  {s.isActive ? <UserRoundX aria-hidden className="h-5 w-5" /> : <UserRoundCheck aria-hidden className="h-5 w-5" />}
                </IconButton>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <StudentForm
          initial={editing.data}
          isNew={!editing.id}
          classrooms={classrooms}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      )}
      <PinReveal
        value={revealed}
        onClose={() => setRevealed(null)}
        onRegenerate={async () => {
          if (revealed) setRevealed(await call('students:resetPin', { id: revealed.student.id }))
        }}
      />
    </div>
  )
}

function StudentForm(props: {
  initial: StudentInputDto
  isNew: boolean
  classrooms: ClassroomDto[]
  onCancel: () => void
  onSave: (data: StudentInputDto) => Promise<void>
}) {
  const [data, setData] = useState(props.initial)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof StudentInputDto>(key: K, value: StudentInputDto[K]) => setData((d) => ({ ...d, [key]: value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    await props.onSave({
      ...data,
      displayName: data.displayName.trim() || data.fullName.trim().split(/\s+/)[0] || ''
    })
    setBusy(false)
  }

  return (
    <Modal
      open
      wide
      title={props.isNew ? 'Novo aluno' : 'Editar aluno'}
      onClose={props.onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={props.onCancel}>
            Cancelar
          </Button>
          <Button type="submit" form="student-form" loading={busy} disabled={!data.fullName.trim()}>
            {props.isNew ? 'Criar e gerar código' : 'Salvar'}
          </Button>
        </>
      }
    >
      <form id="student-form" onSubmit={submit} className="grid gap-5 md:grid-cols-2">
        <TextField label="Nome completo" value={data.fullName} maxLength={80} onChange={(e) => set('fullName', e.target.value)} required />
        <TextField
          label="Como o app chama a criança"
          value={data.displayName}
          maxLength={24}
          placeholder={data.fullName.trim().split(/\s+/)[0] || 'Ex.: Ana'}
          onChange={(e) => set('displayName', e.target.value)}
          hint="Aparece na tela: “Oi, Ana!”"
        />
        <SelectField label="Ano" value={data.grade} onChange={(e) => set('grade', Number(e.target.value))}>
          {[1, 2, 3, 4, 5].map((g) => (
            <option key={g} value={g}>
              {g}º ano
            </option>
          ))}
        </SelectField>
        <SelectField label="Turma" value={data.classroomId ?? ''} onChange={(e) => set('classroomId', e.target.value || null)}>
          <option value="">Sem turma</option>
          {props.classrooms.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <fieldset className="md:col-span-2">
          <legend className="mb-2 text-support font-semibold text-ink">Avatar</legend>
          <div className="flex flex-wrap gap-2">
            {AVATAR_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={data.avatarKey === key}
                aria-label={AVATAR_ICONS[key]?.label}
                onClick={() => set('avatarKey', key)}
                className={`rounded-full p-1 transition-shadow ${data.avatarKey === key ? 'ring-[3px] ring-primary' : ''}`}
              >
                <Avatar avatarKey={key} colorKey={data.colorKey} size={48} />
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="md:col-span-2">
          <legend className="mb-2 text-support font-semibold text-ink">Cor</legend>
          <div className="flex flex-wrap gap-3">
            {COLOR_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={data.colorKey === key}
                aria-label={AVATAR_COLORS[key]?.label}
                title={AVATAR_COLORS[key]?.label}
                onClick={() => set('colorKey', key)}
                className={`h-14 w-14 rounded-full border-4 transition-transform ${data.colorKey === key ? 'scale-110 border-ink' : 'border-surface'}`}
                style={{ background: AVATAR_COLORS[key]?.bg }}
              />
            ))}
          </div>
        </fieldset>
      </form>
    </Modal>
  )
}

/** O PIN aparece uma única vez, grande, com a opção "Gerar outro". */
function PinReveal(props: {
  value: { student: StudentDto; pin: string } | null
  onClose: () => void
  onRegenerate: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const v = props.value
  return (
    <Modal
      open={!!v}
      title="Código secreto do aluno"
      onClose={props.onClose}
      footer={
        <>
          <Button
            variant="secondary"
            loading={busy}
            onClick={async () => {
              setBusy(true)
              await props.onRegenerate()
              setBusy(false)
            }}
            icon={<RefreshCw aria-hidden className="h-5 w-5" />}
          >
            Gerar outro
          </Button>
          <Button onClick={props.onClose}>Pronto</Button>
        </>
      }
    >
      {v && (
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <Avatar avatarKey={v.student.avatarKey} colorKey={v.student.colorKey} size={72} />
          <p className="text-body text-ink">
            O código de <strong>{v.student.displayName}</strong> é:
          </p>
          <p className="num rounded-card bg-primary-soft px-10 py-4 text-[56px] font-bold tracking-[0.3em] text-primary-strong" aria-live="polite">
            {v.pin}
          </p>
          <p className="text-support text-ink-muted">Anote agora ou imprima os cartões depois. Por segurança, ele não fica visível no app.</p>
        </div>
      )}
    </Modal>
  )
}

// ---------------- Turmas ----------------

function QuickClassroom({ onCreated }: { onCreated: () => Promise<void> }) {
  const toast = useApp((s) => s.toast)
  const [name, setName] = useState('3º ano A')
  async function create(e: FormEvent) {
    e.preventDefault()
    try {
      await call('classrooms:create', { name: name.trim(), grade: 3, schoolYear: new Date().getFullYear() })
      await onCreated()
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }
  return (
    <Card className="bg-accent-soft">
      <form onSubmit={create} className="flex flex-wrap items-end gap-4">
        <div className="min-w-[260px] flex-1">
          <TextField label="Crie a primeira turma (opcional)" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button type="submit" disabled={!name.trim()} icon={<Plus aria-hidden className="h-5 w-5" />}>
          Criar turma
        </Button>
      </form>
    </Card>
  )
}

function ClassroomsManager() {
  const toast = useApp((s) => s.toast)
  const [classrooms, setClassrooms] = useState<ClassroomDto[]>([])
  const [editing, setEditing] = useState<ClassroomDto | null>(null)

  const reload = useCallback(async () => {
    try {
      setClassrooms(await call('classrooms:list'))
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }, [toast])

  useEffect(() => {
    void reload()
  }, [reload])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!editing) return
    try {
      if (editing.id) await call('classrooms:update', editing)
      else await call('classrooms:create', { name: editing.name, grade: editing.grade, schoolYear: editing.schoolYear })
      setEditing(null)
      await reload()
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  async function remove(c: ClassroomDto) {
    try {
      await call('classrooms:delete', { id: c.id })
      toast(`Turma ${c.name} removida.`, 'success')
      await reload()
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button
          onClick={() => setEditing({ id: '', name: '', grade: 3, schoolYear: new Date().getFullYear() })}
          icon={<Plus aria-hidden className="h-5 w-5" />}
        >
          Nova turma
        </Button>
      </div>
      {classrooms.length === 0 ? (
        <EmptyState title="Nenhuma turma criada." />
      ) : (
        classrooms.map((c) => (
          <Card key={c.id} className="flex items-center gap-4 py-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-primary-soft text-primary">
              <School aria-hidden className="h-6 w-6" />
            </span>
            <div className="flex-1">
              <p className="text-[19px] font-semibold text-ink">{c.name}</p>
              <p className="num text-support text-ink-muted">
                {c.grade}º ano · {c.schoolYear}
              </p>
            </div>
            <IconButton label={`Editar ${c.name}`} onClick={() => setEditing(c)}>
              <Pencil aria-hidden className="h-5 w-5" />
            </IconButton>
            <IconButton label={`Remover ${c.name}`} onClick={() => remove(c)}>
              <Trash2 aria-hidden className="h-5 w-5" />
            </IconButton>
          </Card>
        ))
      )}
      <Modal
        open={!!editing}
        title={editing?.id ? 'Editar turma' : 'Nova turma'}
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button type="submit" form="classroom-form" disabled={!editing?.name.trim()}>
              Salvar
            </Button>
          </>
        }
      >
        {editing && (
          <form id="classroom-form" onSubmit={save} className="flex flex-col gap-4">
            <TextField label="Nome" placeholder="Ex.: 3º ano B" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <SelectField label="Ano" value={editing.grade} onChange={(e) => setEditing({ ...editing, grade: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5].map((g) => (
                <option key={g} value={g}>
                  {g}º ano
                </option>
              ))}
            </SelectField>
            <TextField
              label="Ano letivo"
              type="number"
              value={editing.schoolYear}
              onChange={(e) => setEditing({ ...editing, schoolYear: Number(e.target.value) })}
            />
          </form>
        )}
      </Modal>
    </div>
  )
}

// ---------------- Senha e métricas ----------------

function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useApp((s) => s.toast)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      await call('auth:setTeacherPassword', { password })
      toast('Senha trocada.', 'success')
      setPassword('')
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }
  return (
    <Modal
      open={open}
      title="Trocar senha do professor"
      onClose={onClose}
      footer={
        <Button type="submit" form="password-form" disabled={password.length < 4}>
          Salvar
        </Button>
      }
    >
      <form id="password-form" onSubmit={submit}>
        <TextField label="Nova senha" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} hint="Pelo menos 4 caracteres." error={error} />
      </form>
    </Modal>
  )
}

const KIND_LABEL: Record<string, string> = {
  statement: 'Enunciados',
  hint: 'Dicas',
  rephrase: '"Não entendi"',
  example: 'Exemplos parecidos',
  chat: 'Conversa',
  feedback: 'Perguntas após erro'
}

function StatsPanel() {
  const toast = useApp((s) => s.toast)
  const [stats, setStats] = useState<GenerationStatsDto[] | null>(null)
  useEffect(() => {
    call('app:stats').then(setStats, (err) => toast(errorMessage(err), 'error'))
  }, [toast])
  if (!stats) return null
  if (stats.length === 0) return <EmptyState title="Ainda não há uso registrado." />
  return (
    <Card padded={false} className="overflow-hidden">
      <table className="num w-full text-left text-body">
        <caption className="px-6 pt-5 text-left text-support text-ink-muted">
          Tempo médio de cada tipo de texto e quantas vezes o app usou o texto pronto (fallback) em vez do modelo.
        </caption>
        <thead>
          <tr className="border-b border-border text-support text-ink-muted">
            <th className="px-6 py-3 font-semibold">Tipo</th>
            <th className="px-6 py-3 font-semibold">Quantidade</th>
            <th className="px-6 py-3 font-semibold">Tempo médio</th>
            <th className="px-6 py-3 font-semibold">Texto pronto</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s) => (
            <tr key={s.kind} className="border-b border-border last:border-0">
              <td className="px-6 py-3 font-medium text-ink">{KIND_LABEL[s.kind] ?? s.kind}</td>
              <td className="px-6 py-3">{s.total}</td>
              <td className="px-6 py-3">{(s.avgLatencyMs / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}s</td>
              <td className="px-6 py-3">{s.fallbackPercent.toLocaleString('pt-BR')}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
