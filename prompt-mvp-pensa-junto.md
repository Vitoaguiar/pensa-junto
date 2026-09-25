# Prompt — MVP "Pensa Junto" (Electron + SLM local)

> Cole este documento inteiro no agente de código. Ele descreve contexto, stack, arquitetura, design system, banco de dados, telas e critérios de aceite. "Pensa Junto" é um nome provisório.

---

## 0. Papel e forma de trabalhar

Você é um(a) engenheiro(a) sênior de software desktop e especialista em UI/UX para produtos educacionais infantis. Vai construir o MVP descrito abaixo.

Regras de trabalho:
- Trabalhe em etapas (seção 10). Ao fim de cada etapa, rode build, lint e testes antes de seguir.
- **Nada pode depender de internet em tempo de execução**, exceto o download do modelo (e a sincronização opcional da seção 6.3). Fontes, ícones e imagens ficam empacotados no app.
- Não invente códigos nem textos da BNCC. Use os da seção 5.1 e marque com `// TODO: conferir texto oficial da BNCC` onde a descrição for paráfrase.
- Todo texto da interface é em português do Brasil.
- Se algo desta especificação for tecnicamente inviável, explique o motivo e proponha a alternativa mais próxima, em vez de pular.

---

## 1. Contexto do produto

Professores de escolas públicas de periferia têm pouco tempo e pouca infraestrutura (muitas vezes sem internet). O app roda **100% offline** num computador da escola ou no notebook do professor, usando um **modelo de linguagem pequeno (SLM) local**.

Nesta fase existe apenas a **frente do aluno**:
1. O aluno se identifica com um **PIN de 4 dígitos**.
2. O app gera **questões de matemática alinhadas à BNCC** (MVP: 3º ano, unidade temática Números).
3. O aluno tenta resolver. **O app nunca entrega a resposta.**
4. Se travar, o aluno pede ajuda: dicas em níveis, reformulação da questão, exemplo parecido ou chat curto. A ajuda segue o método socrático, com perguntas que levam o aluno a chegar sozinho ao resultado.

Princípio central de arquitetura:
- **O código decide a matemática**: habilidade, números, resposta correta, passos e correção.
- **O SLM só cuida da linguagem**: contextualiza o enunciado, dá dicas, reformula e conversa.
- O SLM **nunca** corrige a resposta do aluno e **nunca** é a fonte da resposta correta.
- Se o SLM falhar ou o computador for fraco demais, o app continua funcionando com textos de fallback dos templates.

---

## 2. Stack

| Camada | Tecnologia |
|---|---|
| Base | Electron + electron-vite + React 18 + TypeScript (strict) |
| Estilo | Tailwind CSS com design tokens em CSS variables (seção 7) |
| Animação | Framer Motion (respeitando `prefers-reduced-motion`) |
| Estado | Zustand |
| Rotas | React Router com `HashRouter` |
| Ícones | lucide-react (traço 2px, cantos arredondados) |
| Fonte | Lexend via `@fontsource/lexend` (empacotada, offline) |
| SLM | `node-llama-cpp` (v3) no **processo main**, com modelos `.gguf` |
| Banco | SQLite com `better-sqlite3` + Drizzle ORM (migrations versionadas) |
| Testes | Vitest (núcleo) e Playwright para Electron (fluxo feliz) |
| Empacotamento | electron-builder, alvo Windows (NSIS); Linux AppImage como bônus |

Segurança do Electron: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` no renderer. Toda comunicação passa por IPC tipado via `preload` + `contextBridge`. Use uma CSP restritiva. Configure `asarUnpack` para os binários nativos (`better-sqlite3`, `node-llama-cpp`).

---

## 3. Arquitetura de pastas

```
src/
  core/                 # TypeScript PURO: sem electron, node, react ou fs
    bncc/skills.ts        # habilidades da BNCC do MVP
    templates/            # um arquivo por família de template
    rng.ts                # PRNG com seed (ex: mulberry32)
    generator.ts          # escolhe habilidade/template, gera params, resolve
    prompts.ts            # builders dos prompts (questão, dica, reformular, exemplo, chat)
    validation.ts         # validação das saídas do SLM
    tutor.ts              # orquestra: pedir ao LLM -> validar -> retry -> fallback
    answer.ts             # parse e comparação da resposta do aluno
    types.ts
  main/
    index.ts
    llm/
      engine.ts           # interface LlmEngine
      nodeLlamaEngine.ts  # implementação com node-llama-cpp
      modelCatalog.ts     # catálogo embutido de modelos recomendados
      modelManager.ts     # download, importação, verificação, ativação
    db/
      schema.ts           # Drizzle
      migrations/
      seed.ts             # habilidades BNCC + alunos de demonstração (dev)
      repositories/
    sync/
      supabaseSync.ts     # opcional, desligado sem chaves (seção 6.3)
    ipc/                  # handlers tipados
  preload/index.ts
  renderer/
    design/tokens.css
    components/           # Button, Card, NumericKeypad, PinDots, ProgressBar, ChatBubble, HintCard...
    screens/              # ModelSetup, TeacherArea, PinLogin, StudentHome, Session
    store/
supabase/migrations/0001_init.sql
.env.example
```

**Regra de ouro:** `src/core` não pode importar nada fora de si mesmo. Garanta isso com uma regra de ESLint (`no-restricted-imports`). Esse núcleo será reaproveitado depois num app React Native.

Interface do motor (a única coisa que o resto do app conhece do SLM):

```ts
export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

export interface GenerateRequest {
  messages: ChatMessage[];
  maxTokens?: number;      // padrão 200
  temperature?: number;    // padrão 0.7 (questões), 0.4 (dicas)
  onToken?: (chunk: string) => void; // streaming para a UI
  signal?: AbortSignal;
}

export interface LlmEngine {
  isReady(): boolean;
  load(modelFilePath: string): Promise<void>;
  unload(): Promise<void>;
  generate(req: GenerateRequest): Promise<string>;
}
```

- Carregue o modelo **uma vez** e reutilize o contexto.
- Faça streaming para o renderer via IPC.
- Se o modelo tiver modo de raciocínio (ex.: Qwen3), desative-o e remova qualquer bloco `<think>...</think>` da saída.
- Prefira gerar a próxima questão em segundo plano enquanto o aluno resolve a atual.

---

## 4. Catálogo de modelos

Catálogo embutido em `modelCatalog.ts`. Confirme os repositórios e nomes exatos dos arquivos no Hugging Face antes de fixar; use a sintaxe de URI suportada pelo `node-llama-cpp`.

| key | Modelo | Quantização | ~Tamanho | RAM mínima sugerida | Observação |
|---|---|---|---|---|---|
| `llama32-1b` | Llama 3.2 1B Instruct | Q4_K_M | ~0,8 GB | 4 GB | Português suportado oficialmente; mais leve |
| `qwen3-1_7b` | Qwen3 1.7B | Q4_K_M | ~1,1 GB | 6 GB | Melhor raciocínio; desativar thinking |
| `llama32-3b` | Llama 3.2 3B Instruct | Q4_K_M | ~2 GB | 8 GB | Melhor qualidade para PCs melhores |

Recomende automaticamente um modelo com base em `os.totalmem()`.

---

## 5. Núcleo pedagógico (`src/core`)

### 5.1 Habilidades do MVP (3º ano, unidade Números)

| Código | Resumo (paráfrase, conferir texto oficial) | Uso no MVP |
|---|---|---|
| EF03MA03 | Fatos básicos da adição e multiplicação, cálculo mental/escrito | Contas diretas curtas |
| EF03MA05 | Procedimentos de cálculo mental e escrito para adição e subtração | Adição/subtração até 999 |
| EF03MA06 | Problemas de adição e subtração: juntar, acrescentar, separar, retirar, comparar, completar | Problemas contextualizados |
| EF03MA07 | Problemas de multiplicação por 2, 3, 4, 5 e 10: parcelas iguais e disposição retangular | Problemas contextualizados |
| EF03MA08 | Problemas de divisão por números até 10: repartição equitativa e medida, com ou sem resto | MVP: resto zero; resto ≠ 0 como extensão |

### 5.2 Template

```ts
export interface QuestionTemplate<P> {
  id: string;                         // ex: 'add-sub.retirar.v1'
  skillCode: string;                  // ex: 'EF03MA06'
  operation: 'add' | 'sub' | 'mul' | 'div';
  meaning: string;                    // ex: 'retirar' — explicado ao LLM
  generateParams(rng: Rng): P;        // respeita os limites da habilidade
  solve(p: P): Answer;                // resposta correta, calculada em código
  steps(p: P): string[];              // passos da resolução (para o tutor, nunca mostrados inteiros)
  numbersInStatement(p: P): number[]; // números que precisam aparecer no enunciado
  fallbackStatement(p: P, theme: Theme): string;
  fallbackHints(p: P): [string, string, string]; // níveis 1, 2 e 3, sem a resposta
}

export type Answer = { kind: 'integer'; value: number }
  | { kind: 'division'; quotient: number; remainder: number };
```

- Crie pelo menos 2 templates por habilidade, com significados diferentes.
- Garanta resultados não negativos e números adequados ao ano.
- Temas sorteados (para variar): escola, feira, futebol, animais, cozinha, parque, biblioteca, festa junina, horta, brinquedos.
- Salve a `seed` de cada questão para que uma sessão retomada reconstrua exatamente a mesma questão.

### 5.3 Prompts (em `prompts.ts`)

Todos os prompts pedem frases curtas, vocabulário de criança de 8–9 anos e português do Brasil.

**Enunciado:**
```
Você cria problemas de matemática para crianças do 3º ano do ensino fundamental no Brasil.
Regras:
- Frases curtas e palavras simples. No máximo 3 frases.
- Use EXATAMENTE estes números, escritos com algarismos: {numeros}.
- Não use nenhum outro número.
- A situação deve representar: {significado da operação}.
- Termine com uma pergunta.
- NÃO escreva a conta, NÃO escreva a resposta.
- Responda somente com o enunciado.
Tema: {tema}
```

**Tutor (dicas e chat):** recebe enunciado, resposta correta marcada como segredo, passos e histórico recente.
```
Você é um tutor paciente e animado de uma criança do 3º ano.
Problema: "{enunciado}"
Resposta correta (SEGREDO — NUNCA diga, nem indiretamente): {resposta}
Passos da resolução: {passos}
Última tentativa da criança: {tentativa ou "nenhuma"}
Nível da ajuda: {1 = pergunta que faz pensar | 2 = aponta o próximo passo | 3 = guia o passo com números menores ou uma parte da conta}
Regras:
- NUNCA diga o resultado final nem faça a conta inteira.
- Faça UMA pergunta curta por vez. Máximo 2 frases.
- Se a criança errou, não diga "errado"; ajude a descobrir onde a conta mudou.
- Fale só de matemática. Se ela falar de outro assunto, volte gentilmente para o problema.
```

Tipos de ajuda:
- **Dica (níveis 1 → 2 → 3):** cada clique sobe um nível.
- **"Não entendi":** reformula o enunciado com palavras ainda mais simples, mantendo os números.
- **"Exemplo parecido":** o código gera um problema análogo com números **menores e diferentes** e sua resposta. O LLM explica esse exemplo passo a passo. É permitido mostrar a resposta **do exemplo**, nunca a da questão original.
- **Chat livre:** limite de 200 caracteres por mensagem; mesmas regras do tutor.

### 5.4 Validação (`validation.ts`)

Antes de mostrar qualquer saída do SLM:
- **Enunciado:** contém todos os `numbersInStatement`; não contém a resposta; não contém outros números; tem até 400 caracteres; termina com `?`; sem blocos `<think>`.
- **Dica/reformulação/chat:** não contém o número da resposta (normalize formatos: `1000`, `1.000`, `mil`, e escrita por extenso até 1000); não contém a expressão completa com resultado (ex.: `347 - 125 = `).
- **Retry:** até 3 tentativas. Depois, usar o fallback do template e registrar em `generation_logs` com `fell_back = 1`.

### 5.5 Correção

O código compara a resposta do aluno com `solve(params)`, aceitando espaços e zeros à esquerda. Não há "desistir e ver resposta". Depois da dica nível 3 e de 3 tentativas erradas, oferecer: "Chamar o professor" (marca a questão como `needs_teacher`) ou "Tentar outra questão" (marca como `skipped`).

---

## 6. Banco de dados

### 6.1 Convenções (já preparado para sincronizar na nuvem)
- IDs `TEXT` com UUID v4, gerados no app.
- Datas `TEXT` ISO-8601 em UTC.
- Tabelas sincronizáveis têm `created_at`, `updated_at`, `deleted_at` (soft delete) e `synced_at`.
- JSON guardado como `TEXT`.
- Arquivo do banco em `app.getPath('userData')/pensa-junto.db`; `PRAGMA foreign_keys = ON`; `journal_mode = WAL`.

### 6.2 Esquema SQLite (implementar em Drizzle, gerar migration `0001_init`)

```sql
CREATE TABLE settings (
  key         TEXT PRIMARY KEY,           -- 'active_model_id', 'teacher_password_hash', 'pin_pepper', 'onboarding_done'
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE llm_models (
  id              TEXT PRIMARY KEY,
  catalog_key     TEXT,                   -- NULL quando importado manualmente
  display_name    TEXT NOT NULL,
  file_path       TEXT NOT NULL,
  file_size_bytes INTEGER,
  quantization    TEXT,
  source          TEXT NOT NULL CHECK (source IN ('catalog','imported')),
  status          TEXT NOT NULL CHECK (status IN ('downloading','ready','error')),
  sha256          TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE classrooms (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,             -- ex: '3º ano B'
  grade        INTEGER NOT NULL CHECK (grade BETWEEN 1 AND 5),
  school_year  INTEGER NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT,
  synced_at    TEXT
);

CREATE TABLE students (
  id            TEXT PRIMARY KEY,
  classroom_id  TEXT REFERENCES classrooms(id),
  full_name     TEXT NOT NULL,
  display_name  TEXT NOT NULL,            -- como o app chama a criança: 'Ana'
  grade         INTEGER NOT NULL CHECK (grade BETWEEN 1 AND 5),
  pin_hash      TEXT NOT NULL,            -- HMAC-SHA256(pin, settings.pin_pepper)
  avatar_key    TEXT NOT NULL,            -- ícone escolhido de um conjunto fixo
  color_key     TEXT NOT NULL,            -- uma das cores de avatar do design system
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT,
  synced_at     TEXT
);
CREATE UNIQUE INDEX ux_students_pin_active ON students(pin_hash)
  WHERE deleted_at IS NULL AND is_active = 1;

CREATE TABLE bncc_skills (
  code                 TEXT PRIMARY KEY,  -- 'EF03MA06'
  grade                INTEGER NOT NULL,
  thematic_unit        TEXT NOT NULL,     -- 'Números'
  object_of_knowledge  TEXT,
  description          TEXT NOT NULL,
  is_enabled           INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE sessions (                   -- uma "conversa"
  id                TEXT PRIMARY KEY,
  student_id        TEXT NOT NULL REFERENCES students(id),
  title             TEXT NOT NULL,        -- ex: 'Multiplicação · feira'
  focus             TEXT NOT NULL CHECK (focus IN ('add_sub','mul','div','mixed')),
  status            TEXT NOT NULL CHECK (status IN ('active','finished','archived')),
  questions_target  INTEGER NOT NULL DEFAULT 5,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  last_activity_at  TEXT NOT NULL,
  deleted_at        TEXT,
  synced_at         TEXT
);
CREATE INDEX ix_sessions_student_activity ON sessions(student_id, last_activity_at DESC);

CREATE TABLE questions (
  id                   TEXT PRIMARY KEY,
  session_id           TEXT NOT NULL REFERENCES sessions(id),
  student_id           TEXT NOT NULL REFERENCES students(id),
  position             INTEGER NOT NULL,  -- ordem dentro da sessão
  skill_code           TEXT NOT NULL REFERENCES bncc_skills(code),
  template_id          TEXT NOT NULL,
  seed                 INTEGER NOT NULL,
  params_json          TEXT NOT NULL,
  correct_answer_json  TEXT NOT NULL,     -- nunca enviado ao renderer
  statement            TEXT NOT NULL,
  statement_source     TEXT NOT NULL CHECK (statement_source IN ('llm','fallback')),
  theme                TEXT NOT NULL,
  status               TEXT NOT NULL CHECK (status IN ('pending','correct','skipped','needs_teacher')),
  hints_used           INTEGER NOT NULL DEFAULT 0,
  attempts_count       INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL,
  answered_at          TEXT,
  updated_at           TEXT NOT NULL,
  deleted_at           TEXT,
  synced_at            TEXT
);
CREATE INDEX ix_questions_session ON questions(session_id, position);

CREATE TABLE attempts (
  id           TEXT PRIMARY KEY,
  question_id  TEXT NOT NULL REFERENCES questions(id),
  answer_json  TEXT NOT NULL,
  is_correct   INTEGER NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT,
  synced_at    TEXT
);

CREATE TABLE messages (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES sessions(id),
  question_id  TEXT REFERENCES questions(id),
  role         TEXT NOT NULL CHECK (role IN ('student','tutor','event')),
  kind         TEXT NOT NULL CHECK (kind IN ('chat','hint','rephrase','example','feedback','event')),
  hint_level   INTEGER CHECK (hint_level BETWEEN 1 AND 3),
  content      TEXT NOT NULL,
  source       TEXT NOT NULL CHECK (source IN ('llm','fallback','system')),
  model_id     TEXT REFERENCES llm_models(id),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT,
  synced_at    TEXT
);
CREATE INDEX ix_messages_session ON messages(session_id, created_at);

CREATE TABLE generation_logs (            -- métricas para o pitch e para depurar
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,              -- 'statement','hint','rephrase','example','chat'
  model_id    TEXT REFERENCES llm_models(id),
  latency_ms  INTEGER NOT NULL,
  retries     INTEGER NOT NULL,
  fell_back   INTEGER NOT NULL,
  created_at  TEXT NOT NULL
);
```

Seed:
- `bncc_skills` com as habilidades da seção 5.1.
- Em modo desenvolvimento, uma turma e 3 alunos de demonstração: Ana (PIN 1234), Bruno (PIN 2468), Caio (PIN 1357).
- `pin_pepper` gerado aleatoriamente na primeira execução.

### 6.3 Sincronização opcional (pronta para colocar a key)

Crie `.env.example`:
```
# Sincronização com Supabase (opcional). Sem estas variáveis, o app funciona 100% local.
MAIN_VITE_SYNC_ENABLED=false
MAIN_VITE_SUPABASE_URL=
MAIN_VITE_SUPABASE_ANON_KEY=
```

- As variáveis são lidas **somente no processo main**, nunca expostas ao renderer.
- **Nunca** use a `service_role` key no app desktop.
- `supabaseSync.ts` só é ativado se `SYNC_ENABLED=true` e as duas chaves existirem. No MVP, apenas **push**: envia linhas com `synced_at IS NULL OR updated_at > synced_at`, em lotes, quando houver internet, e atualiza `synced_at`.
- `supabase/migrations/0001_init.sql`: o mesmo esquema em Postgres (`uuid`, `timestamptz`, `boolean`, `jsonb`), com **RLS habilitado em todas as tabelas**. As policies ficam como `TODO` documentado.
- Tabelas que **não** sincronizam: `settings`, `llm_models`, `generation_logs`.

---

## 7. Design system

Direção: **clean, dinâmico e acolhedor, sem ser infantilizado.** Referência de sensação: um caderno novo e bem organizado. Nada de mascote cartunesco, sombras pesadas ou arco-íris. A alegria vem de cor usada com propósito, formas geométricas simples (círculos, quadrados arredondados e triângulos, que conversam com a matemática) e micro-animações.

### 7.1 Paleta (tokens em `tokens.css`)

| Token | Hex | Uso |
|---|---|---|
| `--bg` | `#F6F7FB` | Fundo das telas ("papel") |
| `--surface` | `#FFFFFF` | Cards, teclado, balões do tutor |
| `--surface-2` | `#EDF0F8` | Áreas secundárias, inputs |
| `--border` | `#DDE2EE` | Divisores e bordas sutis |
| `--ink` | `#1E2240` | Texto principal |
| `--ink-muted` | `#5B6180` | Texto secundário |
| `--primary` | `#4F5BD5` | **Anil**: ações principais, foco, marca (texto branco passa em AA) |
| `--primary-strong` | `#3B45B0` | Hover/pressed |
| `--primary-soft` | `#E7E9FC` | Fundos de destaque, balão do aluno |
| `--accent` | `#14B8C4` | **Turquesa**: elementos dinâmicos, progresso, decoração |
| `--accent-soft` | `#DDF6F8` | Fundos |
| `--hint` | `#FFB547` | **Sol**: tudo que é dica (ícone de lâmpada, cards de dica) |
| `--hint-soft` | `#FFF3DD` | Fundo dos cards de dica |
| `--hint-ink` | `#7A4B00` | Texto sobre `--hint-soft` |
| `--success` | `#1FA97A` | **Menta**: acerto (ícones, preenchimentos) |
| `--success-strong` | `#0E7A56` | Texto de sucesso |
| `--success-soft` | `#DDF5EC` | Fundo de feedback de acerto |
| `--retry` | `#F07A5A` | **Coral**: "vamos tentar de novo" (usar com texto `--ink`, nunca branco) |
| `--retry-soft` | `#FDE8E2` | Fundo do feedback de erro |
| `--danger` | `#C93C3C` | Apenas erros técnicos nas telas de adulto |

Cores de avatar (`color_key`): anil, turquesa, sol, menta, coral e lilás `#9B7BE0`.

Regras:
- **Nunca** use vermelho ou "X" para erro do aluno. Erro é coral suave com mensagem encorajadora.
- Todo texto precisa passar WCAG AA (4,5:1; 3:1 para textos ≥ 24px). Verifique os pares que usar.
- Só modo claro no MVP (projetores e telas antigas de escola).

### 7.2 Tipografia
- Lexend (400, 500, 600, 700). Ela foi desenhada para facilitar a leitura, o que é ótimo para quem está aprendendo a ler bem.
- Escala: corpo 18px · texto de apoio 16px · botões 20px/600 · título 32px/700 · **enunciado 26–28px/500, altura de linha 1.5** · números no teclado 32px/600.
- Números com `font-variant-numeric: tabular-nums`.

### 7.3 Forma, espaço e movimento
- Grid de 8px. Raio: 12px (inputs), 20px (cards), 999px (chips e botões de pílula).
- Sombra única e suave: `0 4px 16px rgba(30,34,64,.08)`.
- Alvos de clique com no mínimo 56px (64px no teclado numérico), pensando em telas touch e mouse impreciso.
- Movimento de 150–250ms, com easing `cubic-bezier(.2,.8,.2,1)`.
  - Acerto: pequeno "pop" com spring + 6–8 formas geométricas coloridas saindo do card (sem confete exagerado, até 800ms).
  - PIN errado: *shake* horizontal.
  - Dica: card desliza de baixo.
- Tudo desliga com `prefers-reduced-motion`.
- Decoração de fundo: 2–3 formas geométricas grandes em `--primary-soft`/`--accent-soft`, parcialmente fora da tela, com leve parallax ao trocar de tela.
- Janela: mínimo 1024×700, otimizada para 1366×768. Opção de tela cheia (F11) para uso em sala.

### 7.4 Tom de voz
Frases curtas, na segunda pessoa, encorajadoras:
- Acerto: "Isso aí, Ana! Você chegou lá."
- Erro: "Quase! Vamos olhar juntos?"
- Carregando: "Pensando numa questão pra você…"

Nunca "Errado", "Incorreto" ou "Falhou".

### 7.5 Componentes base
`Button` (primary, secondary, ghost, hint), `Card`, `NumericKeypad`, `PinDots`, `Avatar`, `ProgressDots` (progresso da sessão), `ChatBubble` (aluno/tutor, com streaming "digitando"), `HintCard` (com nível 1–3), `SessionCard`, `EmptyState`, `Toast`, `Modal`.

Acessibilidade:
- Navegação completa por teclado, com foco visível (anel de 3px em `--primary`).
- `aria-live="polite"` no balão do tutor.
- Rótulos em todos os botões de ícone.

---

## 8. Telas e fluxos

Fluxo:
```
Primeira execução:
  Boas-vindas -> Criar senha do professor -> Seleção de modelo -> Cadastro de alunos -> PIN
Execuções seguintes:
  PIN -> Início do aluno -> Sessão (nova ou retomada)
```
A área do professor é acessível pelo ícone de engrenagem na tela de PIN e pede a senha.

### 8.1 Seleção de modelo (público: adulto)
- Cabeçalho: "Escolha o cérebro do app", com a explicação: "O modelo é baixado uma única vez. Depois disso, tudo funciona sem internet."
- Mostra a RAM do computador e marca um modelo como **Recomendado para este computador**.
- Um card por modelo do catálogo, com nome amigável, tamanho, RAM mínima, descrição de uma linha e estado:
  - Não baixado → botão **Baixar**
  - Baixando → barra de progresso com %, MB/s e botão cancelar; download retomável
  - Pronto → botões **Testar** e **Usar este**
  - Erro → mensagem e botão **Tentar de novo**
- **Importar arquivo .gguf** do computador (para levar o modelo por pendrive a escolas sem internet). Validar extensão e abrir o arquivo como teste.
- **Testar** gera um enunciado de exemplo e mostra o tempo que levou. Se passar de 20s, avisar que o computador pode ficar lento e sugerir um modelo menor.
- Checar espaço em disco antes de baixar.
- Se não houver modelo, o app ainda funciona **em modo básico**: enunciados e dicas de fallback. Mostrar um aviso discreto disso.

### 8.2 Área do professor (mínima)
- Trocar o modelo ativo (leva à 8.1).
- Turmas e alunos: criar, editar, desativar.
  - Ao criar um aluno: nome completo, nome de exibição, ano, avatar e cor.
  - O PIN é **gerado automaticamente** (4 dígitos, único entre alunos ativos, sem sequências óbvias como 0000 ou 1234 em produção) e mostrado uma vez, com opção "Gerar outro".
  - Opção de "Redefinir PIN".
- Botão **Imprimir cartões de PIN** (nome + avatar + PIN), para a turma.

### 8.3 PIN (público: criança)
- Centro da tela: "Oi! Digite seu código secreto", 4 `PinDots` e `NumericKeypad` grande (1–9, 0, apagar). Aceita também o teclado físico.
- Ao completar os 4 dígitos, valida automaticamente (sem botão "entrar").
- Erro: *shake* + "Hmm, esse código não é de ninguém. Tenta de novo?". Depois de 5 erros seguidos, espera de 30s com contagem visível.
- Acerto: transição para uma tela breve (800ms) com avatar e "Oi, Ana!", e depois o Início.
- Engrenagem discreta no canto (área do professor).

### 8.4 Início do aluno
- Topo: avatar, "Oi, Ana!" e botão **Trocar de aluno** (volta ao PIN).
- **Card principal "Nova conversa"** (maior, `--primary`), que abre a escolha de foco em 4 cards grandes com ícone:
  - Somar e subtrair (`add_sub`)
  - Multiplicar (`mul`)
  - Dividir (`div`)
  - Um pouco de tudo (`mixed`)
  Tocar num foco cria a sessão e abre a tela 8.5.
- **Seção "Continuar"**: lista das sessões `active` do aluno, ordenadas por `last_activity_at`. Cada `SessionCard` mostra título, ícone do foco, `ProgressDots` (ex.: 3 de 5), "há 2 dias" e botão **Continuar**.
- Estado vazio: "Você ainda não começou nenhuma conversa. Que tal a primeira?"
- Sessões `finished` aparecem numa aba secundária "Terminadas" (só leitura).

### 8.5 Sessão (conversa)
Layout em duas colunas no desktop (empilha abaixo de 1100px):

**Coluna principal (60%)**
- `ProgressDots` da sessão no topo.
- **Card da questão**: enunciado em 26–28px e chip discreto com a habilidade (ex.: "EF03MA06").
- Campo de resposta grande + `NumericKeypad`. Para divisão com resto, dois campos: "quociente" e "resto".
- Botão **Conferir**.
- Barra de ajuda com 3 botões:
  - 💡 **Me dá uma dica** (mostra o nível: 1/3, 2/3, 3/3)
  - **Não entendi**
  - **Exemplo parecido**

**Coluna lateral (40%): conversa com o tutor**
- Histórico de balões: aluno à direita (`--primary-soft`), tutor à esquerda (`--surface`), dicas como `HintCard` (`--hint-soft`).
- Streaming do texto com indicador "digitando".
- Input de chat com limite de 200 caracteres.

**Comportamento**
- **Acerto:** feedback `--success-soft`, animação, mensagem com o nome, e botão **Próxima**. A próxima questão já deve estar pré-gerada.
- **Erro:** feedback `--retry-soft`, "Quase! Vamos olhar juntos?", e o tutor faz automaticamente uma pergunta baseada na tentativa. Não revelar a resposta.
- Depois da dica 3/3 e de 3 erros: oferecer **Chamar o professor** e **Tentar outra questão**.
- Ao completar `questions_target`: tela de conclusão com resumo gentil ("Você resolveu 5 questões e usou 2 dicas!") e a sessão vira `finished`.
- Tudo é salvo a cada interação. Fechar o app e voltar pelo "Continuar" restaura a questão atual (pela `seed`), as tentativas e o histórico do chat.
- A resposta correta **nunca** trafega para o renderer. A conferência é feita via IPC no main.

---

## 9. IPC (exemplos de canais tipados)

```
models:list | models:download | models:cancelDownload | models:import | models:test | models:activate
models:onProgress (evento)
auth:verifyPin | auth:setTeacherPassword | auth:verifyTeacherPassword
students:list | students:create | students:update | students:resetPin
sessions:listByStudent | sessions:create | sessions:get
questions:next | questions:submitAnswer
tutor:hint | tutor:rephrase | tutor:example | tutor:chat
tutor:onToken (evento de streaming)
```

Valide todos os payloads no main (com zod).

---

## 10. Etapas de entrega

1. **Scaffold**: electron-vite + React + TS + Tailwind + tokens + fonte local + ESLint (com a regra do `core`) + Vitest. Tela vazia com o design system aplicado.
2. **Banco**: schema Drizzle, migration, seed, repositórios, testes dos repositórios.
3. **Núcleo**: RNG, templates das 5 habilidades, generator, answer, validation, prompts, com testes unitários.
   - Todos os templates geram resultados válidos para 1.000 seeds.
   - A validação pega respostas vazadas em diferentes formatos.
4. **Motor LLM**: `LlmEngine` com node-llama-cpp, catálogo, download retomável, importação e teste. `tutor.ts` com retry e fallback.
5. **Telas**: seleção de modelo, área do professor, PIN, início.
6. **Sessão**: fluxo completo com streaming, dicas, retomada e conclusão.
7. **Polimento e empacotamento**: animações, estados vazios e de erro, instalador Windows, e um README com como rodar, como trocar de modelo e como ativar a sincronização.

---

## 11. Critérios de aceite do MVP

- [ ] Com o modelo baixado e o Wi-Fi desligado, todo o fluxo funciona.
- [ ] Sem nenhum modelo, o app funciona em modo básico, com fallbacks.
- [ ] Um aluno com PIN válido vê apenas as próprias sessões.
- [ ] Nenhuma tela, dica ou mensagem mostra a resposta da questão atual (testado automaticamente na validação e manualmente em 30 questões).
- [ ] Fechar o app no meio de uma questão e retomar restaura exatamente a mesma questão e o mesmo chat.
- [ ] Em um PC com 8 GB de RAM e o modelo `llama32-1b`, o enunciado aparece em até ~10s, com streaming começando antes disso.
- [ ] Contraste AA verificado, navegação por teclado completa, `prefers-reduced-motion` respeitado.
- [ ] O app funciona sem as variáveis de sincronização; com elas, o push para o Supabase funciona.
- [ ] `src/core` não importa nada de electron, node ou react.
