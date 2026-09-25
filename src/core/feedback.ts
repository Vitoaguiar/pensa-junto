import type { Answer, GeneratedQuestion } from './types'

/**
 * Pergunta socrática gerada por código a partir da tentativa errada.
 * Usada como fallback quando o SLM não responde, e como pista extra no prompt.
 * Nunca contém a resposta nem o número digitado pela criança.
 */
export function diagnoseAttempt(q: GeneratedQuestion, attempt: Answer): string {
  const [a = 0, b = 0] = q.numbers
  const correct = q.answer

  if (correct.kind === 'division' && attempt.kind === 'division') {
    if (attempt.quotient === correct.quotient) {
      return 'A parte de cada um está certinha! Agora confira: quanto sobra depois de dividir?'
    }
    if (attempt.remainder >= b) {
      return `Sobraram ${b} ou mais? Então ainda dá para dar mais um para cada um. Confira de novo.`
    }
  }

  const value = attempt.kind === 'integer' ? attempt.value : attempt.quotient
  const target = correct.kind === 'integer' ? correct.value : correct.quotient
  const diff = Math.abs(value - target)

  switch (q.operation) {
    case 'sub':
      if (value === a + b) return 'Parece que você juntou os números. No problema, a quantidade aumenta ou diminui?'
      if (value > a) return `O resultado ficou maior que ${a}. Se a gente tira alguma coisa, pode ficar maior?`
      break
    case 'add':
      if (value === Math.abs(a - b)) return 'Parece que você tirou um número do outro. O problema pede para juntar ou para tirar?'
      if (value < Math.max(a, b)) return `O resultado ficou menor que ${Math.max(a, b)}. Se a gente junta coisas, pode ficar menor?`
      break
    case 'mul':
      if (value === a + b) return `Você somou os dois números. Mas são ${a} grupos: quantas vezes o ${b} aparece?`
      break
    case 'div':
      if (value >= a) return `O resultado ficou grande demais. Quando a gente divide ${a} em partes, cada parte fica maior ou menor que ${a}?`
      if (value === a - b) return 'Parece que você tirou um número do outro. Dividir é fazer grupos iguais. Quantos grupos você consegue?'
      break
  }

  if (q.operation === 'add' || q.operation === 'sub') {
    if (diff === 100) return 'Está bem perto! Confira a coluna das centenas: teve algum "vai 1" ou alguma troca?'
    if (diff === 10) return 'Está bem perto! Confira a coluna das dezenas: teve algum "vai 1" ou alguma troca?'
    if (diff <= 2) return 'Foi por pouquinho! Confira a coluna das unidades com calma.'
  }
  if (q.operation === 'mul' && diff === b) return `Quase! Conte de novo os grupos de ${b}: você somou todos?`
  if (q.operation === 'div' && diff === 1) return 'Foi por pouquinho! Multiplique de volta para conferir: o resultado bate?'

  return 'Vamos olhar juntos? Leia o problema de novo: o que ele pede para descobrir?'
}
