const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })

/** "há 2 dias", "agora há pouco", "ontem". */
export function relativeTime(iso: string, now = Date.now()): string {
  const diffSec = Math.round((new Date(iso).getTime() - now) / 1000)
  const abs = Math.abs(diffSec)
  if (abs < 60) return 'agora há pouco'
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour')
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), 'day')
  return rtf.format(Math.round(diffSec / (86400 * 30)), 'month')
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1).replace('.', ',')} GB`
  return `${Math.round(bytes / 1024 ** 2)} MB`
}

export function formatSpeed(bytesPerSecond: number): string {
  return `${(bytesPerSecond / 1024 ** 2).toFixed(1).replace('.', ',')} MB/s`
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
