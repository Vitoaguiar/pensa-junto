import type { Focus, QuestionTemplate } from '../types'
import { addSubAcrescentar, addSubComparar, addSubCompletar, addSubJuntar, addSubRetirar, addSubSeparar } from './addSub'
import { calculoAdicao, calculoSubtracao } from './calculo'
import { divMedida, divRepartir, divRepartirComResto } from './divisao'
import { fatosAdicao, fatosMultiplicacao } from './fatos'
import { mulParcelasIguais, mulRetangular } from './multiplicacao'

// Os templates são genéricos nos parâmetros; o registro guarda todos como QuestionTemplate<unknown>.
type AnyTemplate = QuestionTemplate<unknown>
const t = <P>(template: QuestionTemplate<P>) => template as unknown as AnyTemplate

export const ALL_TEMPLATES: readonly AnyTemplate[] = [
  t(fatosAdicao),
  t(fatosMultiplicacao),
  t(calculoAdicao),
  t(calculoSubtracao),
  t(addSubJuntar),
  t(addSubAcrescentar),
  t(addSubSeparar),
  t(addSubRetirar),
  t(addSubComparar),
  t(addSubCompletar),
  t(mulParcelasIguais),
  t(mulRetangular),
  t(divRepartir),
  t(divMedida),
  t(divRepartirComResto)
]

export function findTemplate(id: string): AnyTemplate {
  const template = ALL_TEMPLATES.find((x) => x.id === id)
  if (!template) throw new Error(`Template desconhecido: ${id}`)
  return template
}

export interface PoolOptions {
  /** Inclui extensões (ex.: divisão com resto). */
  includeExtensions?: boolean
  /** Códigos BNCC habilitados pelo professor. Sem valor: todos. */
  enabledSkills?: readonly string[]
}

/** Templates que servem a um foco. */
export function templatesForFocus(focus: Focus, options: PoolOptions = {}): AnyTemplate[] {
  const byFocus = ALL_TEMPLATES.filter((x) => {
    if (x.extension && !options.includeExtensions) return false
    if (options.enabledSkills && !options.enabledSkills.includes(x.skillCode)) return false
    switch (focus) {
      case 'add_sub':
        return x.operation === 'add' || x.operation === 'sub'
      case 'mul':
        return x.operation === 'mul'
      case 'div':
        return x.operation === 'div'
      case 'mixed':
        return true
    }
  })
  return byFocus
}
