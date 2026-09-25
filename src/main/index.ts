import path from 'node:path'
import { app, BrowserWindow, net, session, shell } from 'electron'
import { openDatabase, type DbHandle } from './db/connection'
import { createRepositories } from './db/repositories'
import { seedBaseline, seedDemo } from './db/seed'
import { registerIpc, sendEvent } from './ipc/handlers'
import { formatBenchmark, runBenchmark } from './llm/benchmark'
import { LlmService } from './llm/llmService'
import { ModelManager } from './llm/modelManager'
import { NodeLlamaEngine } from './llm/nodeLlamaEngine'
import { AuthService } from './services/auth'
import { LearningService } from './services/learning'
import { StudentsService } from './services/students'
import { readSyncConfig, SupabaseSync } from './sync/supabaseSync'
import icon from '../../resources/icon.png?asset'

const isDev = !app.isPackaged
// Permite apontar para uma pasta de dados separada (usado pelos testes de ponta a ponta).
if (process.env.PENSA_JUNTO_USER_DATA) app.setPath('userData', process.env.PENSA_JUNTO_USER_DATA)

let mainWindow: BrowserWindow | null = null
let dbHandle: DbHandle | null = null
let llm: LlmService | null = null
let sync: SupabaseSync | null = null

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })
  app.whenReady().then(start)
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: 'Pensa Junto',
    backgroundColor: '#F6F7FB',
    icon,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      webSecurity: true
    }
  })
  win.setMenuBarVisibility(false)
  win.once('ready-to-show', () => win.show())

  // Nada de janelas novas ou navegação para fora do app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault()
  })
  // F11: tela cheia para uso em sala.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen())
      event.preventDefault()
    }
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  return win
}

async function start(): Promise<void> {
  // Nenhuma permissão de navegador (câmera, microfone, localização...).
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))

  const userData = app.getPath('userData')
  dbHandle = openDatabase(path.join(userData, 'pensa-junto.db'))
  const repos = createRepositories(dbHandle.db)
  seedBaseline(dbHandle, repos)
  if (isDev || process.env.PENSA_JUNTO_DEMO === '1') seedDemo(repos)

  // Simulação de PC fraco (também vale no app normal): PENSA_JUNTO_THREADS=2, PENSA_JUNTO_GPU=off.
  const threads = Number(process.env.PENSA_JUNTO_THREADS) || undefined
  const gpuOff = process.env.PENSA_JUNTO_GPU === 'off'
  const engine = new NodeLlamaEngine({ threads, gpu: !gpuOff, verboseLogs: process.env.PENSA_JUNTO_LLAMA_LOGS === '1' })
  llm = new LlmService(engine, repos)
  const auth = new AuthService(repos)
  const students = new StudentsService(repos, !isDev)
  const learning = new LearningService(repos, llm, (requestId, event) =>
    sendEvent(mainWindow, 'tutor:onToken', { requestId, event })
  )
  const models = new ModelManager(repos, llm, path.join(userData, 'models'), (p) =>
    sendEvent(mainWindow, 'models:onProgress', p)
  )

  // Benchmark: mede cada modelo instalado neste computador, grava benchmark.json e fecha.
  if (process.env.PENSA_JUNTO_BENCH === '1') {
    const modelsEnv = process.env.PENSA_JUNTO_BENCH_MODELS ?? 'all'
    const report = await runBenchmark(
      { repos, llm, engineInfo: () => engine.info(), version: app.getVersion(), log: (line) => console.log(line) },
      {
        n: Math.max(1, Math.min(50, Number(process.env.PENSA_JUNTO_BENCH_N) || 10)),
        models: modelsEnv === 'all' || modelsEnv === 'active' ? modelsEnv : modelsEnv.split(','),
        simulation: { threads: threads ?? null, gpu: gpuOff ? 'off' : 'auto' }
      }
    )
    const file = path.join(userData, 'benchmark.json')
    await import('node:fs').then((fs) => fs.promises.writeFile(file, JSON.stringify(report, null, 2)))
    console.log(formatBenchmark(report))
    console.log(`Relatório completo: ${file}`)
    await llm.dispose()
    app.exit(0)
    return
  }

  // Autoteste (suporte técnico): carrega o modelo ativo, gera um enunciado, grava selftest.json e fecha.
  if (process.env.PENSA_JUNTO_SELFTEST === '1') {
    const activeId = llm.activeModelId
    const result = activeId ? await models.test(activeId) : { ok: false, error: 'nenhum modelo ativo' }
    const report = { packaged: app.isPackaged, database: true, modelId: activeId, engine: llm.state(), result }
    await import('node:fs').then((fs) =>
      fs.promises.writeFile(path.join(userData, 'selftest.json'), JSON.stringify(report, null, 2))
    )
    app.quit()
    return
  }

  const syncConfig = readSyncConfig(import.meta.env)
  const ipc = registerIpc({
    repos,
    auth,
    students,
    learning,
    models,
    llm,
    isDev,
    syncEnabled: !!syncConfig,
    getWindow: () => mainWindow
  })

  mainWindow = createWindow()
  mainWindow.on('closed', () => (mainWindow = null))

  // Carrega o modelo ativo em segundo plano; enquanto isso (ou sem modelo) o app funciona em modo básico.
  void llm.ensureActiveLoaded().then(() => sendEvent(mainWindow, 'app:onStatus', ipc.status()))

  if (syncConfig) {
    sync = new SupabaseSync(dbHandle.sqlite, syncConfig, () => net.isOnline())
    sync.start()
  }
}

app.on('window-all-closed', () => app.quit())

app.on('will-quit', () => {
  sync?.stop()
  void llm?.dispose()
  dbHandle?.close()
})
