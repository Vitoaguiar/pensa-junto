import type { Rng } from './types'

/** PRNG mulberry32: rápido, determinístico e suficiente para sortear questões. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    seed: seed >>> 0,
    next,
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1))
    },
    pick(items) {
      if (items.length === 0) throw new Error('pick() em lista vazia')
      return items[Math.floor(next() * items.length)] as (typeof items)[number]
    }
  }
}

/** Hash FNV-1a de 32 bits, para derivar sub-seeds estáveis (ex.: seed + id do template). */
export function hashString(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function deriveSeed(seed: number, salt: string): number {
  return hashString(`${seed >>> 0}:${salt}`)
}

/** Seed nova a partir de uma fonte de entropia externa (o chamador fornece, o core não usa crypto). */
export function seedFrom(random: () => number): number {
  return Math.floor(random() * 4294967296) >>> 0
}
