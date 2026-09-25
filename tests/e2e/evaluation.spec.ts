import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron, expect, test, type Page } from '@playwright/test'

// Modo de avaliação com modelos de verdade: gerar uma rodada pequena, "preencher" as planilhas de dois
// avaliadores, importar e ver o resultado. Os .gguf entram por hard link (sem copiar).
//   PENSA_JUNTO_MODELS_SOURCE="%APPDATA%\Pensa Junto\models" npx playwright test evaluation

const SOURCE = process.env.PENSA_JUNTO_MODELS_SOURCE
test.skip(!SOURCE, 'defina PENSA_JUNTO_MODELS_SOURCE com a pasta que tem os .gguf do catálogo')
test.setTimeout(20 * 60_000)

const SHOTS = path.join('test-results', 'shots-evaluation')
async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS, { recursive: true })
  await page.waitForTimeout(600)
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true })
}

/** Preenche a planilha como um avaliador faria (nota por palavras-chave simples, só para o teste). */
function fillSheet(sheet: string, out: string, strict: boolean) {
  const lines = sheet.replace(/^\uFEFF/, '').split('\r\n').filter(Boolean)
  const filled = lines.map((line, i) => {
    if (i === 0) return line
    const cells = line.split(';')
    const text = cells[4] ?? ''
    const nota = text.length > 160 ? 3 : strict ? 4 : 5
    return [...cells.slice(0, 6), String(nota), 'S', '4', ''].join(';')
  })
  fs.writeFileSync(out, '\uFEFF' + filled.join('\r\n') + '\r\n')
}

test('gera rodada com os modelos reais, importa 2 avaliadores e mostra o resultado', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pj-eval-e2e-'))
  const modelsDir = path.join(userData, 'models')
  fs.mkdirSync(modelsDir, { recursive: true })
  const files = fs.readdirSync(SOURCE as string).filter((f) => f.endsWith('.gguf'))
  for (const f of files) fs.linkSync(path.join(SOURCE as string, f), path.join(modelsDir, f))

  const env = { ...process.env, PENSA_JUNTO_USER_DATA: userData, PENSA_JUNTO_DEMO: '1' } as Record<string, string>
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ args: [path.join(__dirname, '../../out/main/index.js')], env })
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1366, height: 768 })

  // Primeira execução: senha e adicionar os modelos encontrados.
  await page.getByRole('button', { name: 'Começar' }).click()
  await page.getByLabel('Senha', { exact: true }).fill('prof1234')
  await page.getByLabel('Repita a senha').fill('prof1234')
  await page.getByRole('button', { name: 'Salvar senha' }).click()
  const group = page.getByRole('radiogroup')
  for (let i = 0; i < files.length; i++) {
    await group.getByRole('button', { name: 'Conferir e adicionar' }).first().click()
    await expect(group.getByText('encontrado neste computador')).toHaveCount(files.length - i - 1, { timeout: 180_000 })
  }
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Concluir' }).click()

  // Área do professor → Avaliação.
  await page.getByRole('button', { name: 'Área do professor' }).click()
  await page.getByLabel('Senha do professor').fill('prof1234')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.getByRole('tab', { name: /Avaliação/ }).click()
  await page.getByRole('spinbutton').fill('3')
  await shot(page, '01-nova-rodada')
  await page.getByRole('button', { name: 'Gerar rodada' }).click()
  await expect(page.getByRole('progressbar', { name: 'Progresso da geração' })).toBeVisible()
  await shot(page, '02-gerando')
  await expect(page.getByText(/Rodada [A-Z0-9]{5}/).first()).toBeVisible({ timeout: 15 * 60_000 })

  // Dois avaliadores preenchem a planilha.
  const round = fs.readdirSync(path.join(userData, 'avaliacoes'))[0] as string
  const folder = path.join(userData, 'avaliacoes', round)
  const sheet = fs.readFileSync(path.join(folder, `avaliacao-${round}.csv`), 'utf8')
  const filled = [path.join(userData, `avaliacao-${round}-Ana.csv`), path.join(userData, `avaliacao-${round}-Bia.csv`)]
  fillSheet(sheet, filled[0] as string, false)
  fillSheet(sheet, filled[1] as string, true)
  // O diálogo de arquivo do sistema é substituído pelos arquivos preenchidos.
  await app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: paths })) as typeof dialog.showOpenDialog
  }, filled)
  await page.getByRole('button', { name: 'Importar avaliações' }).click()
  await expect(page.getByText(/concordância/)).toBeVisible({ timeout: 30_000 })
  await shot(page, '03-resultado')

  const report = fs.readFileSync(path.join(folder, `relatorio-${round}.html`), 'utf8')
  expect(report).toContain('Textos do código (sem modelo)')
  console.log(`Rodada ${round}: pasta ${folder}`)
  await app.close()
  if (!process.env.PENSA_JUNTO_KEEP) fs.rmSync(userData, { recursive: true, force: true })
})
