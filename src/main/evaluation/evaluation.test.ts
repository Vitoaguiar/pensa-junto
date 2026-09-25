import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { TextGenerator } from '@core/tutor'
import type { EvaluationProgressDto } from '@shared/types'
import { EvaluationService } from './evaluationService'
import { fleissKappa, kappaLabel, parseCsv, parseRatings, seededShuffle, toCsv } from './stats'

describe('CSV', () => {
  it('ida e volta no formato do Excel brasileiro (;, BOM, aspas e quebras de linha)', () => {
    const csv = toCsv([
      ['ID', 'Texto'],
      ['A-001', 'Lia disse "oi"; depois\nfoi embora']
    ])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(parseCsv(csv)).toEqual([
      ['ID', 'Texto'],
      ['A-001', 'Lia disse "oi"; depois\nfoi embora']
    ])
  })

  it('lê a planilha exportada com vírgula (Google Planilhas) e interpreta as notas', () => {
    const text = [
      'ID,Habilidade,Tipo,Problema,Texto para avaliar,Resposta correta,Eu usaria em sala (1-5),Matemática correta (S/N),Adequado ao 3º ano (1-5),Comentário',
      'X-001,EF03MA06,Enunciado,,"Texto, com vírgula",10,5 - concordo,Sim,4,',
      'X-002,EF03MA06,Dica,Prob,Dica,10,2,não,3,confuso',
      'X-003,EF03MA06,Dica,Prob,Dica,10,,,,'
    ].join('\n')
    expect(parseRatings(text, 'Ana')).toEqual([
      { itemId: 'X-001', rater: 'Ana', intention: 5, mathCorrect: true, adequacy: 4, comment: '' },
      { itemId: 'X-002', rater: 'Ana', intention: 2, mathCorrect: false, adequacy: 3, comment: 'confuso' }
    ])
  })
})

describe('estatística', () => {
  it('kappa de Fleiss confere com o exemplo clássico (Fleiss, 1971: κ ≈ 0,210)', () => {
    const counts = [
      [0, 0, 0, 0, 14],
      [0, 2, 6, 4, 2],
      [0, 0, 3, 5, 6],
      [0, 3, 9, 2, 0],
      [2, 2, 8, 1, 1],
      [7, 7, 0, 0, 0],
      [3, 2, 6, 3, 0],
      [2, 5, 3, 2, 2],
      [6, 5, 2, 1, 0],
      [0, 2, 2, 3, 7]
    ]
    expect(fleissKappa(counts)).toBeCloseTo(0.21, 2)
    expect(kappaLabel(0.21)).toBe('razoável')
  })

  it('concordância perfeita e casos não calculáveis', () => {
    expect(fleissKappa([[2, 0], [0, 2], [2, 0]])).toBe(1)
    expect(fleissKappa([[2, 0]])).toBeNull()
    expect(fleissKappa([[2, 0], [1, 0]])).toBeNull()
  })

  it('embaralhamento determinístico', () => {
    const a = seededShuffle([1, 2, 3, 4, 5, 6, 7, 8], 42)
    expect(seededShuffle([1, 2, 3, 4, 5, 6, 7, 8], 42)).toEqual(a)
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})

describe('rodada de avaliação (ponta a ponta)', () => {
  let dir: string
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pj-eval-'))
  })
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  /** "Modelo" que devolve o próprio rascunho enfeitado (enunciado) ou copia a ideia (dica). */
  const fakeModel: TextGenerator = {
    async generate(messages) {
      const last = messages[messages.length - 1]?.content ?? ''
      const draft = /Rascunho: (.*)\n/.exec(last)?.[1]
      if (draft) return `Num dia de sol, ${draft.charAt(0).toLowerCase()}${draft.slice(1)}`
      return /"(.*)"/.exec(last)?.[1] ?? 'Pense no problema. O que ele pede?'
    }
  }

  it('gera às cegas, importa as notas de 3 avaliadores e calcula o relatório', async () => {
    const progress: EvaluationProgressDto[] = []
    const service = new EvaluationService({
      baseDir: dir,
      appVersion: 'teste',
      installedModels: () => [{ id: '00000000-0000-4000-8000-000000000001', name: 'Modelo Falso' }],
      generatorFor: async () => fakeModel,
      emitProgress: (p) => progress.push(p)
    })
    const set = await service.create({
      includeCode: true,
      modelIds: ['00000000-0000-4000-8000-000000000001'],
      kinds: ['statement', 'hint'],
      skills: ['EF03MA06', 'EF03MA07'],
      perSkill: 4
    })
    expect(progress.at(-1)).toMatchObject({ done: 32, total: 32 })

    const folder = service.folderOf(set.code)
    const sheet = fs.readFileSync(path.join(folder, `avaliacao-${set.code}.csv`), 'utf8')
    expect(fs.existsSync(path.join(folder, 'LEIA-ME.txt'))).toBe(true)
    // Às cegas: a planilha não revela a condição.
    expect(sheet).not.toContain('Modelo Falso')
    expect(sheet).not.toContain('código')
    const rows = parseCsv(sheet)
    // 8 questões × 2 condições. Os enunciados diferem (16 itens). As dicas copiadas viram 1 item só,
    // exceto as de 3 frases, que o app corta para 2 na versão do modelo (aí ficam diferentes).
    const statements = rows.filter((r) => r[2] === 'Enunciado').length
    const hints = rows.filter((r) => r[2] === 'Dica').length
    expect(statements).toBe(16)
    expect(hints).toBeGreaterThanOrEqual(8)
    expect(hints).toBeLessThan(16)
    expect(set.items).toBe(statements + hints)

    // Três avaliadores: nota 5 para enunciados "Num dia de sol", 3 para os do código, 4 para as dicas.
    const header = rows[0] as string[]
    const fill = (rater: string, bump: number) => {
      const filled = rows.slice(1).map((r) => {
        const out = [...r]
        const text = r[4] ?? ''
        const base = r[2] === 'Dica' ? 4 : text.startsWith('Num dia de sol') ? 5 : 3
        out[6] = String(Math.min(5, Math.max(1, base + bump)))
        out[7] = 'S'
        out[8] = '4'
        return out
      })
      const file = path.join(dir, `avaliacao-${set.code}-${rater}.csv`)
      fs.writeFileSync(file, toCsv([header, ...filled]))
      return file
    }
    const result = service.importRatings(set.code, [fill('Ana', 0), fill('Bia', 0), fill('Caio', -1)])
    expect(result.errors).toEqual([])
    expect(result.imported.map((i) => i.rater)).toEqual(['Ana', 'Bia', 'Caio'])

    const report = service.report(set.code)
    expect(report.raters).toEqual(['Ana', 'Bia', 'Caio'])
    expect(report.ratedItems).toBe(set.items)
    const [code, model] = report.conditions
    expect(code!.label).toBe('Textos do código (sem modelo)')
    expect(code!.byKind['Enunciado']!.approvalPct).toBe(0) // notas 3, 3, 2
    expect(model!.byKind['Enunciado']!.approvalPct).toBe(100) // notas 5, 5, 4
    expect(model!.byKind['Enunciado']!.modelTextPct).toBe(100)
    expect(model!.overall.mathCorrectPct).toBe(100)
    expect(report.agreement?.items).toBe(set.items)
    expect(fs.readFileSync(report.reportPath, 'utf8')).toContain('Relatório da rodada')
    expect(service.list()[0]).toMatchObject({ code: set.code, raters: 3 })
  })

  it('recusa planilha de outra rodada', async () => {
    const service = new EvaluationService({
      baseDir: dir,
      appVersion: 'teste',
      installedModels: () => [],
      generatorFor: async () => null,
      emitProgress: () => {}
    })
    const set = await service.create({ includeCode: true, modelIds: [], kinds: ['statement'], skills: ['EF03MA08'], perSkill: 2 })
    const other = path.join(dir, 'outra.csv')
    fs.writeFileSync(other, toCsv([['ID', 'Eu usaria em sala (1-5)'], ['ZZZZZ-001', '5']]))
    const result = service.importRatings(set.code, [other])
    expect(result.imported).toEqual([])
    expect(result.errors[0]?.message).toMatch(/nenhuma linha/)
  })
})
