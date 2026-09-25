import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DbHandle } from './connection'
import { createRepositories, type Repositories } from './repositories'
import { seedBaseline, seedDemo } from './seed'
import { hashPin } from '../security/crypto'

let handle: DbHandle
let repos: Repositories

beforeEach(() => {
  handle = openDatabase(':memory:')
  repos = createRepositories(handle.db)
  seedBaseline(handle, repos)
})

const pepper = () => repos.settings.get('pin_pepper') as string

describe('migrations e seed', () => {
  it('cria todas as tabelas e liga as chaves estrangeiras', () => {
    const tables = (handle.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map(
      (t) => t.name
    )
    for (const t of ['settings', 'llm_models', 'classrooms', 'students', 'bncc_skills', 'sessions', 'questions', 'attempts', 'messages', 'generation_logs']) {
      expect(tables).toContain(t)
    }
    expect(handle.sqlite.pragma('foreign_keys', { simple: true })).toBe(1)
  })

  it('semeia as 5 habilidades BNCC e o pepper, de forma idempotente', () => {
    seedBaseline(handle, repos)
    expect(repos.bncc.list().map((s) => s.code)).toEqual(['EF03MA03', 'EF03MA05', 'EF03MA06', 'EF03MA07', 'EF03MA08'])
    expect(pepper()).toMatch(/^[0-9a-f]{64}$/)
  })

  it('cria os alunos de demonstração com os PINs do enunciado', () => {
    expect(seedDemo(repos)).toBe(true)
    expect(seedDemo(repos)).toBe(false)
    expect(repos.students.findActiveByPinHash(hashPin('1234', pepper()))?.displayName).toBe('Ana')
    expect(repos.students.findActiveByPinHash(hashPin('2468', pepper()))?.displayName).toBe('Bruno')
    expect(repos.students.findActiveByPinHash(hashPin('1357', pepper()))?.displayName).toBe('Caio')
  })
})

describe('alunos', () => {
  it('o PIN é único entre alunos ativos, mas pode ser reaproveitado de um inativo', () => {
    seedDemo(repos)
    const ana = repos.students.findActiveByPinHash(hashPin('1234', pepper()))!
    const base = { classroomId: null, fullName: 'Outra', displayName: 'Outra', grade: 3, avatarKey: 'cat', colorKey: 'lilas' }
    expect(() => repos.students.create({ ...base, pinHash: hashPin('1234', pepper()) })).toThrow()
    repos.students.update(ana.id, { isActive: 0 })
    expect(repos.students.isPinHashTaken(hashPin('1234', pepper()))).toBe(false)
    expect(() => repos.students.create({ ...base, pinHash: hashPin('1234', pepper()) })).not.toThrow()
  })

  it('valida as restrições CHECK', () => {
    expect(() =>
      repos.students.create({
        classroomId: null,
        fullName: 'X',
        displayName: 'X',
        grade: 9,
        pinHash: 'h',
        avatarKey: 'cat',
        colorKey: 'anil'
      })
    ).toThrow()
  })
})

describe('sessões, questões, tentativas e mensagens', () => {
  it('um aluno só vê as próprias sessões', () => {
    seedDemo(repos)
    const [ana, bruno] = repos.students.list()
    const s = repos.sessions.create({ studentId: ana!.id, title: 'Multiplicação · feira', focus: 'mul' })
    expect(repos.sessions.listByStudent(ana!.id)).toHaveLength(1)
    expect(repos.sessions.listByStudent(bruno!.id)).toHaveLength(0)
    expect(repos.sessions.getForStudent(s.id, bruno!.id)).toBeUndefined()
  })

  it('guarda o fluxo completo de uma questão', () => {
    seedDemo(repos)
    const [ana] = repos.students.list()
    const s = repos.sessions.create({ studentId: ana!.id, title: 'Divisão · horta', focus: 'div' })
    const q = repos.questions.insert({
      sessionId: s.id,
      studentId: ana!.id,
      position: 1,
      skillCode: 'EF03MA08',
      templateId: 'div.repartir.v1',
      seed: 42,
      paramsJson: JSON.stringify({ total: 12, divisor: 3 }),
      correctAnswerJson: JSON.stringify({ kind: 'integer', value: 4 }),
      statement: 'Lia tem 12 cenouras e quer dividir entre 3 amigos. Quantas cada um recebe?',
      statementSource: 'fallback',
      theme: 'horta'
    })
    repos.questions.addAttempt(q.id, JSON.stringify({ kind: 'integer', value: 5 }), false)
    repos.questions.update(q.id, { attemptsCount: 1, hintsUsed: 1 })
    repos.messages.insert({ sessionId: s.id, questionId: q.id, role: 'tutor', kind: 'hint', hintLevel: 1, content: 'Pense...', source: 'fallback' })
    repos.messages.insert({ sessionId: s.id, questionId: q.id, role: 'student', kind: 'chat', content: 'oi', source: 'system' })

    expect(repos.questions.listBySession(s.id)[0]).toMatchObject({ attemptsCount: 1, hintsUsed: 1, status: 'pending' })
    expect(repos.questions.listAttempts(q.id)).toHaveLength(1)
    expect(repos.messages.listBySession(s.id).map((m) => m.role)).toEqual(['tutor', 'student'])
    expect(() => repos.messages.insert({ sessionId: s.id, questionId: q.id, role: 'tutor', kind: 'hint', hintLevel: 4, content: 'x', source: 'llm' })).toThrow()
  })

  it('recusa chave estrangeira inválida', () => {
    expect(() => repos.sessions.create({ studentId: 'nao-existe', title: 't', focus: 'mul' })).toThrow()
  })
})

describe('settings, modelos e logs', () => {
  it('faz upsert de configurações', () => {
    repos.settings.set('onboarding_done', '0')
    repos.settings.set('onboarding_done', '1')
    expect(repos.settings.get('onboarding_done')).toBe('1')
  })

  it('registra modelos e métricas de geração', () => {
    const m = repos.models.insert({
      catalogKey: 'llama32-1b',
      displayName: 'Llama 3.2 1B',
      filePath: 'x.gguf',
      fileSizeBytes: 1,
      quantization: 'Q4_K_M',
      source: 'catalog',
      status: 'downloading',
      sha256: null
    })
    repos.models.update(m.id, { status: 'ready' })
    expect(repos.models.findByCatalogKey('llama32-1b')?.status).toBe('ready')
    repos.logs.insert({ kind: 'hint', modelId: m.id, latencyMs: 1200, retries: 0, fellBack: false })
    repos.logs.insert({ kind: 'hint', modelId: m.id, latencyMs: 800, retries: 3, fellBack: true })
    repos.logs.insert({ kind: 'hint', modelId: null, latencyMs: 10, retries: 0, fellBack: true })
    expect(repos.logs.stats()).toEqual([
      { modelId: null, modelName: null, kind: 'hint', total: 1, avgLatencyMs: 10, fallbackPercent: 100 },
      { modelId: m.id, modelName: 'Llama 3.2 1B', kind: 'hint', total: 2, avgLatencyMs: 1000, fallbackPercent: 50 }
    ])
  })
})
