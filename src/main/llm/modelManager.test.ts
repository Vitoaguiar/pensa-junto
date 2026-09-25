import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../db/connection'
import { createRepositories, type Repositories } from '../db/repositories'
import { seedBaseline } from '../db/seed'
import type { CatalogModel } from './modelCatalog'
import { discoverCatalogFiles } from './modelDiscovery'
import { FriendlyError, ModelManager } from './modelManager'

// Catálogo de mentira com arquivos pequenos (os de verdade têm 0,8–2 GB).
const CONTENT = { a: Buffer.from('modelo-leve'.repeat(100)), b: Buffer.from('modelo-medio'.repeat(120)) }
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')
const entry = (key: CatalogModel['key'], fileName: string, data: Buffer): CatalogModel => ({
  key,
  displayName: `Modelo ${fileName}`,
  friendlyName: `Amigável ${fileName}`,
  description: '',
  quantization: 'Q4_K_M',
  uri: 'hf:x/y/z.gguf',
  fileName,
  sizeBytes: data.length,
  sha256: sha(data),
  minRamGb: 4
})
const CATALOG = [entry('llama32-1b', 'Leve.gguf', CONTENT.a), entry('qwen3-1_7b', 'Medio.gguf', CONTENT.b)]

let root: string
let appDir: string
let downloads: string
let repos: Repositories
let manager: ModelManager
const calls: string[] = []

function fakeLlm() {
  return {
    get activeModelId() {
      return repos.settings.get('active_model_id')
    },
    state: () => ({ state: 'none' as const }),
    async deactivate() {
      calls.push('deactivate')
      repos.settings.delete('active_model_id')
    },
    async unloadIfLoaded(id: string) {
      calls.push(`unload:${id}`)
    },
    loadModel: async () => true,
    generator: async () => null,
    async activate(id: string) {
      repos.settings.set('active_model_id', id)
      return true
    }
  }
}

beforeEach(() => {
  calls.length = 0
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'pj-models-'))
  appDir = path.join(root, 'app-models')
  downloads = path.join(root, 'Downloads')
  fs.mkdirSync(downloads, { recursive: true })
  const handle = openDatabase(':memory:')
  repos = createRepositories(handle.db)
  seedBaseline(handle, repos)
  manager = new ModelManager(repos, fakeLlm(), appDir, () => {}, {
    catalog: CATALOG,
    searchDirs: [
      { dir: appDir, depth: 0 },
      { dir: downloads, depth: 1 },
      { dir: path.join(root, '.lmstudio'), depth: 3 }
    ]
  })
})

afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

describe('modelos já no computador', () => {
  it('encontra arquivos oficiais na pasta do app e em outras pastas (nome + tamanho)', async () => {
    fs.writeFileSync(path.join(appDir, 'Leve.gguf'), CONTENT.a)
    fs.writeFileSync(path.join(downloads, 'medio.GGUF'), CONTENT.b)
    const overview = await manager.overview()
    expect(overview.found.map((f) => [f.key, f.location])).toEqual([
      ['llama32-1b', 'app'],
      ['qwen3-1_7b', 'external']
    ])
    expect(overview.catalog.map((c) => c.state)).toEqual(['found', 'found'])
    expect(overview.installed).toEqual([])
  })

  it('ignora arquivos com o nome certo mas tamanho diferente', async () => {
    fs.writeFileSync(path.join(downloads, 'Leve.gguf'), Buffer.from('outro'))
    expect((await manager.overview()).found).toEqual([])
  })

  it('procura em subpastas (ex.: LM Studio) até a profundidade configurada', async () => {
    const nested = path.join(root, '.lmstudio', 'bartowski', 'repo')
    fs.mkdirSync(nested, { recursive: true })
    fs.writeFileSync(path.join(nested, 'Leve.gguf'), CONTENT.a)
    const found = await discoverCatalogFiles([{ dir: path.join(root, '.lmstudio'), depth: 3 }], CATALOG)
    expect(found.map((f) => f.key)).toEqual(['llama32-1b'])
  })

  it('confere o SHA-256 antes de adicionar e depois o modelo pode ser escolhido', async () => {
    fs.writeFileSync(path.join(downloads, 'Leve.gguf'), CONTENT.a)
    await manager.adopt('llama32-1b')
    const overview = await manager.overview()
    expect(overview.found).toEqual([])
    expect(overview.installed).toMatchObject([{ catalogKey: 'llama32-1b', location: 'external', active: false }])
    expect(overview.catalog[0]!.state).toBe('ready')
  })

  it('recusa um arquivo corrompido (mesmo nome e tamanho, conteúdo diferente)', async () => {
    const corrupted = Buffer.from(CONTENT.a)
    corrupted[0] = corrupted[0]! ^ 0xff
    fs.writeFileSync(path.join(downloads, 'Leve.gguf'), corrupted)
    await expect(manager.adopt('llama32-1b')).rejects.toBeInstanceOf(FriendlyError)
    expect((await manager.overview()).installed).toEqual([])
  })

  it('um modelo instalado cujo arquivo foi apagado por fora some da lista', async () => {
    fs.writeFileSync(path.join(appDir, 'Leve.gguf'), CONTENT.a)
    await manager.adopt('llama32-1b')
    fs.rmSync(path.join(appDir, 'Leve.gguf'))
    const overview = await manager.overview()
    expect(overview.installed).toEqual([])
    expect(overview.catalog[0]!.state).toBe('not_downloaded')
  })

  it('só oferece "continuar download" quando existe o arquivo parcial', async () => {
    expect((await manager.overview()).catalog[0]!.resumable).toBe(false)
    fs.writeFileSync(path.join(appDir, 'Leve.gguf.ipull'), Buffer.from('parcial'))
    expect((await manager.overview()).catalog[0]!.resumable).toBe(true)
  })
})

describe('remover modelo', () => {
  it('na pasta do app: apaga o arquivo; se estava em uso, volta ao modo básico', async () => {
    const file = path.join(appDir, 'Leve.gguf')
    fs.writeFileSync(file, CONTENT.a)
    fs.writeFileSync(`${file}.ipull`, Buffer.from('resto'))
    await manager.adopt('llama32-1b')
    const [installed] = (await manager.overview()).installed
    repos.settings.set('active_model_id', installed!.modelId)

    const result = await manager.remove(installed!.modelId)
    expect(result.keptFile).toBeNull()
    expect(fs.existsSync(file)).toBe(false)
    expect(fs.existsSync(`${file}.ipull`)).toBe(false)
    expect(calls).toContain('deactivate')
    expect(repos.settings.get('active_model_id')).toBeNull()
    const overview = await manager.overview()
    expect(overview.installed).toEqual([])
    expect(overview.catalog[0]!.state).toBe('not_downloaded')
    // O registro fica (status "error") para as métricas continuarem apontando para ele.
    expect(repos.models.get(installed!.modelId)?.status).toBe('error')
  })

  it('fora da pasta do app: o app esquece o modelo, mas o arquivo fica', async () => {
    const file = path.join(downloads, 'Medio.gguf')
    fs.writeFileSync(file, CONTENT.b)
    await manager.adopt('qwen3-1_7b')
    const [installed] = (await manager.overview()).installed
    const result = await manager.remove(installed!.modelId)
    expect(result.keptFile).toBe(file)
    expect(fs.existsSync(file)).toBe(true)
    expect(calls).toContain(`unload:${installed!.modelId}`)
    // Como o arquivo continua lá, ele volta a aparecer como "encontrado".
    expect((await manager.overview()).found.map((f) => f.key)).toEqual(['qwen3-1_7b'])
  })

  it('lista vários modelos instalados, na ordem do catálogo, para escolher', async () => {
    fs.writeFileSync(path.join(appDir, 'Medio.gguf'), CONTENT.b)
    fs.writeFileSync(path.join(appDir, 'Leve.gguf'), CONTENT.a)
    await manager.adopt('qwen3-1_7b')
    await manager.adopt('llama32-1b')
    const { installed } = await manager.overview()
    expect(installed.map((m) => m.catalogKey)).toEqual(['llama32-1b', 'qwen3-1_7b'])
    repos.settings.set('active_model_id', installed[1]!.modelId)
    expect((await manager.overview()).installed.map((m) => m.active)).toEqual([false, true])
  })
})
