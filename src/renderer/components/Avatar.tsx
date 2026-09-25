import {
  Bike,
  Bird,
  Cat,
  Crown,
  Dog,
  Fish,
  Flower2,
  Leaf,
  Moon,
  Music,
  Palette,
  Rabbit,
  Rocket,
  Snail,
  Squirrel,
  Star,
  Sun,
  Turtle,
  type LucideIcon
} from 'lucide-react'

export const AVATAR_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  cat: { icon: Cat, label: 'Gato' },
  dog: { icon: Dog, label: 'Cachorro' },
  rabbit: { icon: Rabbit, label: 'Coelho' },
  turtle: { icon: Turtle, label: 'Tartaruga' },
  bird: { icon: Bird, label: 'Passarinho' },
  fish: { icon: Fish, label: 'Peixe' },
  squirrel: { icon: Squirrel, label: 'Esquilo' },
  snail: { icon: Snail, label: 'Caracol' },
  rocket: { icon: Rocket, label: 'Foguete' },
  star: { icon: Star, label: 'Estrela' },
  sun: { icon: Sun, label: 'Sol' },
  moon: { icon: Moon, label: 'Lua' },
  flower: { icon: Flower2, label: 'Flor' },
  leaf: { icon: Leaf, label: 'Folha' },
  music: { icon: Music, label: 'Música' },
  bike: { icon: Bike, label: 'Bicicleta' },
  palette: { icon: Palette, label: 'Paleta' },
  crown: { icon: Crown, label: 'Coroa' }
}

/** Fundo e cor do ícone por cor de avatar. Ícone branco só sobre anil (os outros não passam 3:1 com branco). */
export const AVATAR_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  anil: { bg: 'var(--primary)', fg: '#FFFFFF', label: 'Anil' },
  turquesa: { bg: 'var(--accent)', fg: 'var(--ink)', label: 'Turquesa' },
  sol: { bg: 'var(--hint)', fg: 'var(--ink)', label: 'Sol' },
  menta: { bg: 'var(--success)', fg: 'var(--ink)', label: 'Menta' },
  coral: { bg: 'var(--retry)', fg: 'var(--ink)', label: 'Coral' },
  lilas: { bg: 'var(--lilac)', fg: 'var(--ink)', label: 'Lilás' }
}

export interface AvatarProps {
  avatarKey: string
  colorKey: string
  size?: number
  className?: string
  /** Texto alternativo; sem ele, o avatar é decorativo. */
  label?: string
}

export function Avatar({ avatarKey, colorKey, size = 56, className = '', label }: AvatarProps) {
  const { icon: Icon } = AVATAR_ICONS[avatarKey] ?? AVATAR_ICONS.star!
  const color = AVATAR_COLORS[colorKey] ?? AVATAR_COLORS.anil!
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={['inline-flex shrink-0 items-center justify-center rounded-full', className].join(' ')}
      style={{ width: size, height: size, background: color.bg, color: color.fg }}
    >
      <Icon strokeWidth={2} style={{ width: size * 0.52, height: size * 0.52 }} />
    </span>
  )
}
