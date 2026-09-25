import { motion, useAnimationControls } from 'framer-motion'
import { Settings, Maximize } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconButton } from '../components/Button'
import { Logo } from '../components/Decor'
import { NumericKeypad } from '../components/NumericKeypad'
import { PinDots } from '../components/PinDots'
import { BasicModeNotice } from '../components/StudentChrome'
import { call } from '../lib/api'
import { useApp } from '../store/app'

const PIN_LENGTH = 4

export function PinLogin() {
  const navigate = useNavigate()
  const setStudent = useApp((s) => s.setStudent)
  const refreshStatus = useApp((s) => s.refreshStatus)
  const [pin, setPin] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [lockedFor, setLockedFor] = useState(0)
  const [checking, setChecking] = useState(false)
  const shake = useAnimationControls()
  const checkingRef = useRef(false)

  useEffect(() => {
    void refreshStatus()
    void call('auth:logoutStudent')
    setStudent(null)
  }, [refreshStatus, setStudent])

  // Contagem visível da espera depois de 5 erros.
  useEffect(() => {
    if (lockedFor <= 0) return
    const t = setTimeout(() => setLockedFor((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [lockedFor])

  const verify = useCallback(
    async (value: string) => {
      if (checkingRef.current) return
      checkingRef.current = true
      setChecking(true)
      try {
        const result = await call('auth:verifyPin', { pin: value })
        if (result.ok) {
          setStudent(result.student)
          navigate('/oi')
          return
        }
        updatePin('')
        void shake.start({ x: [0, -14, 14, -10, 10, -5, 5, 0], transition: { duration: 0.4 } })
        if (result.reason === 'locked') {
          setLockedFor(result.retryInSeconds)
          setMessage(null)
        } else {
          setMessage('Hmm, esse código não é de ninguém. Tenta de novo?')
        }
      } catch {
        updatePin('')
        setMessage('Não consegui conferir agora. Tenta de novo?')
      } finally {
        checkingRef.current = false
        setChecking(false)
      }
    },
    [navigate, setStudent, shake]
  )

  const pinRef = useRef('')
  const updatePin = (value: string) => {
    pinRef.current = value
    setPin(value)
  }

  const press = useCallback(
    (digit: string) => {
      if (lockedFor > 0 || checkingRef.current || pinRef.current.length >= PIN_LENGTH) return
      setMessage(null)
      const next = pinRef.current + digit
      updatePin(next)
      // Ao completar os 4 dígitos, valida sozinho (sem botão "entrar").
      if (next.length === PIN_LENGTH) void verify(next)
    },
    [lockedFor, verify]
  )
  const erase = useCallback(() => updatePin(pinRef.current.slice(0, -1)), [])

  // Também aceita o teclado físico.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return
      if (/^\d$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') erase()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [press, erase])

  const locked = lockedFor > 0

  return (
    <div className="relative flex h-full flex-col">
      <header className="flex items-center justify-between px-8 py-5">
        <Logo size={32} />
        <div className="flex items-center gap-1">
          <IconButton label="Tela cheia (F11)" onClick={() => void call('app:toggleFullscreen')}>
            <Maximize aria-hidden className="h-6 w-6" />
          </IconButton>
          <IconButton label="Área do professor" onClick={() => navigate('/professor')}>
            <Settings aria-hidden className="h-6 w-6" />
          </IconButton>
        </div>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-8 pb-10">
        <h1 className="text-center text-[36px] font-bold text-ink">Oi! Digite seu código secreto</h1>
        <motion.div animate={shake}>
          <PinDots length={PIN_LENGTH} filled={pin.length} error={!!message || locked} />
        </motion.div>
        <div className="min-h-[56px] text-center" aria-live="polite">
          {locked ? (
            <p className="rounded-pill bg-retry-soft px-6 py-3 text-body text-ink">
              Vamos respirar um pouquinho. Tente de novo em <strong className="num">{lockedFor}</strong> segundos.
            </p>
          ) : message ? (
            <p className="rounded-pill bg-retry-soft px-6 py-3 text-body text-ink">{message}</p>
          ) : null}
        </div>
        <NumericKeypad onDigit={press} onDelete={erase} disabled={locked || checking} label="Teclado do código" className="w-[300px]" />
      </main>
      <BasicModeNotice />
    </div>
  )
}
