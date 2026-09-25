import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Logo } from '../components/Decor'
import { useApp } from '../store/app'

/** Decide a primeira tela: onboarding (primeira execução) ou PIN. */
export function Boot() {
  const navigate = useNavigate()
  const refreshStatus = useApp((s) => s.refreshStatus)

  useEffect(() => {
    let alive = true
    void refreshStatus().then((status) => {
      if (!alive) return
      if (status.onboardingDone) navigate('/pin', { replace: true })
      else if (!status.hasTeacherPassword) navigate('/boas-vindas', { replace: true })
      else navigate('/modelo?onboarding=1', { replace: true })
    })
    return () => {
      alive = false
    }
  }, [navigate, refreshStatus])

  return (
    <div className="flex h-full items-center justify-center">
      <Logo size={56} />
    </div>
  )
}
