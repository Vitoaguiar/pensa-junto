import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'node_modules/**', 'src/main/db/migrations/**', '*.cjs', 'test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: globals.node }
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules
  },
  {
    // REGRA DE OURO: src/core é TypeScript puro, reaproveitável no React Native.
    files: ['src/core/**/*.ts'],
    // Os testes usam o vitest; eles não vão para o bundle nem para o React Native.
    ignores: ['src/core/**/*.test.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: String.raw`^(?!\.{1,2}/)`,
              message: 'src/core só pode importar arquivos relativos dentro do próprio core (sem electron, node, react ou pacotes).'
            },
            {
              regex: String.raw`^\.\./\.\./`,
              message: 'src/core não pode importar nada fora de src/core.'
            }
          ]
        }
      ],
      'no-restricted-globals': ['error', 'process', 'require', 'window', 'document', '__dirname', 'Buffer']
    }
  }
)
