import { describe, expect, it } from 'vitest'
import { containsNumber, extractNumbers, safeReleaseIndex } from './numberWords'
import {
  announcesAnswer,
  cleanOutput,
  containsFullExpression,
  leaksAnswer,
  limitSentences,
  validateRephrase,
  validateStatement,
  tutorNumberVocabulary,
  validateTutorText,
  wrongArithmetic
} from './validation'
import type { Answer } from './types'

const ans = (value: number): Answer => ({ kind: 'integer', value })

describe('leitura de números', () => {
  it.each([
    ['trezentos e quarenta e sete', 347],
    ['duzentos e vinte e dois', 222],
    ['Cento e cinco', 105],
    ['cem', 100],
    ['mil', 1000],
    ['dois mil e quinhentos', 2500],
    ['dezesseis', 16],
    ['quarenta e duas', 42],
    ['novecentos e noventa e nove', 999],
    ['três', 3]
  ])('lê "%s" como %d', (text, value) => {
    expect(extractNumbers(text).map((n) => n.value)).toEqual([value])
  })

  it('lê algarismos com e sem ponto de milhar', () => {
    expect(extractNumbers('1.000 e 1000 e 347').map((n) => n.value)).toEqual([1000, 1000, 347])
  })

  it('não confunde artigo "um/uma" com número', () => {
    expect(extractNumbers('Ana tem um gato e uma bola.')).toEqual([])
    expect(containsNumber('vinte e um', 21)).toBe(true)
  })

  it('segura palavras e números incompletos no streaming', () => {
    expect(safeReleaseIndex('Ana tem 2')).toBe('Ana tem '.length)
    expect(safeReleaseIndex('Ana tem duzentos e ')).toBe('Ana tem '.length)
    expect(safeReleaseIndex('A resposta é vinte e dois reais ')).toBe('A resposta é vinte e dois reais '.length)
    expect(safeReleaseIndex('Olá, tudo bem')).toBe('Olá, tudo '.length)
    expect(safeReleaseIndex('Tem 1.')).toBe('Tem '.length)
  })
})

describe('vazamento da resposta', () => {
  it.each([
    'A resposta é 222.',
    'Dá duzentos e vinte e dois!',
    'Você chegou em 222?',
    'Isso: DUZENTOS E VINTE E DOIS.'
  ])('pega "%s"', (text) => {
    expect(leaksAnswer(text, ans(222))).toBe(true)
  })

  it.each(['São 1000 figurinhas', 'São 1.000 figurinhas', 'São mil figurinhas'])('pega 1000 em "%s"', (text) => {
    expect(leaksAnswer(text, ans(1000))).toBe(true)
  })

  it('não acusa textos limpos', () => {
    expect(leaksAnswer('Comece pelas unidades: quanto é 7 - 5?', ans(222))).toBe(false)
  })

  it('pega a conta inteira com resultado, em várias formas', () => {
    expect(containsFullExpression('Faça 347 - 125 = ', [347, 125])).toBe(true)
    expect(containsFullExpression('125 + 222 = ?', [125, 222])).toBe(true)
    expect(containsFullExpression('347 menos 125 é igual a quanto?', [347, 125])).toBe(true)
    expect(containsFullExpression('Tente fazer 347 - 125.', [347, 125])).toBe(false)
  })

  it('confere quociente e resto na divisão com resto', () => {
    const div: Answer = { kind: 'division', quotient: 7, remainder: 3 }
    expect(leaksAnswer('Cada um recebe sete.', div)).toBe(true)
    expect(leaksAnswer('Sobram 3.', div)).toBe(true)
    expect(leaksAnswer('Divida em 4 grupos.', div)).toBe(false)
  })
})

describe('validateStatement', () => {
  const ctx = { numbers: [347, 125], answer: ans(222) }

  it('aceita um enunciado bom', () => {
    const r = validateStatement('Lia tinha 347 figurinhas. Deu 125 para o irmão. Com quantas ficou?', ctx)
    expect(r).toMatchObject({ ok: true, problems: [] })
  })

  it('rejeita números faltando, números extras, resposta e conta', () => {
    expect(validateStatement('Lia tinha 347 figurinhas. Quantas ficou?', ctx).problems).toContain('falta o número 125')
    expect(validateStatement('Lia e 2 amigos têm 347 e 125. Quantas?', ctx).ok).toBe(false)
    expect(validateStatement('Lia tinha 347, deu 125 e ficou com 222?', ctx).problems).toContain('contém a resposta')
    expect(validateStatement('Lia fez 347 - 125. Quanto deu?', ctx).problems).toContain('escreveu a conta')
    expect(validateStatement('Quanto é 347 - 125?', { ...ctx, allowExpression: true }).ok).toBe(true)
  })

  it('rejeita números por extenso que não são do problema', () => {
    expect(validateStatement('Lia e seus três irmãos têm 347 e 125 figurinhas. Quantas faltam?', ctx).ok).toBe(false)
  })

  it('exige terminar com pergunta e limite de tamanho', () => {
    expect(validateStatement('Lia tinha 347 figurinhas e deu 125.', ctx).problems).toContain('não termina com pergunta')
    const long = `Lia tinha 347 figurinhas e deu 125. ${'Era um dia lindo. '.repeat(30)}Quantas?`
    expect(validateStatement(long, ctx).problems).toContain('longo demais')
  })

  it('remove blocos <think> e rótulos', () => {
    const r = validateStatement('<think>347-125=222</think>\nEnunciado: "Lia tinha 347 bolas. Deu 125. Quantas ficaram?"', ctx)
    expect(r.ok).toBe(true)
    expect(r.text).toBe('Lia tinha 347 bolas. Deu 125. Quantas ficaram?')
    expect(cleanOutput('<think>pensando sem fechar 222')).toBe('')
  })
})

describe('validateTutorText e validateRephrase', () => {
  const ctx = { answer: ans(222), operands: [347, 125] }

  it('aceita dica sem resposta', () => {
    expect(validateTutorText('Comece pelas unidades: 7 - 5. Quanto dá?', ctx).ok).toBe(true)
  })

  it('rejeita dica com resposta ou conta inteira', () => {
    expect(validateTutorText('Você está quase! É duzentos e vinte e dois.', ctx).ok).toBe(false)
    expect(validateTutorText('Faça 347 - 125 = e me diga.', ctx).ok).toBe(false)
  })

  it('limita a quantidade de frases', () => {
    expect(limitSentences('Um. Dois. Três!', 2)).toBe('Um. Dois.')
    expect(validateTutorText('Pense. Conte. Some. Veja.', { ...ctx, maxSentences: 2 }).text).toBe('Pense. Conte.')
  })

  it('reformulação mantém os números e não inventa outros', () => {
    const r = { ...ctx, numbers: [347, 125] }
    expect(validateRephrase('Lia tinha 347 figurinhas. Deu 125. Quantas sobraram?', r).ok).toBe(true)
    expect(validateRephrase('Lia tinha figurinhas. Deu algumas. Quantas sobraram?', r).ok).toBe(false)
    expect(validateRephrase('Lia tinha 347 figurinhas. Deu 125 e depois 10. Quantas?', r).ok).toBe(false)
  })
})

describe('conferência das contas e anúncios de resposta', () => {
  it('pega contas erradas escritas pelo modelo', () => {
    expect(wrongArithmetic('Unidades: 5 + 0 = 5; depois 40 + 40 = 90.')).toBe('40 + 40 = 90')
    expect(wrongArithmetic('3 × 4 = 12 e 20 ÷ 5 = 4 e 1.000 - 1 = 999')).toBeNull()
    expect(validateTutorText('Olha: 7 + 8 = 16. Confere?', { answer: ans(222), operands: [347, 125] }).problems).toContain(
      'conta errada: 7 + 8 = 16'
    )
  })

  it('não deixa o tutor anunciar uma resposta (exceto no exemplo)', () => {
    expect(announcesAnswer('A resposta é: Maria e João têm 85 pincéis.')).toBe(true)
    expect(announcesAnswer('O resultado dá oitenta e cinco.')).toBe(true)
    expect(announcesAnswer('O resultado ficou maior que 347. Pode?')).toBe(false)
    expect(announcesAnswer('Qual é a resposta que você achou?')).toBe(false)
    const ctx = { answer: ans(222), operands: [347, 125] }
    expect(validateTutorText('A resposta é 85.', ctx).ok).toBe(false)
    expect(validateTutorText('A resposta do exemplo é 85.', { ...ctx, allowAnswerPhrase: true }).ok).toBe(true)
  })

  it('limpa rótulos, listas e aspas soltas', () => {
    expect(cleanOutput('A dica é: "O problema fala de juntar.')).toBe('O problema fala de juntar.')
    expect(cleanOutput('Passos:\n- Some as unidades.\n- Depois as dezenas.')).toBe('Some as unidades. Depois as dezenas.')
  })
})

describe('sentido do enunciado e perguntas socráticas', () => {
  const ctx = { numbers: [283, 668], answer: ans(385), orderedNumbers: true }

  it('recusa números trocados em subtração ("tinha 283, deu 668")', () => {
    const swapped = validateStatement('Ana tinha 283 galinhas. Deu 668 para Luiz. Com quantas Ana ficou?', { ...ctx, numbers: [668, 283] })
    expect(swapped.problems).toContain('números fora de ordem')
    expect(validateStatement('Ana tinha 668 galinhas. Deu 283 para Luiz. Com quantas Ana ficou?', { ...ctx, numbers: [668, 283] }).ok).toBe(true)
  })

  it('exige pergunta quando a ideia do código era uma pergunta', () => {
    const tctx = { answer: ans(385), operands: [668, 283], requireQuestion: true }
    expect(validateTutorText('Quando alguém dá uma parte do que tem, fica com mais.', tctx).problems).toContain('sem pergunta')
    expect(validateTutorText('Quem dá uma parte fica com mais ou com menos?', tctx).ok).toBe(true)
  })

  it('não deixa o tutor inventar números fora do problema', () => {
    const tctx = { answer: ans(385), operands: [668, 283], allowedNumbers: tutorNumberVocabulary([668, 283]) }
    expect(validateTutorText('Olhe o 8 e o 3 nas unidades. E as centenas, 600 e 200?', tctx).ok).toBe(true)
    expect(validateTutorText('A coluna das dezenas é 651 - 11?', tctx).problems[0]).toMatch(/números estranhos/)
  })
})

describe('contas pela metade', () => {
  const ctx = { answer: ans(12), operands: [7, 5] }
  it('recusa operador sem número depois', () => {
    expect(validateTutorText('Vou te contar 8 + Vamos juntar os números?', ctx).problems).toContain('conta pela metade')
    expect(validateTutorText('Some 8 + 2. Deu quanto?', ctx).ok).toBe(true)
    expect(validateTutorText('Tente 9 - 3 primeiro?', ctx).ok).toBe(true)
  })
})

describe('limpeza não estraga frases com números', () => {
  it('mantém "4 + 4. Quanto dá?" e remove só marcadores de lista', () => {
    expect(cleanOutput('É o mesmo que 4 + 4. Quanto dá?')).toBe('É o mesmo que 4 + 4. Quanto dá?')
    expect(cleanOutput('Passo a passo: 1. Tire o menor. 2. Some.')).toBe('Tire o menor. 2. Some.')
    expect(cleanOutput('1. Tire o menor.\n2. Depois some.')).toBe('Tire o menor. Depois some.')
  })
})
