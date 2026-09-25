// Estatística e CSV do modo de avaliação. Funções puras (sem electron/fs), testáveis.
// Método inspirado em Monteiro et al. (AIED 2026): "intenção de uso" (TAM) em escala de 1 a 5,
// aprovação = nota ≥ 4, e concordância entre avaliadores.

// ---------------- CSV ----------------

/** CSV no formato do Excel brasileiro: separador ";", BOM UTF-8 e quebras CRLF. */
export function toCsv(rows: ReadonlyArray<ReadonlyArray<string | number>>): string {
  const cell = (v: string | number) => {
    const s = String(v)
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '\uFEFF' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n'
}

/** Lê CSV com ";" ou "," (Excel, LibreOffice, Google Planilhas), aspas e quebras de linha dentro das células. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '')
  const firstLine = src.split(/\r?\n/, 1)[0] ?? ''
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i] as string
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === sep) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

// ---------------- Planilha de avaliação ----------------

export const RATING_HEADER = [
  'ID',
  'Habilidade',
  'Tipo',
  'Problema',
  'Texto para avaliar',
  'Resposta correta',
  'Eu usaria em sala (1-5)',
  'Matemática correta (S/N)',
  'Adequado ao 3º ano (1-5)',
  'Comentário'
] as const

export interface RatingRow {
  itemId: string
  rater: string
  /** Intenção de uso: 1 = discordo totalmente, 5 = concordo totalmente. */
  intention: number | null
  mathCorrect: boolean | null
  adequacy: number | null
  comment: string
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

function scale(value: string | undefined): number | null {
  const m = /^\s*([1-5])\b/.exec(value ?? '')
  return m ? Number(m[1]) : null
}

function yesNo(value: string | undefined): boolean | null {
  const v = fold(value ?? '')
  if (!v) return null
  if (/^(s|sim|y|yes|1|v|verdadeiro)\b/.test(v)) return true
  if (/^(n|nao|no|0|f|falso)\b/.test(v)) return false
  return null
}

/** Lê a planilha preenchida por um avaliador. Linhas sem nenhuma nota são ignoradas. */
export function parseRatings(text: string, rater: string): RatingRow[] {
  const rows = parseCsv(text)
  const header = (rows[0] ?? []).map(fold)
  const col = (prefix: string) => header.findIndex((h) => h.startsWith(prefix))
  const id = col('id')
  const intention = col('eu usaria')
  const math = col('matematica')
  const adequacy = col('adequado')
  const comment = col('coment')
  if (id < 0 || intention < 0) throw new Error('Planilha sem as colunas "ID" e "Eu usaria em sala".')
  return rows
    .slice(1)
    .map((r) => ({
      itemId: (r[id] ?? '').trim(),
      rater,
      intention: scale(r[intention]),
      mathCorrect: math >= 0 ? yesNo(r[math]) : null,
      adequacy: adequacy >= 0 ? scale(r[adequacy]) : null,
      comment: comment >= 0 ? (r[comment] ?? '').trim() : ''
    }))
    .filter((r) => r.itemId && (r.intention !== null || r.mathCorrect !== null || r.adequacy !== null || r.comment))
}

// ---------------- Estatística ----------------

export function mean(values: readonly number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
}

export function median(values: readonly number[]): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2
}

/**
 * Kappa de Fleiss para vários avaliadores. `counts[i][j]` = quantos avaliadores puseram o item i na
 * categoria j. Todos os itens precisam ter o mesmo número de avaliações. Devolve null se não der para calcular.
 */
export function fleissKappa(counts: ReadonlyArray<ReadonlyArray<number>>): number | null {
  if (counts.length < 2) return null
  const n = counts[0]!.reduce((a, b) => a + b, 0)
  if (n < 2 || counts.some((row) => row.reduce((a, b) => a + b, 0) !== n)) return null
  const N = counts.length
  const k = counts[0]!.length
  const p = Array.from({ length: k }, (_, j) => counts.reduce((sum, row) => sum + (row[j] as number), 0) / (N * n))
  const P = counts.map((row) => (row.reduce((sum, c) => sum + c * c, 0) - n) / (n * (n - 1)))
  const Pbar = P.reduce((a, b) => a + b, 0) / N
  const Pe = p.reduce((sum, pj) => sum + pj * pj, 0)
  if (Pe === 1) return Pbar === 1 ? 1 : null
  return (Pbar - Pe) / (1 - Pe)
}

/** Leitura usual do kappa (Landis & Koch, 1977). */
export function kappaLabel(kappa: number | null): string {
  if (kappa === null) return 'não calculável'
  if (kappa < 0) return 'pior que o acaso'
  if (kappa <= 0.2) return 'leve'
  if (kappa <= 0.4) return 'razoável'
  if (kappa <= 0.6) return 'moderada'
  if (kappa <= 0.8) return 'substancial'
  return 'quase perfeita'
}

/** Embaralhamento determinístico (mesma semente = mesma ordem), para a planilha não seguir a ordem dos modelos. */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  let s = seed >>> 0
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j] as T, out[i] as T]
  }
  return out
}
