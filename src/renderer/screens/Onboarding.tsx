import { ArrowRight, Brain, KeyRound, Users, WifiOff } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Logo } from '../components/Decor'
import { TextField } from '../components/Field'
import { AdultPage, PageTitle, Stepper, TeacherGate } from '../components/Layout'
import { call, errorMessage } from '../lib/api'
import { useApp } from '../store/app'
import { StudentsManager } from './TeacherArea'

export function Welcome() {
  const navigate = useNavigate()
  const items = [
    { icon: WifiOff, title: 'Funciona sem internet', text: 'Depois de configurado, tudo roda neste computador.' },
    { icon: Brain, title: 'Um tutor que não entrega a resposta', text: 'Ele faz perguntas que ajudam a criança a pensar sozinha.' },
    { icon: Users, title: 'Cada aluno com seu código', text: 'Um PIN de 4 números, sem precisar de e-mail ou senha.' }
  ]
  return (
    <div className="flex h-full items-center justify-center p-10">
      <div className="w-full max-w-3xl">
        <Logo size={48} />
        <h1 className="mt-10 text-[40px] font-bold leading-tight text-ink">Boas-vindas! Vamos deixar tudo pronto para a turma.</h1>
        <p className="mt-3 text-body text-ink-muted">São três passos rápidos: uma senha para você, o cérebro do app e os alunos.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {items.map((it) => (
            <Card key={it.title} className="flex flex-col gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-accent-soft text-accent-ink">
                <it.icon aria-hidden className="h-6 w-6" strokeWidth={2} />
              </span>
              <h2 className="text-[20px] font-semibold text-ink">{it.title}</h2>
              <p className="text-support text-ink-muted">{it.text}</p>
            </Card>
          ))}
        </div>
        <div className="mt-10">
          <Button size="lg" autoFocus onClick={() => navigate('/senha')} iconRight={<ArrowRight aria-hidden className="h-6 w-6" />}>
            Começar
          </Button>
        </div>
      </div>
    </div>
  )
}

export function TeacherPasswordSetup() {
  const navigate = useNavigate()
  const refreshStatus = useApp((s) => s.refreshStatus)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 4) return setError('Use pelo menos 4 caracteres.')
    if (password !== confirm) return setError('As duas senhas não são iguais.')
    setBusy(true)
    try {
      await call('auth:setTeacherPassword', { password })
      await refreshStatus()
      navigate('/modelo?onboarding=1')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdultPage>
      <Stepper current={0} />
      <PageTitle
        title="Crie a senha do professor"
        subtitle="Ela protege a área do professor (alunos, códigos e modelo). As crianças não precisam dela."
      />
      <Card className="max-w-lg p-8">
        <form onSubmit={submit} className="flex flex-col gap-5">
          <TextField
            label="Senha"
            type="password"
            autoFocus
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint="Pelo menos 4 caracteres."
          />
          <TextField
            label="Repita a senha"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={error}
          />
          <div className="flex justify-end">
            <Button type="submit" loading={busy} icon={<KeyRound aria-hidden className="h-5 w-5" />}>
              Salvar senha
            </Button>
          </div>
        </form>
      </Card>
    </AdultPage>
  )
}

export function OnboardingStudents() {
  const navigate = useNavigate()
  const setStatus = useApp((s) => s.setStatus)
  const toast = useApp((s) => s.toast)
  const [busy, setBusy] = useState(false)

  async function finish() {
    setBusy(true)
    try {
      setStatus(await call('app:finishOnboarding'))
      toast('Tudo pronto! As crianças já podem entrar com o código.', 'success')
      navigate('/pin', { replace: true })
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <TeacherGate>
      <AdultPage
        actions={
          <Button onClick={finish} loading={busy} iconRight={<ArrowRight aria-hidden className="h-5 w-5" />}>
            Concluir
          </Button>
        }
      >
        <Stepper current={2} />
        <PageTitle
          title="Cadastre os alunos"
          subtitle="Cada aluno recebe um código de 4 números, gerado automaticamente. Você pode imprimir os cartões depois, na área do professor."
        />
        <StudentsManager />
      </AdultPage>
    </TeacherGate>
  )
}
