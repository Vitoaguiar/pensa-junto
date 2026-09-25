import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'hint' | 'danger'
export type ButtonSize = 'md' | 'lg'

const VARIANTS: Record<ButtonVariant, string> = {
  // Branco sobre anil: 5,5:1.
  primary: 'bg-primary text-white hover:bg-primary-strong active:bg-primary-strong shadow-soft',
  secondary: 'bg-surface text-ink border-2 border-border hover:border-primary hover:text-primary-strong',
  ghost: 'bg-transparent text-ink-muted hover:bg-surface-2 hover:text-ink',
  // Tinta sobre sol: 8,8:1 (nunca branco sobre amarelo).
  hint: 'bg-hint text-ink hover:brightness-95 shadow-soft',
  danger: 'bg-surface text-danger border-2 border-border hover:border-danger'
}

const SIZES: Record<ButtonSize, string> = {
  md: 'min-h-target px-6 text-button',
  lg: 'min-h-[72px] px-8 text-[22px] font-semibold'
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  iconRight?: ReactNode
  loading?: boolean
  block?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, iconRight, loading, block, className = '', children, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[
        'inline-flex select-none items-center justify-center gap-3 rounded-pill font-semibold',
        'transition-[background-color,border-color,color,transform,filter] duration-200 ease-brand',
        'active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
        VARIANTS[variant],
        SIZES[size],
        block ? 'w-full' : '',
        className
      ].join(' ')}
      {...rest}
    >
      {loading ? <LoaderCircle aria-hidden className="h-6 w-6 animate-spin" strokeWidth={2} /> : icon}
      {children}
      {iconRight}
    </button>
  )
})

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  children: ReactNode
  tone?: 'default' | 'onPrimary'
}

/** Botão só de ícone: sempre com rótulo acessível e alvo de 56px. */
export function IconButton({ label, children, tone = 'default', className = '', ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={[
        'inline-flex h-14 w-14 items-center justify-center rounded-pill transition-colors duration-200 ease-brand disabled:cursor-not-allowed disabled:opacity-40',
        tone === 'default' ? 'text-ink-muted hover:bg-surface-2 hover:text-ink' : 'text-white hover:bg-white/15',
        className
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  )
}
