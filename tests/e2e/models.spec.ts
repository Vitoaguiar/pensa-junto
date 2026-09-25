import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron, expect, test, type Page } from '@playwright/test'

// Gerenciar modelos com arquivos de verdade: detectar os que já estão no computador, conferir o SHA-256,
// escolher entre eles, testar, trocar e remover. Os .gguf entram por hard link (sem copiar gigabytes;
// apagar o link não apaga o original).
//   PENSA_JUNTO_MODELS_SOURCE="%APPDATA%\Pensa Junto\models" npx playwright test models

const SOURCE = process.env.PENSA_JUNTO_MODELS_SOURCE
test.skip(!SOURCE, 'defina PENSA_JUNTO_MODELS_SOURCE com a pasta que tem os .gguf do catálogo')
test.setTimeout(10 * 60_000)

const SHOTS = path.join('test-results', 'shots-models')
async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS, { recursive: true })
  await page.waitForTimeout(600)
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true })
}

test('detecta, confere, escolhe entre os modelos, testa, troca e remove', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pj-models-e2e-'))
  const modelsDir = path.join(userData, 'models')
  fs.mkdirSync(modelsDir, { recursive: true })
  const files = fs.readdirSync(SOURCE as string).filter((f) => f.endsWith('.gguf'))
  for (const f of files) fs.linkSync(path.join(SOURCE as string, f), path.join(modelsDir, f))
  expect(files.length).toBeGreaterThanOrEqual(2)

  const env = { ...process.env, PENSA_JUNTO_USER_DATA: userData, PENSA_JUNTO_DEMO: '1' } as Record<string, string>
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ args: [path.join(__dirname, '../../out/main/index.js')], env })
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1366, height: 768 })

  await page.getByRole('button', { name: 'Começar' }).click()
  await page.getByLabel('Senha', { exact: true }).fill('prof1234')
  await page.getByLabel('Repita a senha').fill('prof1234')
  await page.getByRole('button', { name: 'Salvar senha' }).click()

  // 1. Os arquivos que já estavam no computador aparecem como "encontrados".
  const installed = page.getByRole('radiogroup')
  await expect(installed.getByText('encontrado neste computador')).toHaveCount(files.length)
  await shot(page, '01-encontrados')

  // 2. Conferir (SHA-256) e adicionar cada um.
  for (let i = 0; i < files.length; i++) {
    await installed.getByRole('button', { name: 'Conferir e adicionar' }).first().click()
    await expect(installed.getByText('encontrado neste computador')).toHaveCount(files.length - i - 1, { timeout: 120_000 })
  }
  await expect(installed.getByRole('radio', { name: /^Usar / })).toHaveCount(files.length + 0)
  await shot(page, '02-conferidos')

  // 3. Escolher o primeiro, testar, trocar para o segundo.
  const radios = installed.getByRole('radio')
  await expect(installed.getByRole('radio', { name: 'Nenhum: modo básico' }).or(radios.last())).toBeVisible()
  await radios.nth(0).click()
  await expect(radios.nth(0)).toHaveAttribute('aria-checked', 'true', { timeout: 120_000 })
  await installed.getByRole('button', { name: 'Testar' }).first().click()
  await expect(installed.getByText(/Levou|não passou/i).first()).toBeVisible({ timeout: 180_000 })
  await radios.nth(1).click()
  await expect(radios.nth(1)).toHaveAttribute('aria-checked', 'true', { timeout: 120_000 })
  await expect(radios.nth(0)).toHaveAttribute('aria-checked', 'false')
  await shot(page, '03-escolhido')

  // 4. Remover o que está em uso: confirma, apaga o link e volta ao modo básico.
  const name = (await radios.nth(1).getAttribute('aria-label'))!.replace(/^Usar /, '')
  await installed.getByRole('button', { name: `Remover ${name}` }).click()
  await expect(page.getByRole('dialog', { name: 'Remover modelo?' })).toBeVisible()
  await expect(page.getByText('Este é o modelo em uso')).toBeVisible()
  await shot(page, '04-remover')
  await page.getByRole('dialog').getByRole('button', { name: 'Remover' }).click()
  await expect(page.getByRole('radio', { name: 'Nenhum: modo básico' })).toHaveAttribute('aria-checked', 'true', { timeout: 60_000 })
  await expect(installed.getByRole('radio', { name: /^Usar / })).toHaveCount(files.length - 1)
  await shot(page, '05-removido')

  await app.close()
  // O original continua intacto (só o link foi apagado).
  for (const f of files) expect(fs.existsSync(path.join(SOURCE as string, f))).toBe(true)
  expect(fs.readdirSync(modelsDir).filter((f) => f.endsWith('.gguf'))).toHaveLength(files.length - 1)
})
