import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

// Fluxo feliz, em modo básico (sem modelo): primeira execução -> PIN -> sessão completa -> retomada.
// Pré-requisito: `npm run build` (o teste usa out/main/index.js).

const SHOTS = process.env.PENSA_JUNTO_SHOTS ?? path.join('test-results', 'shots')

function launch(userData: string): Promise<ElectronApplication> {
  const env = { ...process.env, PENSA_JUNTO_USER_DATA: userData, PENSA_JUNTO_DEMO: '1' } as Record<string, string>
  delete env.ELECTRON_RUN_AS_NODE // o VS Code define essa variável e ela impede o Electron de abrir janelas
  return electron.launch({ args: [path.join(__dirname, '../../out/main/index.js')], env })
}

/** O teste lê a resposta direto do banco (o renderer nunca a recebe). */
function currentAnswer(userData: string): { kind: string; value?: number; quotient?: number; remainder?: number } {
  const db = new Database(path.join(userData, 'pensa-junto.db'), { readonly: true })
  try {
    const row = db
      .prepare("SELECT correct_answer_json FROM questions WHERE status = 'pending' ORDER BY created_at DESC LIMIT 1")
      .get() as { correct_answer_json: string }
    return JSON.parse(row.correct_answer_json)
  } finally {
    db.close()
  }
}

async function typeNumber(page: Page, value: number) {
  for (const digit of String(value)) await page.getByRole('group', { name: 'Teclado da resposta' }).getByRole('button', { name: digit, exact: true }).click()
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS, { recursive: true })
  await page.waitForTimeout(700) // deixa as transições (200–800 ms) terminarem
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
}

test('primeira execução, login por PIN, sessão completa e retomada', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pensa-junto-e2e-'))
  let app = await launch(userData)
  let page = await app.firstWindow()
  await page.setViewportSize({ width: 1366, height: 768 })

  // ---------- Primeira execução ----------
  await expect(page.getByRole('heading', { name: /Boas-vindas/ })).toBeVisible()
  await shot(page, '01-boas-vindas')
  await page.getByRole('button', { name: 'Começar' }).click()

  await page.getByLabel('Senha', { exact: true }).fill('prof1234')
  await page.getByLabel('Repita a senha').fill('prof1234')
  await page.getByRole('button', { name: 'Salvar senha' }).click()

  await expect(page.getByRole('heading', { name: 'Escolha o cérebro do app' })).toBeVisible()
  await expect(page.getByText('Recomendado para este computador')).toBeVisible()
  await shot(page, '02-modelo')
  await page.getByRole('button', { name: 'Continuar' }).click()

  await expect(page.getByRole('heading', { name: 'Cadastre os alunos' })).toBeVisible()
  // Cria um aluno novo e vê o PIN gerado.
  await page.getByRole('button', { name: 'Adicionar aluno' }).click()
  await page.getByLabel('Nome completo').fill('Dora Oliveira')
  await shot(page, '03-novo-aluno')
  await page.getByRole('button', { name: 'Criar e gerar código' }).click()
  await expect(page.getByText('O código de')).toBeVisible()
  await shot(page, '04-pin-gerado')
  await page.getByRole('button', { name: 'Pronto' }).click()
  await page.getByRole('button', { name: 'Concluir' }).click()

  // ---------- PIN ----------
  await expect(page.getByRole('heading', { name: 'Oi! Digite seu código secreto' })).toBeVisible()
  await shot(page, '05-pin')
  await page.keyboard.type('9999')
  await expect(page.getByText('esse código não é de ninguém')).toBeVisible()
  await page.keyboard.type('1234')
  await expect(page.getByRole('heading', { name: 'Oi, Ana!' })).toBeVisible()

  // ---------- Início ----------
  await expect(page.getByText('Você ainda não começou nenhuma conversa')).toBeVisible()
  await shot(page, '06-inicio')
  await page.getByRole('button', { name: /Nova conversa/ }).click()
  await shot(page, '07-foco')
  await page.getByRole('button', { name: /Somar e subtrair/ }).click()

  // ---------- Sessão ----------
  await expect(page.getByText('Questão 1 de 5')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Conferir' })).toBeEnabled()
  await shot(page, '08-sessao')

  // Erro -> feedback gentil + pergunta do tutor.
  const first = currentAnswer(userData)
  await typeNumber(page, (first.value ?? 0) + 1)
  await page.getByRole('button', { name: 'Conferir' }).click()
  await expect(page.getByText('Quase! Vamos olhar juntos?')).toBeVisible()
  await page.getByRole('button', { name: /Me dá uma dica/ }).click()
  await expect(page.getByText('Dica 1/3')).toBeVisible()
  await page.getByLabel('Escreva para o tutor').fill('não sei por onde começar')
  await page.getByRole('button', { name: 'Enviar' }).click()
  await expect(page.getByText('não sei por onde começar')).toBeVisible()
  await shot(page, '09-ajuda')

  // Fecha o app no meio da questão...
  const statement = await page.locator('p.text-statement').innerText()
  await app.close()

  // ...e retoma: mesma questão, mesmo chat.
  app = await launch(userData)
  page = await app.firstWindow()
  await page.setViewportSize({ width: 1366, height: 768 })
  await expect(page.getByRole('heading', { name: 'Oi! Digite seu código secreto' })).toBeVisible()
  await page.keyboard.type('1234')
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  await expect(page.locator('p.text-statement')).toHaveText(statement)
  await expect(page.getByText('não sei por onde começar')).toBeVisible()
  await expect(page.getByText('Dica 1/3')).toBeVisible()

  // Acerta as 5 questões.
  for (let i = 1; i <= 5; i++) {
    await expect(page.getByRole('button', { name: 'Conferir' })).toBeEnabled()
    const answer = currentAnswer(userData)
    await typeNumber(page, answer.value ?? answer.quotient ?? 0)
    await page.getByRole('button', { name: 'Conferir' }).click()
    await expect(page.getByText('Isso aí, Ana! Você chegou lá.')).toBeVisible()
    if (i === 1) await shot(page, '10-acerto')
    if (i < 5) await page.getByRole('button', { name: 'Próxima' }).click()
  }
  await expect(page.getByRole('heading', { name: 'Conversa concluída!' })).toBeVisible()
  await expect(page.getByText('Você resolveu 5 questões e usou 1 dica!')).toBeVisible()
  await shot(page, '11-conclusao')

  await page.getByRole('button', { name: 'Voltar ao início' }).click()
  await page.getByRole('tab', { name: /Terminadas/ }).click()
  await expect(page.getByText(/Somar e subtrair ·/)).toBeVisible()
  await shot(page, '12-terminadas')

  // Outro aluno não vê as conversas da Ana.
  await page.getByRole('button', { name: 'Trocar de aluno' }).click()
  await expect(page.getByRole('heading', { name: 'Oi! Digite seu código secreto' })).toBeVisible()
  await page.keyboard.type('2468')
  await expect(page.getByText('Você ainda não começou nenhuma conversa')).toBeVisible()

  // Área do professor.
  await page.getByRole('button', { name: 'Trocar de aluno' }).click()
  await expect(page.getByRole('heading', { name: 'Oi! Digite seu código secreto' })).toBeVisible()
  await page.getByRole('button', { name: 'Área do professor' }).click()
  await page.getByLabel('Senha do professor').fill('prof1234')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Área do professor' })).toBeVisible()
  await shot(page, '13-professor')
  await page.getByRole('tab', { name: /Uso do app/ }).click()
  await expect(page.getByText('Enunciados')).toBeVisible()
  await page.getByRole('button', { name: 'Imprimir cartões de PIN' }).click()
  await expect(page.getByText('1234')).toBeVisible()
  await shot(page, '14-cartoes')

  await app.close()
})
