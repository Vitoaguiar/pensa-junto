import { motion, useReducedMotion } from 'framer-motion'
import { useLocation } from 'react-router-dom'

/** Posições das formas por "página", para um leve parallax ao trocar de tela. */
function offsets(path: string): [number, number, number] {
  let h = 0
  for (const ch of path.split('/')[1] ?? '') h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return [(h % 7) - 3, ((h >> 3) % 7) - 3, ((h >> 6) % 7) - 3]
}

/**
 * Decoração de fundo: 3 formas geométricas grandes (círculo, quadrado arredondado, triângulo) em tons suaves,
 * parcialmente fora da tela. Conversam com a matemática sem competir com o conteúdo.
 */
export function BackgroundShapes() {
  const { pathname } = useLocation()
  const reduce = useReducedMotion()
  const [a, b, c] = offsets(pathname)
  const spring = { type: 'spring' as const, stiffness: 60, damping: 18 }
  return (
    <div aria-hidden className="no-print pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <motion.div
        className="absolute -left-40 -top-40 h-[420px] w-[420px] rounded-full bg-primary-soft"
        animate={reduce ? undefined : { x: a * 14, y: b * 10 }}
        transition={spring}
      />
      <motion.div
        className="absolute -bottom-32 -right-24 h-[340px] w-[340px] rounded-[64px] bg-accent-soft"
        animate={reduce ? { rotate: 18 } : { x: b * -12, y: c * 10, rotate: 18 + c * 3 }}
        transition={spring}
      />
      <motion.div
        className="absolute -right-10 top-24 h-0 w-0 opacity-70"
        style={{
          borderLeft: '90px solid transparent',
          borderRight: '90px solid transparent',
          borderBottom: '156px solid var(--primary-soft)'
        }}
        animate={reduce ? { rotate: -12 } : { x: c * 10, y: a * -8, rotate: -12 + a * 4 }}
        transition={spring}
      />
    </div>
  )
}

const SHAPE_COLORS = ['var(--primary)', 'var(--accent)', 'var(--hint)', 'var(--success)', 'var(--retry)', 'var(--lilac)']

/** Acerto: 8 formas geométricas coloridas saindo do card (até 800ms). Desligado com movimento reduzido. */
export function Celebration() {
  const reduce = useReducedMotion()
  if (reduce) return null
  return (
    <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 z-10">
      {Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2 + 0.3
        const distance = 150 + (i % 3) * 40
        const kind = i % 3
        const color = SHAPE_COLORS[i % SHAPE_COLORS.length]
        const style: React.CSSProperties =
          kind === 2
            ? { width: 0, height: 0, borderLeft: '9px solid transparent', borderRight: '9px solid transparent', borderBottom: `16px solid ${color}` }
            : { width: 16, height: 16, background: color, borderRadius: kind === 0 ? 999 : 4 }
        return (
          <motion.span
            key={i}
            className="absolute block"
            style={style}
            initial={{ x: 0, y: 0, opacity: 1, scale: 0.4, rotate: 0 }}
            animate={{ x: Math.cos(angle) * distance, y: Math.sin(angle) * distance * 0.7, opacity: 0, scale: 1.1, rotate: 160 }}
            transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
          />
        )
      })}
    </div>
  )
}

/** Logotipo: três formas (círculo, quadrado, triângulo) + nome. */
export function Logo({ size = 40 }: { size?: number }) {
  const s = size / 40
  return (
    <span className="inline-flex items-center gap-3">
      <span aria-hidden className="relative inline-block" style={{ width: 44 * s, height: 40 * s }}>
        <span className="absolute left-0 top-2 rounded-full bg-primary" style={{ width: 22 * s, height: 22 * s, top: 14 * s }} />
        <span className="absolute rounded-[5px] bg-accent" style={{ width: 18 * s, height: 18 * s, left: 16 * s, top: 0 }} />
        <span
          className="absolute"
          style={{
            left: 24 * s,
            top: 18 * s,
            width: 0,
            height: 0,
            borderLeft: `${10 * s}px solid transparent`,
            borderRight: `${10 * s}px solid transparent`,
            borderBottom: `${18 * s}px solid var(--hint)`
          }}
        />
      </span>
      <span className="font-bold text-ink" style={{ fontSize: 24 * s }}>
        Pensa Junto
      </span>
    </span>
  )
}
