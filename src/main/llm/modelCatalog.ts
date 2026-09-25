// Catálogo embutido de modelos recomendados.
// Repositórios, nomes de arquivo, tamanhos e SHA-256 conferidos no Hugging Face (API /tree/main) em 2026-09-25.

export interface CatalogModel {
  key: 'llama32-1b' | 'qwen3-1_7b' | 'llama32-3b'
  displayName: string
  friendlyName: string
  description: string
  quantization: string
  /** URI no formato aceito pelo node-llama-cpp: hf:<usuário>/<repo>/<arquivo>. */
  uri: string
  fileName: string
  sizeBytes: number
  sha256: string
  minRamGb: number
}

export const MODEL_CATALOG: readonly CatalogModel[] = [
  {
    key: 'llama32-1b',
    displayName: 'Llama 3.2 1B Instruct',
    friendlyName: 'Leve e rápido',
    description: 'Português suportado oficialmente. O mais leve: bom para computadores simples.',
    quantization: 'Q4_K_M',
    uri: 'hf:bartowski/Llama-3.2-1B-Instruct-GGUF/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    fileName: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    sizeBytes: 807_694_464,
    sha256: '6f85a640a97cf2bf5b8e764087b1e83da0fdb51d7c9fab7d0fece9385611df83',
    minRamGb: 4
  },
  {
    key: 'qwen3-1_7b',
    displayName: 'Qwen3 1.7B',
    friendlyName: 'Equilibrado',
    description: 'Raciocina melhor sobre os problemas. Pede um computador um pouco melhor.',
    quantization: 'Q4_K_M',
    uri: 'hf:unsloth/Qwen3-1.7B-GGUF/Qwen3-1.7B-Q4_K_M.gguf',
    fileName: 'Qwen3-1.7B-Q4_K_M.gguf',
    sizeBytes: 1_107_409_472,
    sha256: 'b139949c5bd74937ad8ed8c8cf3d9ffb1e99c866c823204dc42c0d91fa181897',
    minRamGb: 6
  },
  {
    key: 'llama32-3b',
    displayName: 'Llama 3.2 3B Instruct',
    friendlyName: 'Melhor qualidade',
    description: 'Textos mais caprichados. Para computadores com mais memória.',
    quantization: 'Q4_K_M',
    uri: 'hf:bartowski/Llama-3.2-3B-Instruct-GGUF/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    fileName: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    sizeBytes: 2_019_377_696,
    sha256: '6c1a2b41161032677be168d354123594c0e6e67d2b9227c84f296ad037c728ff',
    minRamGb: 8
  }
]

export function findCatalogModel(key: string): CatalogModel | undefined {
  return MODEL_CATALOG.find((m) => m.key === key)
}

/**
 * Recomendação pela RAM total. Conservadora de propósito: o 1B é o único que garante o enunciado
 * em ~10s num PC de escola com 8 GB; os maiores só quando sobra memória para o sistema e o navegador.
 */
export function recommendModel(totalRamBytes: number): CatalogModel['key'] {
  const gb = totalRamBytes / 1024 ** 3
  if (gb >= 15.5) return 'llama32-3b'
  if (gb >= 11.5) return 'qwen3-1_7b'
  return 'llama32-1b'
}
