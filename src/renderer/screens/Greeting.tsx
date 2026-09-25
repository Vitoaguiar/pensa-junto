import { motion } from 'framer-motion'
import { useEffect } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { useApp } from '../store/app'

/** Tela breve (800ms) depois do PIN certo: avatar e "Oi, Ana!". */
export function Greeting() {
  const student = useApp((s) => s.student)
  const navigate = useNavigate()

  useEffect(() => {
    const t = setTimeout(() => navigate('/inicio', { replace: true }), 800)
    return () => clearTimeout(t)
  }, [navigate])

  if (!student) return <Navigate to="/pin" replace />
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6">
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 18 }}>
        <Avatar avatarKey={student.avatarKey} colorKey={student.colorKey} size={140} label={`Avatar de ${student.displayName}`} />
      </motion.div>
      <motion.h1
        className="text-[48px] font-bold text-ink"
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.25 }}
      >
        Oi, {student.displayName}!
      </motion.h1>
    </div>
  )
}
