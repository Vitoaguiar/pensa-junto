import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'

const control =
  'w-full min-h-target rounded-input border-2 border-transparent bg-surface-2 px-4 text-body text-ink ' +
  'placeholder:text-ink-muted transition-colors duration-150 focus:border-primary focus:bg-surface'

interface FieldShellProps {
  label: string
  hint?: ReactNode
  error?: string | null
  children: (id: string, describedBy: string | undefined) => ReactNode
}

function FieldShell({ label, hint, error, children }: FieldShellProps) {
  const id = useId()
  const hintId = hint || error ? `${id}-hint` : undefined
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-support font-semibold text-ink">
        {label}
      </label>
      {children(id, hintId)}
      {(hint || error) && (
        <p id={hintId} className={`text-support ${error ? 'font-medium text-danger' : 'text-ink-muted'}`}>
          {error || hint}
        </p>
      )}
    </div>
  )
}

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: ReactNode
  error?: string | null
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, className = '', ...rest },
  ref
) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      {(id, describedBy) => (
        <input
          ref={ref}
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={`${control} ${className}`}
          {...rest}
        />
      )}
    </FieldShell>
  )
})

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  hint?: ReactNode
  children: ReactNode
}

export function SelectField({ label, hint, children, className = '', ...rest }: SelectFieldProps) {
  return (
    <FieldShell label={label} hint={hint}>
      {(id, describedBy) => (
        <select id={id} aria-describedby={describedBy} className={`${control} ${className}`} {...rest}>
          {children}
        </select>
      )}
    </FieldShell>
  )
}
