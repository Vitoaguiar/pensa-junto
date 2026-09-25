-- Pensa Junto — esquema espelho no Postgres (Supabase) para a sincronização OPCIONAL.
-- Mesmas tabelas sincronizáveis do SQLite local, com tipos nativos: uuid, timestamptz, boolean, jsonb.
-- Não sincronizam (ficam só no computador): settings, llm_models, generation_logs.
--
-- O app desktop só faz PUSH (upsert por id) usando a chave ANON. Por isso:
--   * RLS está HABILITADO em todas as tabelas (sem policy, ninguém lê nem escreve);
--   * as policies abaixo estão como TODO: devem ser escritas junto com o modelo de autenticação
--     das escolas (ex.: um usuário por computador/escola com claim "school_id").
--   * NUNCA coloque a service_role key no app desktop.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Habilidades BNCC (referência; semeadas aqui, não enviadas pelo app)
-- TODO: conferir texto oficial da BNCC
-- ---------------------------------------------------------------------------
create table public.bncc_skills (
  code                 text primary key,
  grade                integer not null,
  thematic_unit        text not null,
  object_of_knowledge  text,
  description          text not null,
  is_enabled           boolean not null default true
);

insert into public.bncc_skills (code, grade, thematic_unit, object_of_knowledge, description) values
  ('EF03MA03', 3, 'Números', 'Construção de fatos fundamentais da adição e da multiplicação',
   'Construir e utilizar fatos básicos da adição e da multiplicação para o cálculo mental ou escrito.'),
  ('EF03MA05', 3, 'Números', 'Procedimentos de cálculo (mental e escrito) com números naturais: adição e subtração',
   'Utilizar diferentes procedimentos de cálculo mental e escrito para resolver problemas significativos envolvendo adição e subtração com números naturais.'),
  ('EF03MA06', 3, 'Números', 'Problemas envolvendo significados da adição e da subtração',
   'Resolver e elaborar problemas de adição e subtração com os significados de juntar, acrescentar, separar, retirar, comparar e completar quantidades, utilizando diferentes estratégias de cálculo.'),
  ('EF03MA07', 3, 'Números', 'Problemas envolvendo diferentes significados da multiplicação',
   'Resolver e elaborar problemas de multiplicação (por 2, 3, 4, 5 e 10) com os significados de adição de parcelas iguais e elementos apresentados em disposição retangular.'),
  ('EF03MA08', 3, 'Números', 'Problemas envolvendo diferentes significados da divisão',
   'Resolver e elaborar problemas de divisão de um número natural por outro (até 10), com resto zero e com resto diferente de zero, com os significados de repartição equitativa e de medida.');

-- ---------------------------------------------------------------------------
-- Tabelas sincronizáveis
-- ---------------------------------------------------------------------------
create table public.classrooms (
  id           uuid primary key,
  name         text not null,
  grade        integer not null check (grade between 1 and 5),
  school_year  integer not null,
  created_at   timestamptz not null,
  updated_at   timestamptz not null,
  deleted_at   timestamptz
);

create table public.students (
  id            uuid primary key,
  classroom_id  uuid references public.classrooms(id),
  full_name     text not null,
  display_name  text not null,
  grade         integer not null check (grade between 1 and 5),
  pin_hash      text not null,          -- HMAC-SHA256 com pepper que fica só no computador da escola
  avatar_key    text not null,
  color_key     text not null,
  is_active     boolean not null default true,
  created_at    timestamptz not null,
  updated_at    timestamptz not null,
  deleted_at    timestamptz
);
-- Sem índice único de PIN aqui: a unicidade é por computador (cada um tem o próprio pepper).

create table public.sessions (
  id                uuid primary key,
  student_id        uuid not null references public.students(id),
  title             text not null,
  focus             text not null check (focus in ('add_sub','mul','div','mixed')),
  status            text not null check (status in ('active','finished','archived')),
  questions_target  integer not null default 5,
  created_at        timestamptz not null,
  updated_at        timestamptz not null,
  last_activity_at  timestamptz not null,
  deleted_at        timestamptz
);
create index ix_sessions_student_activity on public.sessions (student_id, last_activity_at desc);

create table public.questions (
  id                   uuid primary key,
  session_id           uuid not null references public.sessions(id),
  student_id           uuid not null references public.students(id),
  position             integer not null,
  skill_code           text not null references public.bncc_skills(code),
  template_id          text not null,
  seed                 bigint not null,
  params_json          jsonb not null,
  correct_answer_json  jsonb not null,
  statement            text not null,
  statement_source     text not null check (statement_source in ('llm','fallback')),
  theme                text not null,
  status               text not null check (status in ('pending','correct','skipped','needs_teacher')),
  hints_used           integer not null default 0,
  attempts_count       integer not null default 0,
  created_at           timestamptz not null,
  answered_at          timestamptz,
  updated_at           timestamptz not null,
  deleted_at           timestamptz
);
create index ix_questions_session on public.questions (session_id, position);

create table public.attempts (
  id           uuid primary key,
  question_id  uuid not null references public.questions(id),
  answer_json  jsonb not null,
  is_correct   boolean not null,
  created_at   timestamptz not null,
  updated_at   timestamptz not null,
  deleted_at   timestamptz
);

create table public.messages (
  id           uuid primary key,
  session_id   uuid not null references public.sessions(id),
  question_id  uuid references public.questions(id),
  role         text not null check (role in ('student','tutor','event')),
  kind         text not null check (kind in ('chat','hint','rephrase','example','feedback','event')),
  hint_level   integer check (hint_level between 1 and 3),
  content      text not null,
  source       text not null check (source in ('llm','fallback','system')),
  model_id     text,                    -- llm_models não sincroniza: fica só o id, sem FK
  created_at   timestamptz not null,
  updated_at   timestamptz not null,
  deleted_at   timestamptz
);
create index ix_messages_session on public.messages (session_id, created_at);

-- ---------------------------------------------------------------------------
-- Row Level Security: HABILITADO em todas as tabelas.
-- ---------------------------------------------------------------------------
alter table public.bncc_skills enable row level security;
alter table public.classrooms  enable row level security;
alter table public.students    enable row level security;
alter table public.sessions    enable row level security;
alter table public.questions   enable row level security;
alter table public.attempts    enable row level security;
alter table public.messages    enable row level security;

-- TODO(policies): definir antes de ligar a sincronização em produção.
-- Sugestão de caminho:
--   1. Cada computador de escola autentica como um usuário do Supabase Auth (e-mail técnico ou
--      login anônimo vinculado), com app_metadata.school_id.
--   2. Adicionar a coluna school_id (uuid) em classrooms e students, preenchida pelo app.
--   3. Policies de INSERT/UPDATE: permitir só linhas cujo school_id = auth.jwt() -> 'app_metadata' ->> 'school_id'
--      (sessions/questions/attempts/messages checam via join com students).
--   4. Policies de SELECT: só para o painel do professor/secretaria, nunca para a chave anon pura.
--
-- Exemplo (NÃO aplicar sem revisar):
-- create policy "escola insere as próprias turmas" on public.classrooms
--   for insert to authenticated
--   with check (school_id = ((auth.jwt() -> 'app_metadata' ->> 'school_id')::uuid));
--
-- Enquanto não houver policies, o upsert com a chave anon é recusado pelo RLS:
-- é o comportamento seguro por padrão.

create policy "bncc leitura pública" on public.bncc_skills for select using (true);
