// Volta o app para a primeira execução (tela de boas-vindas) apagando o banco local.
//   npm run reset          -> apaga só o banco (mantém os modelos baixados)
//   npm run reset -- --all -> apaga a pasta de dados inteira (modelos e cache inclusive)
// Respeita PENSA_JUNTO_USER_DATA, como o app.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const APP_NAME = 'Pensa Junto'

function userDataDir() {
  if (process.env.PENSA_JUNTO_USER_DATA) return process.env.PENSA_JUNTO_USER_DATA
  if (process.platform === 'win32') return path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), APP_NAME)
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', APP_NAME)
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), APP_NAME)
}

const dir = userDataDir()
const all = process.argv.includes('--all')

if (!fs.existsSync(dir)) {
  console.log(`Nada para apagar: ${dir} não existe.`)
  process.exit(0)
}

try {
  if (all) {
    fs.rmSync(dir, { recursive: true, force: true })
    console.log(`Pasta de dados apagada: ${dir}`)
  } else {
    const removed = ['pensa-junto.db', 'pensa-junto.db-wal', 'pensa-junto.db-shm']
      .map((f) => path.join(dir, f))
      .filter((f) => fs.existsSync(f))
    for (const f of removed) fs.rmSync(f, { force: true })
    console.log(removed.length ? `Banco apagado em ${dir}` : `Nenhum banco encontrado em ${dir}`)
    console.log('Os modelos baixados foram mantidos. Use "npm run reset -- --all" para apagar tudo.')
  }
  console.log('Na próxima abertura, o app começa pela tela de boas-vindas.')
} catch (err) {
  if (err && (err.code === 'EBUSY' || err.code === 'EPERM')) {
    console.error('Não consegui apagar: o app parece estar aberto. Feche o Pensa Junto e tente de novo.')
    process.exit(1)
  }
  throw err
}
