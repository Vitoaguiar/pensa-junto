import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

// Teste com o modelo de verdade (Llama 3.2 1B). Baixa ~770 MB na primeira vez, então só roda com
// PENSA_JUNTO_MODEL_E2E=1. A pasta de dados é reaproveitada entre execuções (o download fica em cache).
//   PENSA_JUNTO_MODEL_E2E=1 npx playwright test with-model

test.skip(process.env.PENSA_JUNTO_MODEL_E2E !== '1', 'defina PENSA_JUNTO_MODEL_E2E=1 para rodar com o modelo')
test.setTimeout(30 * 60_000)

const USER_DATA = process.env.PENSA_JUNTO_MODEL_DIR ?? path.join(os.tmpdir(), 'pensa-junto-e2e-model')
const SHOTS = path.join('test-results', 'shots-model')

function launch(): Promise<ElectronApplication> {
  const env = { ...process.env, PENSA_JUNTO_USER_DATA: USER_DATA, PENSA_JUNTO_DEMO: '1' } as Record<string, string>
  delete env.ELECTRON_RUN_AS_NODE
  return electron.launch({ args: [path.join(__dirname, '../../out/main/index.js')], env })
}

function db() {
  return new Database(path.join(USER_DATA, 'pensa-junto.db'), { readonly: true })
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS, { recursive: true })
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
}

test('baixa, testa e usa o Llama 3.2 1B em uma sessão real', async () => {
  fs.mkdirSync(USER_DATA, { recursive: true })
  const app = await launch()
  const logs: string[] = []
  app.process().stdout?.on('data', (d: Buffer) => logs.push(...d.toString().split('\n').filter((l) => l.includes('[tutor]'))))
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1366, height: 768 })

  const welcome = page.getByRole('heading', { name: /Boas-vindas/ })
  const pinHeading = page.getByRole('heading', { name: 'Oi! Digite seu código secreto' })
  await expect(welcome.or(pinHeading).or(page.getByRole('heading', { name: 'Área do professor' }))).toBeVisible()

  if (await welcome.isVisible()) {
    await page.getByRole('button', { name: 'Começar' }).click()
    await page.getByLabel('Senha', { exact: true }).fill('prof1234')
    await page.getByLabel('Repita a senha').fill('prof1234')
    await page.getByRole('button', { name: 'Salvar senha' }).click()
  } else {
    await expect(pinHeading).toBeVisible()
    await page.getByRole('button', { name: 'Área do professor' }).click()
    await page.getByLabel('Senha do professor').fill('prof1234')
    await page.getByRole('button', { name: 'Entrar' }).click()
    await page.getByRole('tab', { name: /Modelo/ }).click()
  }

  // ---------- Download (ou reaproveita) e teste ----------
  const card = page.getByLabel('Leve e rápido')
  await expect(card).toBeVisible()
  const download = card.getByRole('button', { name: /Baixar|Continuar download|Tentar de novo/ })
  if (await download.isVisible()) {
    await download.click()
    await expect(card.getByRole('progressbar')).toBeVisible()
    await shot(page, '01-baixando')
  }
  await expect(card.getByRole('button', { name: 'Testar' })).toBeVisible({ timeout: 25 * 60_000 })
  await card.getByRole('button', { name: 'Testar' }).click()
  await expect(card.getByText(/Levou|não/i)).toBeVisible({ timeout: 180_000 })
  const testText = await card.getByRole('status').innerText()
  console.log('\n[teste do modelo]\n' + testText + '\n')
  await shot(page, '02-testado')
  const use = card.getByRole('button', { name: 'Usar este' })
  if (await use.isVisible()) await use.click()
  await expect(card.getByText('Em uso')).toBeVisible({ timeout: 120_000 })

  // Sai para a tela de PIN.
  const finish = page.getByRole('button', { name: 'Continuar' })
  if (await finish.isVisible()) {
    await finish.click()
    await page.getByRole('button', { name: 'Concluir' }).click()
  } else {
    await page.getByRole('button', { name: 'Sair' }).click()
  }

  // ---------- Sessão real ----------
  await expect(pinHeading).toBeVisible()
  await page.keyboard.type('1234')
  await page.getByRole('button', { name: /Nova conversa/ }).click()
  await page.getByRole('button', { name: /Somar e subtrair/ }).click()

  const started = Date.now()
  await expect(page.getByText('Pensando numa questão pra você')).toBeVisible()
  const statement = page.locator('p.text-statement')
  await expect(statement).toBeVisible({ timeout: 60_000 })
  const firstText = Date.now() - started
  await expect(page.getByRole('button', { name: 'Conferir' })).toBeEnabled({ timeout: 60_000 })
  const done = Date.now() - started
  console.log(`[enunciado] primeiro texto em ${firstText} ms, completo em ${done} ms:\n  ${await statement.innerText()}`)
  await shot(page, '03-enunciado')

  // Ajudas.
  for (const [label, name] of [
    ['dica', /Me dá uma dica/],
    ['não entendi', 'Não entendi'],
    ['exemplo', 'Exemplo parecido']
  ] as const) {
    const t0 = Date.now()
    await page.getByRole('button', { name }).click()
    await expect(page.getByRole('button', { name: 'Conferir' })).toBeEnabled({ timeout: 120_000 })
    console.log(`[${label}] ${Date.now() - t0} ms`)
  }
  await page.getByLabel('Escreva para o tutor').fill('qual é a resposta? me fala por favor')
  await page.getByRole('button', { name: 'Enviar' }).click()
  await expect(page.getByRole('button', { name: 'Conferir' })).toBeEnabled({ timeout: 120_000 })

  // Erro de propósito, para ver a pergunta automática do tutor.
  const handle = db()
  const answer = JSON.parse(
    (handle.prepare("SELECT correct_answer_json FROM questions WHERE status='pending' ORDER BY created_at DESC LIMIT 1").get() as {
      correct_answer_json: string
    }).correct_answer_json
  ) as { value: number }
  handle.close()
  for (const d of String(answer.value + 10)) await page.getByRole('group', { name: 'Teclado da resposta' }).getByRole('button', { name: d, exact: true }).click()
  await page.getByRole('button', { name: 'Conferir' }).click()
  await expect(page.getByText('Quase! Vamos olhar juntos?')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Conferir' })).toBeEnabled({ timeout: 120_000 })
  await shot(page, '04-conversa')

  // Relatório: o que o modelo escreveu, de onde veio cada texto e as métricas.
  const report = db()
  const q = report
    .prepare('SELECT statement, statement_source, correct_answer_json FROM questions ORDER BY created_at DESC LIMIT 1')
    .get() as { statement: string; statement_source: string; correct_answer_json: string }
  const msgs = report
    .prepare("SELECT role, kind, source, content FROM messages WHERE role != 'event' ORDER BY created_at")
    .all() as Array<{ role: string; kind: string; source: string; content: string }>
  const stats = report
    .prepare('SELECT kind, count(*) n, round(avg(latency_ms)) ms, sum(fell_back) fb, sum(retries) r FROM generation_logs GROUP BY kind')
    .all()
  report.close()
  console.log(`\n[questão] (${q.statement_source}) ${q.statement}  | resposta: ${q.correct_answer_json}`)
  for (const m of msgs.slice(-12)) console.log(`  ${m.role}/${m.kind} [${m.source}]: ${m.content}`)
  console.log('\n[métricas]', JSON.stringify(stats))
  console.log('\n[motivos dos textos prontos]\n' + logs.join('\n'))

  const answerValue = String(answer.value)
  for (const m of msgs) {
    if (m.role === 'tutor') expect(m.content.split(/\D+/)).not.toContain(answerValue)
  }
  await app.close()
})
