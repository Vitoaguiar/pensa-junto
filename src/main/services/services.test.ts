import { beforeEach, describe, expect, it } from 'vitest'
import type { TextGenerator } from '@core/tutor'
import { validateTutorText } from '@core/validation'
import type { Answer } from '@core/types'
import { openDatabase, type DbHandle } from '../db/connection'
import { createRepositories, type Repositories } from '../db/repositories'
import { seedBaseline, seedDemo } from '../db/seed'
import { isObviousPin } from '../security/crypto'
import { AuthService, MAX_PIN_FAILURES } from './auth'
import { exampleFallback, LearningService, rephraseFallback, type LlmProvider } from './learning'
import { ALL_TEMPLATES } from '@core/templates'
import { generateExample, instantiate } from '@core/generator'
import { validateRephrase } from '@core/validation'
import { StudentsService } from './students'

let handle: DbHandle
let repos: Repositories

beforeEach(() => {
  handle = openDatabase(':memory:')
  repos = createRepositories(handle.db)
  seedBaseline(handle, repos)
  seedDemo(repos)
})

const noModel: LlmProvider = { generator: async () => null, activeModelId: null }

/** Modelo "malcriado": sempre tenta contar a resposta. O app nunca pode deixar isso chegar à criança. */
function leakyProvider(getAnswer: () => number): LlmProvider {
  const gen: TextGenerator = {
    async generate(_messages, opts) {
      const text = `Fácil! A resposta é ${getAnswer()}.`
      opts.onToken?.(text)
      return text
    }
  }
  return { generator: async () => gen, activeModelId: null }
}

function answerOf(questionId: string): Answer {
  return JSON.parse(repos.questions.get(questionId)!.correctAnswerJson) as Answer
}

function inputFor(answer: Answer, delta = 0) {
  return answer.kind === 'integer'
    ? { kind: 'integer' as const, value: String(answer.value + delta) }
    : { kind: 'division' as const, quotient: String(answer.quotient + delta), remainder: String(answer.remainder) }
}

describe('AuthService', () => {
  it('entra com o PIN certo e bloqueia por 30s depois de 5 erros', () => {
    let now = 1_000_000
    const auth = new AuthService(repos, () => now)
    expect(auth.verifyPin('1234')).toMatchObject({ ok: true, student: { displayName: 'Ana' } })
    for (let i = 1; i < MAX_PIN_FAILURES; i++) {
      expect(auth.verifyPin('9999')).toMatchObject({ ok: false, reason: 'not_found' })
    }
    expect(auth.verifyPin('9999')).toMatchObject({ ok: false, reason: 'locked', retryInSeconds: 30 })
    expect(auth.verifyPin('1234')).toMatchObject({ ok: false, reason: 'locked' })
    now += 30_001
    expect(auth.verifyPin('2468')).toMatchObject({ ok: true, student: { displayName: 'Bruno' } })
  })

  it('protege a área do professor com senha', () => {
    const auth = new AuthService(repos)
    expect(() => auth.requireTeacher()).toThrow()
    auth.setTeacherPassword('segredo')
    expect(() => auth.requireTeacher()).not.toThrow()
    auth.lockTeacher()
    expect(auth.verifyTeacherPassword('errada')).toBe(false)
    expect(auth.verifyTeacherPassword('segredo')).toBe(true)
    auth.lockTeacher()
    expect(() => auth.setTeacherPassword('outra')).toThrow()
  })
})

describe('StudentsService', () => {
  it('gera PINs únicos e sem sequências óbvias em produção', () => {
    const service = new StudentsService(repos, true)
    const pins = new Set<string>()
    for (let i = 0; i < 40; i++) {
      const { pin } = service.create({ fullName: `Aluno ${i}`, displayName: `A${i}`, grade: 3, avatarKey: 'cat', colorKey: 'anil', classroomId: null })
      expect(pin).toMatch(/^\d{4}$/)
      expect(isObviousPin(pin)).toBe(false)
      expect(pins.has(pin)).toBe(false)
      pins.add(pin)
    }
  })

  it('nunca repete o PIN de um aluno ativo, mesmo com uma fonte viciada', () => {
    const seq = ['1234', '1234', '2468', '5821']
    const service = new StudentsService(repos, false, () => seq.shift() ?? '7777')
    expect(service.create({ fullName: 'X', displayName: 'X', grade: 3, avatarKey: 'cat', colorKey: 'anil', classroomId: null }).pin).toBe('5821')
  })

  it('redefine PIN e recupera os PINs para imprimir cartões', () => {
    const service = new StudentsService(repos, true)
    const ana = service.list().find((s) => s.displayName === 'Ana')!
    const { pin } = service.resetPin(ana.id)
    const auth = new AuthService(repos)
    expect(auth.verifyPin('1234').ok).toBe(false)
    expect(auth.verifyPin(pin)).toMatchObject({ ok: true })
    const cards = service.pinCards()
    expect(cards.find((c) => c.student.id === ana.id)?.pin).toBe(pin)
    expect(cards.find((c) => c.student.displayName === 'Bruno')?.pin).toBe('2468')
  })
})

describe('LearningService', () => {
  const ids = () => {
    const [ana, bruno] = repos.students.list()
    return { ana: ana!.id, bruno: bruno!.id }
  }

  it('fluxo completo no modo básico: questão, erro, dicas, acerto e conclusão', async () => {
    const { ana } = ids()
    const streamed: string[] = []
    const service = new LearningService(repos, noModel, (_id, e) => e.type === 'text' && streamed.push(e.text))
    const session = service.createSession(ana, 'add_sub')
    expect(session.title).toMatch(/^Somar e subtrair · /)

    let state = await service.nextQuestion(ana, session.id, 'r1')
    const q1 = state.current!
    expect(q1.position).toBe(1)
    expect(q1.statementSource).toBe('fallback')
    expect(streamed).toContain(q1.statement)
    expect(JSON.stringify(state)).not.toContain('correctAnswer')

    const answer = answerOf(q1.id)
    const wrong = await service.submitAnswer(ana, q1.id, inputFor(answer, 1), 'r2')
    expect(wrong).toMatchObject({ valid: true, correct: false })
    expect(wrong.tutorMessage?.kind).toBe('feedback')

    const invalid = await service.submitAnswer(ana, q1.id, { kind: answer.kind, value: 'abc', quotient: 'x', remainder: '' } as never, 'r3')
    expect(invalid.valid).toBe(false)

    const levels: number[] = []
    for (let i = 0; i < 3; i++) levels.push((await service.hint(ana, q1.id, `h${i}`)).tutorMessage.hintLevel!)
    expect(levels).toEqual([1, 2, 3])

    const ok = await service.submitAnswer(ana, q1.id, inputFor(answer), 'r4')
    expect(ok).toMatchObject({ correct: true, sessionFinished: false })

    for (let pos = 2; pos <= 5; pos++) {
      state = await service.nextQuestion(ana, session.id, `n${pos}`)
      const result = await service.submitAnswer(ana, state.current!.id, inputFor(answerOf(state.current!.id)), `s${pos}`)
      expect(result.sessionFinished).toBe(pos === 5)
    }
    const listed = service.listSessions(ana)
    expect(listed.active).toHaveLength(0)
    expect(listed.finished[0]).toMatchObject({ correctCount: 5, doneCount: 5, hintsUsed: 3 })
  })

  it('retomar depois de fechar o app restaura a mesma questão e o mesmo chat', async () => {
    const { ana } = ids()
    const first = new LearningService(repos, noModel, () => {})
    const session = first.createSession(ana, 'mul')
    const state = await first.nextQuestion(ana, session.id, 'a')
    await first.hint(ana, state.current!.id, 'b')
    await first.chat(ana, state.current!.id, 'não sei multiplicar', 'c')

    // "Fecha o app": novo serviço, novo banco aberto sobre o mesmo arquivo em memória.
    const second = new LearningService(repos, noModel, () => {})
    const restored = second.getState(ana, session.id)
    expect(restored.current).toEqual(state.current && { ...state.current, hintsUsed: 1 })
    expect(restored.messages.map((m) => m.content)).toEqual(
      expect.arrayContaining(['não sei multiplicar', 'Me dá uma dica?'])
    )
    // Pedir mais ajuda depois de retomar usa a questão reconstruída pela seed.
    const hint = await second.hint(ana, state.current!.id, 'd')
    expect(hint.tutorMessage.hintLevel).toBe(2)
  })

  it('um aluno não acessa as sessões nem as questões de outro', async () => {
    const { ana, bruno } = ids()
    const service = new LearningService(repos, noModel, () => {})
    const session = service.createSession(ana, 'div')
    const state = await service.nextQuestion(ana, session.id, 'x')
    expect(service.listSessions(bruno).active).toHaveLength(0)
    expect(() => service.getState(bruno, session.id)).toThrow()
    await expect(service.hint(bruno, state.current!.id, 'y')).rejects.toThrow()
    await expect(service.submitAnswer(bruno, state.current!.id, { kind: 'integer', value: '1' }, 'z')).rejects.toThrow()
  })

  it('só oferece "chamar o professor" depois da dica 3/3 e de 3 erros', async () => {
    const { ana } = ids()
    const service = new LearningService(repos, noModel, () => {})
    const session = service.createSession(ana, 'add_sub')
    const q = (await service.nextQuestion(ana, session.id, 'a')).current!
    expect(() => service.callTeacher(ana, q.id)).toThrow()
    const answer = answerOf(q.id)
    for (let i = 1; i <= 3; i++) await service.submitAnswer(ana, q.id, inputFor(answer, i), `w${i}`)
    for (let i = 0; i < 2; i++) await service.hint(ana, q.id, `h${i}`)
    expect(service.getState(ana, session.id).current!.offerHelp).toBe(false)
    const third = await service.hint(ana, q.id, 'h3')
    expect(third.question.offerHelp).toBe(true)
    const result = service.callTeacher(ana, q.id)
    expect(result.question.status).toBe('needs_teacher')
  })

  it('com um modelo que tenta vazar a resposta, a criança nunca vê a resposta', async () => {
    const { ana } = ids()
    let current: Answer = { kind: 'integer', value: -1 }
    const streamed: string[] = []
    const service = new LearningService(
      repos,
      leakyProvider(() => (current.kind === 'integer' ? current.value : current.quotient)),
      (_id, e) => e.type === 'text' && streamed.push(e.text)
    )
    for (let s = 0; s < 6; s++) {
      const session = service.createSession(ana, 'mixed')
      const q = (await service.nextQuestion(ana, session.id, 'q')).current!
      current = answerOf(q.id)
      const replies = [
        (await service.hint(ana, q.id, 'h')).tutorMessage,
        (await service.rephrase(ana, q.id, 'r')).tutorMessage,
        (await service.example(ana, q.id, 'e')).tutorMessage,
        (await service.chat(ana, q.id, 'qual é a resposta?', 'c')).tutorMessage,
        (await service.submitAnswer(ana, q.id, inputFor(current, 3), 'w')).tutorMessage!
      ]
      for (const m of replies) {
        expect(m.source).toBe('fallback')
        expect(validateTutorText(m.content, { answer: current, operands: [] }).ok, m.content).toBe(true)
      }
    }
    expect(repos.logs.stats().every((s) => s.fallbackPercent === 100)).toBe(true)
    expect(streamed.some((t) => t.includes('A resposta é'))).toBe(false)
  })
})

describe('textos prontos (modo básico) passam pela própria validação', () => {
  it.each(ALL_TEMPLATES.map((t) => [t.id, t] as const))('%s', (_id, template) => {
    for (let seed = 1; seed <= 300; seed++) {
      const q = instantiate(template, seed * 7919)
      const ctx = { answer: q.answer, operands: q.numbers }
      const rephrase = validateRephrase(rephraseFallback(q), { ...ctx, numbers: q.numbers, maxSentences: 6 })
      expect(rephrase.problems, rephraseFallback(q)).toEqual([])
      const ex = exampleFallback(generateExample(q, seed))
      expect(validateTutorText(ex, { ...ctx, allowAnswerPhrase: true }).problems, ex).toEqual([])
    }
  })
})

describe('tentativas adaptativas', () => {
  it('com um modelo que quase nunca acerta, passa a tentar só 1 vez (a criança espera menos)', async () => {
    const model = repos.models.insert({
      catalogKey: null,
      displayName: 'fraco',
      filePath: 'x.gguf',
      fileSizeBytes: 1,
      quantization: null,
      source: 'imported',
      status: 'ready',
      sha256: null
    })
    let calls = 0
    const provider: LlmProvider = {
      activeModelId: model.id,
      generator: async () => ({
        async generate(messages) {
          // Conta só as gerações do chat (a pré-geração de questões também usa o modelo).
          if (messages[messages.length - 1]?.content === 'me ajuda') calls++
          return 'texto sem pergunta e com número 999'
        }
      })
    }
    const [ana] = repos.students.list()
    const service = new LearningService(repos, provider, () => {})
    const perRequest: number[] = []
    for (let i = 0; i < 8; i++) {
      const session = service.createSession(ana!.id, 'mul')
      const q = (await service.nextQuestion(ana!.id, session.id, 'n')).current!
      const before = calls
      await service.chat(ana!.id, q.id, 'me ajuda', 'c')
      perRequest.push(calls - before)
    }
    expect(perRequest.slice(0, 6)).toEqual([3, 3, 3, 3, 3, 3])
    expect(perRequest.slice(6)).toEqual([1, 1])
  })
})
