import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { CatalogModel } from './modelCatalog'

// Procura, no computador, arquivos oficiais do catálogo baixados antes (pelo app, pelo node-llama-cpp,
// pelo LM Studio ou pelo navegador). Só nome + tamanho exato aqui (é barato); o SHA-256 é conferido
// antes de usar o arquivo, em ModelManager.adopt().

export interface SearchDir {
  dir: string
  /** Quantos níveis de subpastas olhar (0 = só a própria pasta). */
  depth: number
}

export interface DiscoveredFile {
  key: CatalogModel['key']
  filePath: string
  sizeBytes: number
}

const MAX_ENTRIES = 5000

export function defaultSearchDirs(modelsDir: string): SearchDir[] {
  const home = os.homedir()
  return [
    { dir: modelsDir, depth: 0 },
    { dir: path.join(home, '.node-llama-cpp', 'models'), depth: 1 },
    { dir: path.join(home, 'Downloads'), depth: 1 },
    { dir: path.join(home, 'Desktop'), depth: 1 },
    { dir: path.join(home, 'Documents'), depth: 1 },
    { dir: path.join(home, '.lmstudio', 'models'), depth: 3 },
    { dir: path.join(home, '.cache', 'lm-studio', 'models'), depth: 3 }
  ]
}

export async function discoverCatalogFiles(
  searchDirs: readonly SearchDir[],
  catalog: readonly CatalogModel[]
): Promise<DiscoveredFile[]> {
  const byName = new Map(catalog.map((m) => [m.fileName.toLowerCase(), m]))
  const found = new Map<string, DiscoveredFile>()
  let visited = 0

  async function walk(dir: string, depth: number): Promise<void> {
    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true })
    } catch {
      return // pasta que não existe ou sem permissão
    }
    for (const entry of entries) {
      if (++visited > MAX_ENTRIES) return
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (depth > 0 && entry.name !== 'node_modules') await walk(full, depth - 1)
        continue
      }
      const model = byName.get(entry.name.toLowerCase())
      if (!model || found.has(model.key)) continue
      try {
        const { size } = await fs.promises.stat(full)
        if (size === model.sizeBytes) found.set(model.key, { key: model.key, filePath: full, sizeBytes: size })
      } catch {
        // arquivo sumiu no meio da busca
      }
    }
  }

  // Em ordem: a pasta do app primeiro (é o lugar preferido quando o mesmo arquivo está em dois lugares).
  for (const { dir, depth } of searchDirs) await walk(dir, depth)
  return [...found.values()]
}

/** O arquivo está dentro da pasta de modelos do app? (Só esses o app apaga ao remover.) */
export function isInside(dir: string, file: string): boolean {
  const relative = path.relative(path.resolve(dir), path.resolve(file))
  return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative)
}
