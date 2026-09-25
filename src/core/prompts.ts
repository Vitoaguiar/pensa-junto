import { formatAnswer } from './answer'
import type { Answer, ChatMessage, GeneratedQuestion, HintLevel } from './types'

// Builders dos prompts. Tudo em português do Brasil, frases curtas, vocabulário de 8–9 anos.

const joinNumbers = (numbers: readonly number[]) =>
  numbers.length <= 1 ? numbers.join('') : `${numbers.slice(0, -1).join(', ')} e ${numbers[numbers.length - 1]}`

/**
 * Enunciado. O código já escreveu um rascunho CORRETO (quem faz o quê, a ordem dos números); o modelo só
 * o reescreve de um jeito mais vivo. Nos testes com o Llama 3.2 1B, criar do zero trocava os papéis dos
 * números ("tinha 283, deu 668"); reescrever o rascunho mantém o sentido.
 */
export function buildStatementPrompt(
  q: Pick<GeneratedQuestion, 'numbers' | 'meaning' | 'theme' | 'fallbackStatement'>
): ChatMessage[] {
  // Ordem pensada para o cache do modelo: tudo que é FIXO vem antes (regras e exemplo) e o que muda
  // (números, situação, tema, rascunho) vem só na última mensagem. Assim o llama.cpp reaproveita o
  // começo do prompt entre pedidos e tentativas, o que faz muita diferença em PCs fracos.
  const system = [
    'Você cria problemas de matemática para crianças do 3º ano do ensino fundamental no Brasil.',
    'Regras:',
    '- Frases curtas e palavras simples. No máximo 3 frases.',
    '- Use EXATAMENTE os números do pedido, escritos com algarismos.',
    '- Não use nenhum outro número.',
    '- A situação deve representar o significado pedido.',
    '- Mantenha quem faz o quê e a ordem dos números do rascunho.',
    '- Termine com uma pergunta.',
    '- NÃO escreva a conta, NÃO escreva a resposta.',
    '- Responda somente com o enunciado.'
  ].join('\n')
  // Modelos pequenos esquecem a pergunta final; por isso ela vai escrita, para ser copiada.
  const ask = (numbers: readonly number[], meaning: string, theme: string, draft: string) => {
    const question = draft.split(/(?<=[.!])\s+/).pop() ?? draft
    return [
      `Números: ${joinNumbers(numbers)}. Situação: ${meaning}. Tema: ${theme}.`,
      `Rascunho: ${draft}`,
      `Reescreva com suas palavras, deixando o problema mais gostoso de ler. Termine com esta pergunta: ${question}`
    ].join('\n')
  }
  return [
    { role: 'system', content: system },
    // Exemplo curto de reescrita: muda as palavras, mantém números, papéis, ordem e a pergunta.
    {
      role: 'user',
      content: ask([12, 5], 'retirar', 'parque', 'Lia tinha 12 balões. Deu 5 para o irmão. Com quantos balões Lia ficou?')
    },
    { role: 'assistant', content: 'No parque, Lia estava com 12 balões coloridos. Ela deu 5 para o irmão. Com quantos balões Lia ficou?' },
    { role: 'user', content: ask(q.numbers, q.meaning, q.theme.label, q.fallbackStatement) }
  ]
}

const HINT_LEVELS: Record<HintLevel, string> = {
  1: '1 = pergunta que faz pensar',
  2: '2 = aponta o próximo passo',
  3: '3 = guia o passo com números menores ou uma parte da conta'
}

export interface TutorContext {
  statement: string
  answer: Answer
  steps: readonly string[]
  lastAttempt: Answer | null
  hintLevel: HintLevel
}

export function buildTutorSystem(ctx: TutorContext): string {
  // Regras fixas primeiro (reaproveitadas pelo cache do modelo); dados desta questão no fim,
  // e o que muda a cada pedido (tentativa e nível) por último.
  return [
    'Você é um tutor paciente e animado de uma criança do 3º ano.',
    'Regras:',
    '- NUNCA diga o resultado final nem faça a conta inteira.',
    '- Faça UMA pergunta curta por vez. Máximo 2 frases.',
    '- Se a criança errou, não diga "errado"; ajude a descobrir onde a conta mudou.',
    '- Fale só de matemática. Se ela falar de outro assunto, volte gentilmente para o problema.',
    '- Português do Brasil, palavras simples.',
    `Problema: "${ctx.statement}"`,
    `Resposta correta (SEGREDO — NUNCA diga, nem indiretamente): ${formatAnswer(ctx.answer)}`,
    `Passos da resolução: ${ctx.steps.join(' ')}`,
    `Última tentativa da criança: ${ctx.lastAttempt ? formatAnswer(ctx.lastAttempt) : 'nenhuma'}`,
    `Nível da ajuda: ${HINT_LEVELS[ctx.hintLevel]}`
  ].join('\n')
}

/**
 * A ideia da dica é decidida pelo código (a certa para o nível e para a operação); o modelo só a diz
 * com calor humano e palavras de criança. Isso evita dicas que apontam para a operação errada.
 */
export function buildHintPrompt(ctx: TutorContext, hintIdea: string): ChatMessage[] {
  return [
    { role: 'system', content: buildTutorSystem(ctx) },
    {
      role: 'user',
      content: [
        `Me dá uma dica de nível ${ctx.hintLevel}.`,
        `Diga ESTA dica com suas palavras, de um jeito carinhoso, sem mudar o sentido e sem acrescentar números: "${hintIdea}"`,
        'Responda só com a dica, em no máximo 2 frases.'
      ].join('\n')
    }
  ]
}

export function buildFeedbackPrompt(ctx: TutorContext, diagnosis: string): ChatMessage[] {
  return [
    { role: 'system', content: buildTutorSystem(ctx) },
    {
      role: 'user',
      content: [
        `Eu respondi ${ctx.lastAttempt ? formatAnswer(ctx.lastAttempt) : 'algo'}, mas não deu certo.`,
        `Me faça ESTA pergunta com suas palavras, de um jeito carinhoso, sem mudar o sentido e sem acrescentar números: "${diagnosis}"`,
        'Não diga que eu errei. No máximo 2 frases.'
      ].join('\n')
    }
  ]
}

export function buildRephrasePrompt(statement: string, numbers: readonly number[]): ChatMessage[] {
  const system = [
    'Você reescreve problemas de matemática para uma criança do 3º ano que não entendeu o texto.',
    'Regras:',
    '- Use palavras ainda mais simples e frases bem curtas. No máximo 4 frases.',
    `- Mantenha EXATAMENTE estes números, com algarismos: ${joinNumbers(numbers)}. Não use outros números.`,
    '- NÃO resolva, NÃO escreva a conta, NÃO escreva a resposta.',
    '- Termine com a pergunta do problema.',
    '- Responda somente com o texto reescrito.'
  ].join('\n')
  return [
    { role: 'system', content: system },
    { role: 'user', content: statement }
  ]
}

export function buildExamplePrompt(
  example: Pick<GeneratedQuestion, 'fallbackStatement' | 'expression' | 'answer'> & { meaningForKids: string }
): ChatMessage[] {
  const system = [
    'Você é um tutor paciente de uma criança do 3º ano.',
    'Explique o EXEMPLO abaixo passo a passo, em até 4 frases curtas e simples.',
    'Use só os números do exemplo. Se escrever uma conta, ela tem que estar certa.',
    'No fim, diga a resposta do exemplo e convide a criança a fazer igual no problema dela.',
    'Não use listas nem títulos.',
    `Exemplo: "${example.fallbackStatement}"`,
    `Ideia: ${example.meaningForKids}`,
    `Conta do exemplo: ${example.expression} = ${formatAnswer(example.answer)}`
  ].join('\n')
  return [
    { role: 'system', content: system },
    { role: 'user', content: 'Me mostra um exemplo parecido?' }
  ]
}

export interface ChatTurn {
  from: 'student' | 'tutor'
  text: string
}

export function buildChatPrompt(ctx: TutorContext, history: readonly ChatTurn[], message: string): ChatMessage[] {
  const recent = history.slice(-6)
  return [
    { role: 'system', content: buildTutorSystem(ctx) },
    ...recent.map<ChatMessage>((t) => ({ role: t.from === 'student' ? 'user' : 'assistant', content: t.text })),
    { role: 'user', content: message }
  ]
}

/** Respostas de fallback do chat, quando o SLM não está disponível. */
export function fallbackChatReply(hintLevel: HintLevel, turn: number): string {
  const replies = [
    'Boa pergunta! Vamos voltar ao problema: o que ele pede para descobrir?',
    'Tente contar para mim com suas palavras: o que acontece no problema?',
    'Que tal pedir uma dica no botão da lâmpada? Ela ajuda a dar o próximo passo.',
    'Você pode desenhar o problema no papel. O que você desenharia primeiro?'
  ]
  return replies[(turn + hintLevel) % replies.length] as string
}
