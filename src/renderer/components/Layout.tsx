import { Check, Lock } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { call, errorMessage } from '../lib/api'
import { useApp } from '../store/app'
import { Button } from './Button'
import { Card } from './Card'
import { Logo } from './Decor'
import { TextField } from './Field'

/** Página de adulto: cabeçalho com logo, conteúdo centralizado e rolável. */
export function AdultPage({ children, actions, wide }: { children: ReactNode; actions?: ReactNode; wide?: boolean }) {
  return (
    <div className="flex h-full flex-col">
      <header className="no-print flex items-center justify-between gap-4 px-10 py-5">
        <Logo size={32} />
        <div className="flex items-center gap-2">{actions}</div>
      </header>
      <main className="flex-1 overflow-y-auto px-10 pb-12">
        <div className={`mx-auto ${wide ? 'max-w-6xl' : 'max-w-4xl'}`}>{children}</div>
      </main>
    </div>
  )
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="text-title text-ink">{title}</h1>
      {subtitle && <p className="mt-2 max-w-2xl text-body text-ink-muted">{subtitle}</p>}
    </div>
  )
}

const STEPS = ['Senha', 'Cérebro do app', 'Alunos', 'Pronto']

/** Passos da primeira execução. */
export function Stepper({ current }: { current: number }) {
  return (
    <ol className="mb-8 flex flex-wrap items-center gap-3" aria-label="Passos da configuração">
      {STEPS.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={label} className="flex items-center gap-3" aria-current={active ? 'step' : undefined}>
            <span
              className={[
                'num flex h-9 w-9 items-center justify-center rounded-full text-support font-semibold',
                done ? 'bg-success text-ink' : active ? 'bg-primary text-white' : 'bg-surface-2 text-ink-muted'
              ].join(' ')}
            >
              {done ? <Check aria-hidden className="h-5 w-5" /> : i + 1}
            </span>
            <span className={`text-support font-medium ${active ? 'text-ink' : 'text-ink-muted'}`}>{label}</span>
            {i < STEPS.length - 1 && <span aria-hidden className="h-0.5 w-8 rounded bg-border" />}
          </li>
        )
      })}
    </ol>
  )
}

/** Mostra os filhos só com a área do professor desbloqueada; senão, pede a senha. */
export function TeacherGate({ children, onCancel }: { children: ReactNode; onCancel?: () => void }) {
  const status = useApp((s) => s.status)
  const refreshStatus = useApp((s) => s.refreshStatus)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (status?.teacherUnlocked) return <>{children}</>

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const ok = await call('auth:verifyTeacherPassword', { password })
      if (!ok) {
        setError('Senha incorreta.')
        setPassword('')
      } else {
        await refreshStatus()
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="w-full max-w-md p-8">
        <form onSubmit={submit} className="flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-primary">
              <Lock aria-hidden className="h-7 w-7" strokeWidth={2} />
            </span>
            <div>
              <h1 className="text-[26px] font-bold text-ink">Área do professor</h1>
              <p className="text-support text-ink-muted">Digite a senha para continuar.</p>
            </div>
          </div>
          <TextField
            label="Senha do professor"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error}
          />
          <div className="flex justify-end gap-3">
            {onCancel && (
              <Button variant="ghost" onClick={onCancel}>
                Voltar
              </Button>
            )}
            <Button type="submit" loading={busy} disabled={!password}>
              Entrar
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
