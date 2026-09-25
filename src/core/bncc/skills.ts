import type { BnccSkill } from '../types'

// Habilidades do MVP: 3º ano, unidade temática Números.
// As descrições abaixo são PARÁFRASES para uso interno.
// TODO: conferir texto oficial da BNCC (basenacionalcomum.mec.gov.br) antes de exibir a professores.

export const BNCC_SKILLS: readonly BnccSkill[] = [
  {
    code: 'EF03MA03',
    grade: 3,
    thematicUnit: 'Números',
    objectOfKnowledge: 'Construção de fatos fundamentais da adição e da multiplicação', // TODO: conferir texto oficial da BNCC
    description:
      'Construir e utilizar fatos básicos da adição e da multiplicação para o cálculo mental ou escrito.' // TODO: conferir texto oficial da BNCC
  },
  {
    code: 'EF03MA05',
    grade: 3,
    thematicUnit: 'Números',
    objectOfKnowledge: 'Procedimentos de cálculo (mental e escrito) com números naturais: adição e subtração', // TODO: conferir texto oficial da BNCC
    description:
      'Utilizar diferentes procedimentos de cálculo mental e escrito para resolver problemas significativos envolvendo adição e subtração com números naturais.' // TODO: conferir texto oficial da BNCC
  },
  {
    code: 'EF03MA06',
    grade: 3,
    thematicUnit: 'Números',
    objectOfKnowledge: 'Problemas envolvendo significados da adição e da subtração', // TODO: conferir texto oficial da BNCC
    description:
      'Resolver e elaborar problemas de adição e subtração com os significados de juntar, acrescentar, separar, retirar, comparar e completar quantidades, utilizando diferentes estratégias de cálculo.' // TODO: conferir texto oficial da BNCC
  },
  {
    code: 'EF03MA07',
    grade: 3,
    thematicUnit: 'Números',
    objectOfKnowledge: 'Problemas envolvendo diferentes significados da multiplicação', // TODO: conferir texto oficial da BNCC
    description:
      'Resolver e elaborar problemas de multiplicação (por 2, 3, 4, 5 e 10) com os significados de adição de parcelas iguais e elementos apresentados em disposição retangular.' // TODO: conferir texto oficial da BNCC
  },
  {
    code: 'EF03MA08',
    grade: 3,
    thematicUnit: 'Números',
    objectOfKnowledge: 'Problemas envolvendo diferentes significados da divisão', // TODO: conferir texto oficial da BNCC
    description:
      'Resolver e elaborar problemas de divisão de um número natural por outro (até 10), com resto zero e com resto diferente de zero, com os significados de repartição equitativa e de medida.' // TODO: conferir texto oficial da BNCC
  }
]

export function findSkill(code: string): BnccSkill | undefined {
  return BNCC_SKILLS.find((s) => s.code === code)
}
