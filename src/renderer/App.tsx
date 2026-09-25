import { AnimatePresence, motion } from 'framer-motion'
import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { BackgroundShapes } from './components/Decor'
import { ToastHost } from './components/Feedback'
import { onEvent } from './lib/api'
import { Boot } from './screens/Boot'
import { Greeting } from './screens/Greeting'
import { ModelSetupScreen } from './screens/ModelSetup'
import { OnboardingStudents, TeacherPasswordSetup, Welcome } from './screens/Onboarding'
import { PinCardsPrint } from './screens/PinCardsPrint'
import { PinLogin } from './screens/PinLogin'
import { SessionScreen } from './screens/Session'
import { StudentHome } from './screens/StudentHome'
import { TeacherArea } from './screens/TeacherArea'
import { useApp } from './store/app'

export function App() {
  const location = useLocation()
  const setStatus = useApp((s) => s.setStatus)
  const navigate = useNavigate()

  useEffect(() => onEvent('app:onStatus', setStatus), [setStatus])

  // Atalho de teclado para a área do professor: Ctrl+Shift+P (além da engrenagem na tela de PIN).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'p') navigate('/professor')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  return (
    <div className="relative h-full">
      <BackgroundShapes />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location.pathname.split('/')[1] ?? ''}
          className="h-full"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <Routes location={location}>
            <Route path="/" element={<Boot />} />
            <Route path="/boas-vindas" element={<Welcome />} />
            <Route path="/senha" element={<TeacherPasswordSetup />} />
            <Route path="/modelo" element={<ModelSetupScreen />} />
            <Route path="/alunos-iniciais" element={<OnboardingStudents />} />
            <Route path="/pin" element={<PinLogin />} />
            <Route path="/oi" element={<Greeting />} />
            <Route path="/inicio" element={<StudentHome />} />
            <Route path="/sessao/:id" element={<SessionScreen />} />
            <Route path="/professor" element={<TeacherArea />} />
            <Route path="/professor/cartoes" element={<PinCardsPrint />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </motion.div>
      </AnimatePresence>
      <ToastHost />
    </div>
  )
}
