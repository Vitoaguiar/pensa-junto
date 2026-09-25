import type { HTMLAttributes, ReactNode } from 'react'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  padded?: boolean
}

export function Card({ children, padded = true, className = '', ...rest }: CardProps) {
  return (
    <div className={['rounded-card bg-surface shadow-soft', padded ? 'p-6' : '', className].join(' ')} {...rest}>
      {children}
    </div>
  )
}

/** Chip discreto (habilidade BNCC, status...). */
export function Chip({ children, className = '', title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={[
        'inline-flex items-center gap-1.5 rounded-pill bg-surface-2 px-3 py-1 text-support font-medium text-ink-muted',
        className
      ].join(' ')}
    >
      {children}
    </span>
  )
}
