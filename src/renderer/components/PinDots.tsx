import { motion } from 'framer-motion'

export interface PinDotsProps {
  length: number
  filled: number
  error?: boolean
}

export function PinDots({ length, filled, error }: PinDotsProps) {
  return (
    <div className="flex items-center justify-center gap-5" role="status" aria-label={`${filled} de ${length} números digitados`}>
      {Array.from({ length }, (_, i) => {
        const on = i < filled
        return (
          <motion.span
            key={i}
            aria-hidden
            animate={{ scale: on ? 1 : 0.85 }}
            transition={{ type: 'spring', stiffness: 500, damping: 22 }}
            className="block h-7 w-7 rounded-full border-[3px]"
            style={{
              borderColor: error ? 'var(--retry)' : on ? 'var(--primary)' : 'var(--border)',
              background: on ? (error ? 'var(--retry)' : 'var(--primary)') : 'var(--surface)'
            }}
          />
        )
      })}
    </div>
  )
}
