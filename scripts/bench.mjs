// Benchmark dos modelos instalados NESTE computador (o que a criança vai sentir).
//
//   npm run bench                          -> todos os modelos instalados, 10 enunciados + 10 dicas cada
//   npm run bench -- --n 5                 -> 5 de cada (mais rápido)
//   npm run bench -- --models llama32-1b   -> só um modelo (chaves: llama32-1b, qwen3-1_7b, llama32-3b)
//   npm run bench -- --models active       -> só o modelo em uso
//   npm run bench -- --threads 2 --no-gpu  -> simula um PC de escola (2 núcleos, sem GPU)
//   npm run bench -- --user-data <pasta>   -> outra pasta de dados (padrão: a do app)
//
// Feche o app antes: ele permite só uma instância aberta por pasta de dados.

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const args = process.argv.slice(2)
const value = (flag) => {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}

function defaultUserData() {
  const name = 'Pensa Junto'
  if (process.platform === 'win32') return path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), name)
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', name)
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), name)
}

const userData = value('--user-data') ?? process.env.PENSA_JUNTO_USER_DATA ?? defaultUserData()
const main = path.join(process.cwd(), 'out', 'main', 'index.js')
if (!fs.existsSync(main)) {
  console.error('Build não encontrado. Rode "npm run bench" (ele faz o build antes) ou "npx electron-vite build".')
  process.exit(1)
}

const env = { ...process.env, PENSA_JUNTO_BENCH: '1', PENSA_JUNTO_USER_DATA: userData }
// O VS Code define ELECTRON_RUN_AS_NODE, que impede o Electron de funcionar como app.
delete env.ELECTRON_RUN_AS_NODE
if (value('--n')) env.PENSA_JUNTO_BENCH_N = value('--n')
if (value('--models')) env.PENSA_JUNTO_BENCH_MODELS = value('--models')
if (value('--threads')) env.PENSA_JUNTO_THREADS = value('--threads')
if (args.includes('--no-gpu')) env.PENSA_JUNTO_GPU = 'off'

const report = path.join(userData, 'benchmark.json')
const before = fs.existsSync(report) ? fs.statSync(report).mtimeMs : 0
console.log(`Pasta de dados: ${userData}`)

const electron = require('electron') // no Node, devolve o caminho do executável
const child = spawn(electron, [main], { env, stdio: 'inherit' })
child.on('exit', (code) => {
  const after = fs.existsSync(report) ? fs.statSync(report).mtimeMs : 0
  if (after <= before) {
    console.error('\nO benchmark não gerou relatório. O app está aberto? Feche o Pensa Junto e tente de novo.')
    process.exit(code || 1)
  }
  process.exit(code ?? 0)
})
