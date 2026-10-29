# Plano — Automações nos databases (fila no Postgres + worker em Edge Function)

## Objetivo

Permitir regras **"quando → então"** por database, executadas **no servidor** (não
dependem do app estar aberto):

- **Gatilhos**: *linha criada*, *coluna mudou* (para um valor / ficou preenchida /
  ficou vazia / mudou qualquer coisa), *data chegou* (coluna de data vence hoje).
- **Ações**: *preencher valor* (na própria linha) e *criar linha* (opcionalmente a
  partir de um modelo existente, com valores definidos).
- **Encadeamento**: uma ação que gera escrita dispara as regras seguintes, com
  **teto de profundidade 3**.

Exemplos que precisam funcionar: "Status vira Concluído → preencher Data de
conclusão = hoje"; "Vence em chega → Status = Em andamento"; "linha criada com
Prioridade Alta → criar linha em *Revisões*" (e a linha criada já entra pelas
regras dela).

## Decisões (fechadas com o usuário)

1. Motor **no servidor**.
2. **Fila no Postgres** + **worker em TypeScript**.
3. Worker = **Edge Function (Deno)** em `supabase/functions/automation-worker`,
   agendado por `pg_cron` + `pg_net`.
4. Escopo v1: **3 gatilhos, 2 ações** (acima). Vincular relação e excluir ficam
   para depois.
5. Observabilidade: a regra guarda só `enabled` + `last_run_at` (sem UI de erros;
   o detalhe do job fica em `automation_jobs`, visível no painel do Supabase).
6. UI: nova sub-view **"Automações"** no `TableSettingsPopover` (o componente já
   navega entre `menu`/`edit`/`layout`/`visibility`).
7. Encadeamento **sim**, teto 3, profundidade propagada pelo worker via header
   `x-automation-depth` lido do GUC `request.headers` (o PostgREST o expõe).
8. **Casamento de regra (matching) em TS**; o SQL só (a) registra o evento com o
   diff de colunas e (b) identifica regras por data (`kind` + `columnId`).
9. Fuso: constante `America/Sao_Paulo` no cron + `APP_TIMEZONE` no worker
   (documentado como ajuste por deployment).

## Modelo de dados (Etapa 1)

### `public.database_automations` (regras; RLS por dono, como as demais tabelas)

```sql
create table if not exists public.database_automations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  database_id uuid not null references public.databases (id) on delete cascade,
  name        text not null default 'Nova automação',
  enabled     boolean not null default true,
  position    integer not null default 0,
  trigger     jsonb not null default '{}'::jsonb,
  actions     jsonb not null default '[]'::jsonb,
  last_run_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists database_automations_db_idx
  on public.database_automations (user_id, database_id, position);
```

RLS + 4 policies no padrão do repo (visível/inserir/atualizar/remover **pelo
dono**) + trigger `database_automations_set_updated_at` (reusa `set_updated_at`).

### `public.automation_jobs` (fila; **server-only**)

```sql
create table if not exists public.automation_jobs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  database_id uuid not null references public.databases (id) on delete cascade,
  row_id      uuid references public.database_rows (id) on delete cascade,
  event       jsonb not null,                  -- { kind, changed?, columnId?, date? }
  trigger_key text not null,                   -- idempotência
  depth       integer not null default 0,
  status      text not null default 'pending', -- pending|running|done|failed|skipped
  attempts    integer not null default 0,
  last_error  text,
  run_after   timestamptz not null default now(),
  locked_at   timestamptz,
  started_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (database_id, row_id, trigger_key)
);
create index if not exists automation_jobs_claim_idx
  on public.automation_jobs (status, run_after, created_at);
```

`enable row level security` **sem policies** → só o `service_role` toca (o
enfileiramento é feito por função `security definer`).

### Enfileiramento por escrita — `AFTER INSERT OR UPDATE ON public.database_rows`

Função `public.enqueue_automation_jobs()` (`security definer`, `set search_path = ''`,
nomes totalmente qualificados):

1. **Caminho barato**: se o database não tem nenhuma regra `enabled`, `return new`.
2. `v_depth := coalesce(nullif(current_setting('request.headers', true), '')::json->>'x-automation-depth', '0')::int`.
3. `INSERT` → 1 job `{ kind: 'row_created' }`, `trigger_key = 'row:created'`.
4. `UPDATE` → calcula o diff de `OLD.values` × `NEW.values` via `jsonb_each`
   (`{ <columnId>: { from, to } }`, só chaves que mudaram); se vazio, `return new`;
   senão 1 job `{ kind: 'row_updated', changed: <diff> }`,
   `trigger_key = 'row:' || new.updated_at::text`.
5. Sempre `on conflict do nothing` (a chave única é a idempotência).

> Um job por **escrita**, não por regra: o worker carrega as regras do database e
> casa todas em TS.

### Claim do worker — RPC `public.automation_claim_jobs(p_limit int)`

`security definer`; `UPDATE ... SET status='running', locked_at=now(), attempts=attempts+1,
started_at=now() WHERE id IN (SELECT id ... WHERE status='pending' AND run_after <= now()
ORDER BY created_at LIMIT p_limit FOR UPDATE SKIP LOCKED) RETURNING *`. (PostgREST não
faz `SKIP LOCKED`; por isso a RPC.)

## Etapa 2 — Motor compartilhado (TS puro)

`supabase/functions/_shared/automation.ts` — **auto-contido (zero imports)** para
servir Deno (importa com extensão `.ts`) e Next/Vitest (importa sem extensão):

- Tipos: `CellValue = string | string[]`, `ColumnLike = { id: string; type: string;
  options?: { id: string; label: string }[] }`, `AutomationRule`, `AutomationEvent`
  (`row_created` | `row_updated{changed}` | `date_arrived{columnId,date}`),
  `AutomationTrigger`, `AutomationAction`.
- Constantes reservadas replicadas (`__content`, `__time`) para aplicar modelos.
- `matchRule(rule, event, row): boolean` — `column_changed` exige a coluna no diff
  e a condição (`to` | `filled` | `empty` | `any`); `date_arrived` exige
  `event.columnId === trigger.columnId` e `event.date === row.values[columnId]`.
- `planActions(rule, row, ctx: { todayISO: string }): PlannedWrite[]` — resolve
  `valueFrom: "today"` e devolve operações concretas (`set_value` / `create_row`).
- `depthExceeded(depth, cap = 3): boolean`.

Alinhamento de aliases/config:

- `tsconfig.json`: `paths` ganha `"@shared/*": ["./supabase/functions/_shared/*"]`
  e `exclude` ganha `"supabase/functions"` (o entry Deno quebra o `tsc`; o
  `_shared` continua checado por ser importado pelo app).
- `vitest.config.ts`: mesmo alias `@shared` (espelhando o comentário do `@`).

## Etapa 3 — Worker (Edge Function)

`supabase/functions/automation-worker/index.ts` (Deno; **fora do `tsc`**):

1. `Deno.serve`: exige o header de segredo (`x-automation-secret`); 401 se faltar.
2. Cliente `service_role` (env `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
3. Loop (até `MAX_JOBS` por invocação, ex.: 25): `automation_claim_jobs`.
4. Por job: se `depthExceeded(depth)` → `skipped`. Carrega a linha e as regras
   `enabled` do database; para cada regra, `matchRule` → `planActions`; aplica as
   escritas com `global.headers['x-automation-depth'] = depth + 1` (cliente por job);
   atualiza `last_run_at` das regras que dispararam.
   - `set_value` → RPC `database_row_set_cell` (já existe).
   - `create_row` → RPC `database_next_row_position` (já existe) + insert em
     `database_rows`; com `templateId`, aplica nome/conteúdo como
     `runAutoTemplates` faz (`src/lib/database-recurrence.ts:126-136`).
5. Fecha o job: `done` | `skipped` | `failed` (após 3 tentativas) | volta a
   `pending` com `run_after = now() + backoff` e `last_error`.

`supabase/config.toml`: `[functions.automation-worker] verify_jwt = false` (a
autenticação é o header de segredo).

## Etapa 4 — Camada de dados (cliente)

`src/lib/automations.ts` (mesmo estilo de `src/lib/database.ts`: `createClient()`,
`.from("database_automations")`, RLS):

- `fetchAutomations(databaseId): Promise<AutomationRule[]>`
- `createAutomation(databaseId, input)` / `updateAutomation(id, patch)` /
  `deleteAutomation(id)` / `reorderAutomations(orderedIds)`.

## Etapa 5 — UI

- `src/components/database/AutomationsPanel.tsx` (novo): busca as regras do
  database, com estados de **carregando / vazio / erro**; lista com nome, ativar/
  desativar, "última execução", editar e excluir; editor com o seletor de gatilho
  (usa `columns` para oferecer colunas e valores) e de ações (`columns` +
  `databases` para "criar linha em…" e modelos).
- `TableSettingsPopover.tsx`: `view` ganha `"automations"`; entrada **"Automações"**
  no menu (ícone `Zap`/`Workflow`) renderizando `<AutomationsPanel databaseId=
  {currentDatabaseId} databases={databases} columns={columns} />`. Título da
  sub-view: "Automações".

## Etapa 6 — Agendamento (manual, fora da migration)

> **Não** colocar `cron.schedule` na migration: se `pg_cron` não estiver
> habilitado, o `supabase db push` quebra. Fica como passo documentado no SQL
> Editor, depois de habilitar as extensões.

1. Habilitar `pg_cron`, `pg_net` e Vault no projeto.
2. Criar os secrets no Vault: `automation_worker_url`, `automation_worker_secret`.
3. `cron.schedule('automations-dates', '*/15 * * * *', ...)`: varre regras
   `date_arrived` e enfileira 1 job por (linha, coluna, data) com
   `trigger_key = 'date:' || columnId || ':' || due_date`, janela
   `[hoje-1, hoje]` em `(now() at time zone 'America/Sao_Paulo')::date`
   (a janela cobre o desvio de fuso; a chave única evita duplicar).
4. `cron.schedule('automation-worker', '* * * * *', ...)`: `net.http_post` para
   `vault.decrypted_secrets` (`automation_worker_url`) com o header
   `x-automation-secret`.

## Etapa 7 — Testes e validação

- `src/lib/automation-engine.test.ts` (novo): `matchRule` (os 3 gatilhos e as
  condições `to`/`filled`/`empty`/`any`), `planActions` (`valueFrom: "today"`,
  `create_row` com/sem modelo) e `depthExceeded`.
- `src/lib/automations.test.ts` (novo): CRUD do cliente (mock do `createClient`,
  como em `src/lib/database-rows-search.test.ts`).
- `src/lib/automations-contract.test.ts` (novo, espelha
  `src/lib/workspace-open-databases-contract.test.ts`): as duas tabelas + policies
  presentes na migration **e** no `schema.sql`; o cliente usa
  `.from("database_automations")`; e os literais de `kind` do SQL
  (`row_created`, `row_updated`, `date_arrived`) batem com os do
  `_shared/automation.ts`.
- `src/components/database/automations-panel.test.tsx` (novo): vazio, listar,
  criar e alternar ativar/desativar (mock de `@/lib/automations`).
- Comandos: `npx tsc --noEmit`, `npm run lint` (só os 2 warnings pré-existentes),
  `npm test`, `npm run build`.
- Manual: `deno check supabase/functions/automation-worker/index.ts` (não há CI);
  aplicar a migration; `supabase functions deploy automation-worker`; rodar as 3
  regras e conferir **encadeamento** (a linha criada entra pelas regras dela),
  **teto** (profundidade 4 → `skipped`) e **idempotência** (rodar o cron 2x não
  duplica).

## Riscos / pontos de atenção

- **`request.headers` no trigger**: é o mecanismo do encadeamento. Se o GUC não
  estiver disponível no contexto do trigger, a profundidade fica 0 e o teto não
  funciona → **fallback**: marcar como `depth+1` os jobs criados na janela do job
  (por `database_id` + `created_at >= started_at`); se nem isso for confiável,
  desligar encadeamento na v1 (o trigger ignora escritas com `auth.uid()` nulo).
- **Trigger em toda escrita**: manter o caminho barato (`if not exists` de regra
  `enabled` + índice por `database_id`) para não penalizar quem não usa automações.
- **Pré-requisitos manuais**: `pg_cron`/`pg_net`/Vault habilitados, secrets
  criados, function publicada e crons agendados. Sem isso, nada roda — documentar
  no README da feature.
- **Fuso**: `America/Sao_Paulo` fixo no cron + `APP_TIMEZONE` no worker; a janela
  `[hoje-1, hoje]` + chave única evita perder/duplicar perto da meia-noite.
- **Deno × Next**: o entry Deno fica fora do `tsc`; o `_shared` **não pode
  importar nada** (Deno exige extensão, Next não) — se precisar de mais código
  compartilhado, dividir em arquivos auto-contidos.
- **Idempotência**: `unique (database_id, row_id, trigger_key)`. Alternar um valor
  de volta gera novo `updated_at` → novo job (comportamento desejado).
- **Custo**: 1 SELECT + 1 INSERT por escrita **quando há regras**; o worker faz
  N escritas por job (respeitar `MAX_JOBS`).
- **Views vinculadas**: regras só no database real (`linked_database_id` nulo);
  views não recebem automações (o worker opera na origem).

## Fora de escopo

- Ações **vincular a uma linha (relação)** e **excluir/arquivar**.
- **Notificar** (e-mail/push) e **webhook**.
- **Histórico de execuções** na UI (só `last_run_at`).
- Gatilho por **horário fixo** ("toda segunda às 9h") — hoje só "data chegou".
- Aplicar automações em **views vinculadas**.
- **Fuso por usuário** e colaboração multi-usuário.
