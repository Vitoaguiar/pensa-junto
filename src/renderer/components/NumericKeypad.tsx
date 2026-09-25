import { Delete } from 'lucide-react'
import { motion } from 'framer-motion'

export interface NumericKeypadProps {
  onDigit: (digit: string) => void
  onDelete: () => void
  disabled?: boolean
  className?: string
  /** Rótulo do grupo para leitores de tela. */
  label?: string
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

/** Teclado numérico grande (teclas de 64px+), pensado para touch e mouse impreciso. */
export function NumericKeypad({ onDigit, onDelete, disabled, className = '', label = 'Teclado numérico' }: NumericKeypadProps) {
  const key =
    'num flex min-h-key min-w-key items-center justify-center rounded-[16px] bg-surface text-key text-ink shadow-soft ' +
    'transition-colors duration-150 ease-brand hover:bg-primary-soft disabled:opacity-50'
  return (
    <div role="group" aria-label={label} className={['grid grid-cols-3 gap-3', className].join(' ')}>
      {KEYS.map((d) => (
        <motion.button
          key={d}
          type="button"
          whileTap={{ scale: 0.92 }}
          transition={{ duration: 0.15 }}
          className={key}
          disabled={disabled}
          onClick={() => onDigit(d)}
        >
          {d}
        </motion.button>
      ))}
      <span aria-hidden />
      <motion.button type="button" whileTap={{ scale: 0.92 }} className={key} disabled={disabled} onClick={() => onDigit('0')}>
        0
      </motion.button>
      <motion.button
        type="button"
        whileTap={{ scale: 0.92 }}
        className={key + ' text-ink-muted'}
        disabled={disabled}
        onClick={onDelete}
        aria-label="Apagar"
        title="Apagar"
      >
        <Delete aria-hidden strokeWidth={2} className="h-8 w-8" />
      </motion.button>
    </div>
  )
}
