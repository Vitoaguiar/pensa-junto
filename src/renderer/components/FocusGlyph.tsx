import type { Focus } from '@shared/types'

/** Símbolo tipográfico de cada foco, dentro de uma forma geométrica (círculo, quadrado, triângulo...). */
const GLYPHS: Record<Focus, { symbol: string; label: string; bg: string; fg: string; shape: string }> = {
  add_sub: { symbol: '+ −', label: 'Somar e subtrair', bg: 'var(--accent-soft)', fg: 'var(--accent-ink)', shape: 'rounded-full' },
  mul: { symbol: '×', label: 'Multiplicar', bg: 'var(--primary-soft)', fg: 'var(--primary-strong)', shape: 'rounded-[14px]' },
  div: { symbol: '÷', label: 'Dividir', bg: 'var(--hint-soft)', fg: 'var(--hint-ink)', shape: 'rounded-[14px] rotate-45' },
  mixed: { symbol: '✦', label: 'Um pouco de tudo', bg: 'var(--success-soft)', fg: 'var(--success-strong)', shape: 'rounded-full' }
}

export const FOCUS_LABEL: Record<Focus, string> = {
  add_sub: 'Somar e subtrair',
  mul: 'Multiplicar',
  div: 'Dividir',
  mixed: 'Um pouco de tudo'
}

export function FocusGlyph({ focus, size = 56 }: { focus: Focus; size?: number }) {
  const g = GLYPHS[focus]
  return (
    <span aria-hidden className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <span className={`absolute inset-[6%] ${g.shape}`} style={{ background: g.bg }} />
      <span className="relative font-bold leading-none" style={{ color: g.fg, fontSize: size * (focus === 'add_sub' ? 0.34 : 0.5) }}>
        {g.symbol}
      </span>
    </span>
  )
}
