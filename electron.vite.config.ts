import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const alias = {
  '@core': resolve(__dirname, 'src/core'),
  '@shared': resolve(__dirname, 'src/shared')
}

export default defineConfig({
  main: {
    resolve: { alias },
    build: {
      rollupOptions: {
        // node-llama-cpp é ESM puro e carrega binários nativos: sempre externo.
        external: ['node-llama-cpp', 'better-sqlite3']
      }
    }
  },
  preload: {
    resolve: { alias }
  },
  renderer: {
    resolve: { alias },
    plugins: [react()]
  }
})
