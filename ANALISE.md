# Análise do Projeto — Calendário Anual (SaaS estilo Notion)

> Auditoria somente leitura. Nenhum arquivo do projeto foi alterado (exceto este `ANALISE.md`).
> Método: leitura de `package.json`, configs, `supabase/schema.sql`, `supabase/migrations/*`,
> todo o `src/`, além de `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm outdated` e
> `git ls-files`. Onde algo não foi encontrado, está marcado como **"não encontrei"**.
> Limitação: não há acesso ao banco Supabase de produção nem ao dashboard; conclusões sobre
> RLS/policies refletem o que está versionado no repositório.

---

## Etapa 1 — Mapeamento

### Stack
| Camada | Tecnologia | Referência |
|---|---|---|
| Framework | Next.js **14.2.35** (App Router), `reactStrictMode: true` | `package.json:30`, `next.config.mjs:3` |
| Linguagem | TypeScript 5.7, `strict: true`, `noEmit: true`, alias `@/*` → `./src/*` | `tsconfig.json:7-8,17-19` |
| UI | React 18, Tailwind CSS 3.4 + `tailwindcss-animate`, PostCSS | `package.json:31-32,35,47` |
| Componentes | shadcn/ui (Radix + CVA); `style: default`, `rsc`, `cssVariables`, base `slate` | `components.json`, `src/components/ui/*` |
| Auth + Banco | Supabase (`@supabase/ssr` 0.5.2, `@supabase/supabase-js` 2.117) | `package.json:15-16` |
| Editor | TipTap 3.31 | `package.json:17-25` |
| Gráfico | Recharts 3.10 | `package.json:33` |
| Estado / Validação / Datas | Zustand 5, Zod 3, date-fns 4, lucide-react | `package.json:36-37,28-29` |
| Lint | ESLint 8.57.1 + `eslint-config-next` 14.2.35 | `package.json:44-45`, `.eslintrc.json` |

Não há dependências de pagamento/Stripe.

### Organização
- `src/app/` (App Router): `page.tsx` (landing pública), `login/page.tsx`, `app/page.tsx` (app protegido), `auth/callback/route.ts`, `auth/signout/route.ts`, `layout.tsx`, `globals.css`.
- `src/middleware.ts` + `src/lib/supabase/middleware.ts` — refresh de sessão e proteção de rota.
- `src/components/`: `auth/`, `calendar/` (8), `database/` (5), `marketing/` (8), `ui/` (5), `EventDialog.tsx`.
- `src/lib/`: `events.ts`, `database.ts`, `markdown.ts`, `images.ts`, `validations.ts`, `date-utils.ts`, `database-recurrence.ts`, `database-calendar.ts`, `database-icons.ts`, `currencies.ts`, `number-format.ts`, `editor-table.ts`, `utils.ts`, `supabase/{client,server,middleware}.ts`.
- `src/store/useCalendarStore.ts`; `src/types/{event,database}.ts`.
- Tamanho (linhas): `DatabaseView.tsx` **7289**, `PageEditor.tsx` **1993**, `lib/database.ts` 743, `CalendarProvider.tsx` 383, `WeekCalendar.tsx` 348.

### Como os dados são guardados (campos dinâmicos)
Postgres no Supabase, RLS por `user_id`. Hierarquia **Projeto > Databases**:
`public.events` (`schema.sql:10-22`), `public.projects` (`:79-91`), `public.databases` (`:101-113`), `public.database_rows` (`:123-132`), `public.database_templates` (`:140-151`), `public.project_categories` (`:161-173`).

Campos dinâmicos em **JSONB**:
- Definição das colunas/propriedades em `databases.columns` (jsonb, `schema.sql:109-110`), no formato `[{ id, name, type }]`; tipos em `src/types/database.ts:2-10` (`text|number|select|status|multi_select|date|checkbox|person`).
- Valores por linha em `database_rows.values` (jsonb, `schema.sql:127-128`), indexados por `columnId`: `{ columnId: string | string[], "__content": string }`. Chaves reservadas: `__content` (HTML da página, `src/types/database.ts:316`) e `__time` (`:323`).
- Índices: `events(user_id,date)` (`:24`); `projects(user_id)` e `(user_id,position)` (`:93-96`); `databases(user_id)` e `(user_id,project_id)` (`:115-118`); `database_rows(user_id,database_id,position)` (`:134-135`); `database_templates(user_id,database_id,position)` (`:153-154`); `project_categories(user_id,position)` (`:175-176`).
- Storage: bucket público `page-images` (leitura pública; escrita restrita à pasta do usuário) — `schema.sql:359-403`.
- **Visualizações/abas do database são persistidas em `localStorage`**, não no banco (`README.md:230`; `savePersistedViews`/`loadPersistedViews` em `DatabaseView.tsx`).

### Incompleto / abandonado / inconsistências
- **`schema.sql` está desatualizado em relação às migrations**: `events.end_date` existe apenas em `supabase/migrations/20260410130000_add_end_date.sql:4-10`, não no `schema.sql`.
- **Artefatos soltos**: `tools/` (`dv.orig.tsx` — cópia antiga do `DatabaseView`, `diag.txt`, `tsc.log`, `run.ps1`, `fix-accents2.ps1`, `gitcheck.tsx`) e `_patch/t.txt`.
- **Lockfiles duplicados**: `pnpm-lock.yaml` + `pnpm-workspace.yaml` coexistem com `package-lock.json`; o projeto usa **npm** (`README.md:81`; `node_modules/.package-lock.json`). O `pnpm-workspace.yaml` tem conteúdo placeholder.
- `.kilo/` e `kilo.jsonc` são configuração de ferramenta/agente, não do produto.

---

## Etapa 2 — Inventário de funcionalidades

Legenda: **✅ Completa** · **🟡 Parcial** · **🎨 Só interface** · **❌ não existe**.

### Auth
| Funcionalidade | Classificação | Evidência |
|---|---|---|
| Login com Google (OAuth Supabase) | ✅ | `src/components/auth/LoginButton.tsx:22-29`; `src/app/auth/callback/route.ts:15-20` |
| Logout | ✅ | `src/app/auth/signout/route.ts:6-10` |
| Proteção de rota + refresh de sessão | ✅ | `src/lib/supabase/middleware.ts:38-65`; `src/middleware.ts` |
| Login por e-mail/senha, cadastro, recuperação de senha | ❌ | Só OAuth Google |
| Exclusão de conta / exportação de dados | ❌ | não encontrei |

### Calendário (eventos)
| Funcionalidade | Classificação | Evidência |
|---|---|---|
| Visões de semana e mês | ✅ | `YearCalendar.tsx:6-7`, `WeekCalendar.tsx`, `MonthGrid.tsx` |
| Navegação (prev/próximo/Hoje) e seleção de dia | ✅ | `useCalendarStore.ts:252-291`; `Header.tsx` |
| CRUD de evento + dia inteiro/horário + intervalo de datas + cores | ✅ | `EventDialog.tsx`, `EventDetails.tsx`, `lib/events.ts:36-130`, `lib/validations.ts:5-64` |
| Sidebar com mini-calendário e databases fixados | ✅ | `CalendarSidebar.tsx`; `useCalendarStore.ts:31-53` |
| Eventos derivados de databases (coluna `date`) | ✅ | `lib/database-calendar.ts:86-108`; `CalendarProvider.tsx:107-136` |
| Popover do item de database no calendário | ✅ | `DatabaseItemPopover.tsx` |
| Recorrência de evento do calendário | ❌ | Recorrência só existe para modelos de página (`lib/database-recurrence.ts`) |
| Lembretes/notificações, convidados/compartilhar | ❌ | não encontrei |

### Workspace (Projetos)
| Funcionalidade | Classificação | Evidência |
|---|---|---|
| Listar/criar/abrir/excluir projetos (nome + categoria + cor) | ✅ | `ProjectsScreen.tsx`, `ProjectsSidebar.tsx` |
| Categorias de projeto (criar, reordenar por drag, cor, excluir) | ✅ | `lib/database.ts:488-620`; uso em `DatabaseView.tsx:6845` |
| Reordenar projetos (drag) | ✅ | `lib/database.ts:438`; uso em `DatabaseView.tsx:6877` |
| Mover database existente entre projetos | 🟡 | Há `project_id`, mas não encontrei UI de mover |

### Databases (tabela)
| Funcionalidade | Classificação | Evidência |
|---|---|---|
| Listar/criar (nome + ícone)/abrir/excluir databases | ✅ | `DatabasesScreen.tsx` |
| Colunas: criar, renomear, trocar tipo, largura, ícone, ocultar, excluir | ✅ | `DatabaseView.tsx`; tipos em `types/database.ts:2-10` |
| Número: formato, casas decimais, moeda | ✅ | `lib/number-format.ts`, `lib/currencies.ts` |
| Linhas: criar, excluir, reordenar, seleção em massa, edição inline | ✅ | `DatabaseView.tsx`; `lib/database.ts:623-685` |
| Busca textual | ✅ | `DatabaseView.tsx` (`query`/`filtered`) |
| Tipo Pessoa | 🟡 | Renderiza como texto; **sem seletor de usuários** (`DatabaseView.tsx:191-193,3356-3357`) |
| Import/export CSV, fórmulas, relações, rollup | ❌ | não encontrei |

### Visualizações (views)
| Funcionalidade | Classificação | Evidência |
|---|---|---|
| Abas de visualização: criar (Tabela/Kanban/Gráfico), renomear, excluir, reordenar | ✅ | `DatabaseView.tsx`; tipos em `:910` |
| Kanban (agrupar por Seleção/Status, drag entre colunas e reordenar) | ✅ (desktop) | README:231-237; DnD nativo HTML5 — não funciona em toque |
| Gráfico (Recharts) com config | ✅ | `DatabaseView.tsx:4953`; `chartConfig` em `:2300` |
| Persistência das views (abas, ativa, kanban, gráfico) | 🟡 | Só `localStorage` (`DatabaseView.tsx:899-961,2414-2416`) |
| Filtros por propriedade | 🟡 | Só **caixa de seleção** (Marcadas/Desmarcadas/Limpar); demais tipos sem opções |
| Filtros por view (isolados) | ✅ | `filters` por `DbView` |

### Página do item e modelos
| Funcionalidade | Classificação | Evidência |
|---|---|---|
| Editor rico TipTap + autosave debounced | ✅ | `PageEditor.tsx`, `lib/markdown.ts`, `editor-table.ts` |
| Upload de imagem para Storage | ✅ | `lib/images.ts:75-102`; bucket em `schema.sql:359-403` |
| Modelos de página + recorrência automática | ✅ | `lib/database-recurrence.ts:85-151`; `schema.sql:140-151` |
| Comentários, menções, histórico de versões | ❌ | não encontrei |

### Marketing / Landing
| Funcionalidade | Classificação | Evidência |
|---|---|---|
| Landing pública (hero, recursos, demonstrações, privacidade, CTA, rodapé) | 🎨 estática | `src/app/page.tsx:38-46`; `components/marketing/*` |
| CTA de conversão | 🎨 | Só leva ao login; sem preços/planos/captura de e-mail |
| Páginas de Termos / Privacidade | ❌ | `PrivacySection` é texto de marketing |

### Pagamento
| Funcionalidade | Classificação | Evidência |
|---|---|---|
| Assinatura, planos, checkout, webhooks | ❌ | Sem dependência/código de pagamento (grep `stripe` = 0) |

### Infra / observabilidade
| Funcionalidade | Classificação | Evidência |
|---|---|---|
| Monitoramento de erros, analytics, feature flags | ❌ | grep `sentry|posthog|analytics|gtag|plausible` = 0 |
| Backups | ❌ no repo | Nada além do padrão do Supabase |
| Testes automatizados | ❌ | sem script `test`/runner/arquivos |

### Código morto / não utilizado 🗑️
- `tools/dv.orig.tsx` (cópia antiga do `DatabaseView`; ainda entra no type-check por `tsconfig.json:21`), `tools/gitcheck.tsx`, `tools/diag.txt`, `tools/tsc.log`, `tools/run.ps1`, `tools/fix-accents2.ps1`, `_patch/t.txt`.
- `pnpm-lock.yaml` + `pnpm-workspace.yaml` (não usados; projeto é npm).
- Nenhum componente em `src/components` ficou órfão.

---

## Etapa 3 — Auditoria de segurança

### RLS
Todas as tabelas do app têm RLS habilitado:
`events` (`schema.sql:29`, `migrations/20260410120000_init_events.sql:26`), `projects` (`:181`, `.../init_projects.sql:31`), `project_categories` (`:207`, `.../init_project_categories.sql:31`), `databases` (`:242`, `.../init_databases.sql:56`), `database_rows` (`:265`, `.../init_databases.sql:79`), `database_templates` (`:294`, `.../init_databases.sql:108`).

Não encontrei tabela de aplicação sem RLS. Storage (`storage.objects`) tem policies de insert/update/delete por pasta e **sem policy de SELECT** (bucket público) — `.../init_storage_images.sql:22-27`.

⚠️ **Ressalva**: não é possível confirmar pelo repositório se as migrations foram aplicadas no projeto de produção. Não encontrei evidência de verificação do banco real.

### As policies isolam dados entre usuários?
**Sim**, por `auth.uid() = user_id` em todas as operações (`schema.sql:31-50,183-228,244-321`). INSERT de `database_rows`/`database_templates` valida que o database pertence ao usuário (`schema.sql:275-281,304-310`).

Lacunas de integridade (não são vazamento):
- `database_rows` UPDATE/DELETE não revalidam `database_id` (`schema.sql:283-292`).
- `databases` UPDATE não revalida `project_id` (`schema.sql:254-258`).
- `database_templates` UPDATE idem (`schema.sql:312-316`).

### Chaves secretas expostas?
- ✅ `.env` não versionado (`.gitignore:23`; `git ls-files .env` retorna só `.env.example`).
- ✅ `.env.example` só com `NEXT_PUBLIC_*` (anon key) — `.env.example:1-7`.
- ✅ Nenhum uso de `service_role` no código (grep = 0 em `src`).
- ✅ Client/server usam apenas a anon key (`lib/supabase/client.ts:8-11`, `server.ts:11-13`, `middleware.ts:12-13`).
- ✅ Sem Stripe/segredos de pagamento.
- ⚠️ Não auditei o conteúdo do `.env` real nem o dashboard.

### Validação no servidor ou só no frontend?
**Só no frontend.** Não há rotas de API para dados; escritas vão do browser direto ao Supabase com a anon key (`lib/events.ts`, `lib/database.ts`). Validação de eventos é client-side (Zod, `lib/validations.ts`, usada em `EventDialog.tsx:20`); gravações de databases/linhas/modelos não têm validação além do RLS.
O servidor garante: RLS + constraints (`events.end_date >= date` em `.../add_end_date.sql:8-10`; NOT NULLs; `project_categories unique(user_id,name)` em `schema.sql:172`; FKs com cascade; `set_updated_at`).
`database_rows.values` e `databases.columns` são **jsonb livre**, sem validação de forma/tamanho. `max_rows = 1000` limita leitura (`config.toml:18`).

### Rotas de API sem autenticação/permissão
Apenas 2 rotas, públicas de propósito: `auth/callback/route.ts` (GET) e `auth/signout/route.ts` (POST). O middleware protege tudo exceto `/`, `/login*`, `/auth*` (`lib/supabase/middleware.ts:47-65`). `app/page.tsx:12` chama `getUser()` (valida token), mas não redireciona.

**Achado (baixo) — possível open redirect**: `/auth/callback` monta `${origin}${redirectTo}` **sem validar** que `redirectTo` é relativo (`route.ts:13,19`), diferente de `login/page.tsx:19-22`. Um valor como `@evil.com` produz `http://host@evil.com` (host = evil.com); exige `code` válido para ser alcançado.

### Webhooks do Stripe
**Não existem** (sem Stripe).

### Outros
- Bucket `page-images` público (`schema.sql:359-370`, `config.toml:121-124`): leitura por URL (caminho `<user_id>/<uuid>.<ext>`, não enumerável).
- SVG permitido no bucket público (`allowed_mime_types` inclui `image/svg+xml`) — risco de XSS armazenado no acesso direto à URL (no app as imagens usam `<img>`, que não executa).
- `supabase/config.toml` é config de **dev** (`site_url`/redirects em `127.0.0.1`; `enable_signup = true`; `enable_confirmations = false`). Produção fica no dashboard e **não está versionada**.
- `config.toml:70` aponta `./seed.sql`, que **não existe**.

---

## Etapa 4 — Qualidade e riscos

### Tratamento de erros
Boa cobertura no cliente: `CalendarProvider.tsx:91-93`, `EventDialog.tsx:137-160`, `EventDetails.tsx:109-111`, `DatabaseItemPopover.tsx:95-97,154-156`, `DatabaseView.tsx:6639-6942`, `PageEditor.tsx:851-853`.

Riscos:
- **Sem Error Boundary**: não há `error.tsx`/`global-error.tsx`/`not-found.tsx`/`loading.tsx` em `src/app`.
- **Sem monitoramento**: erros em produção invisíveis.
- **Falha silenciosa**: `DatabaseView.tsx:6801` (`.catch(() => {})` ao criar categoria). Outros catch vazios são propositais (`images.ts:112-114`, `editor-table.ts`, `PageEditor.tsx:1012-1120`, `supabase/server.ts:30-33`).
- Mensagens usam `(err as Error).message` — podem vazar mensagens técnicas do Supabase.

### Consultas lentas / sem índice / carregam demais
- **`fetchDatabases()` carrega tudo do usuário** (todos os databases + todas as linhas + modelos, sem paginação/filtro) — `lib/database.ts:91-135`. Usado no `DatabaseView`, `CalendarProvider.tsx:116` e `CalendarSidebar`. O calendário carrega tudo só para montar a sidebar. Principal risco de performance.
- **`runAutoTemplates` faz inserts sequenciais em loop** (`lib/database-recurrence.ts:124-134`).
- `fetchEventsInRange` usa `.or(...)` sobre `date`/`end_date` (`lib/events.ts:45-51`); **sem índice em `end_date`**.
- `reorderProjects` (`lib/database.ts:438-448`) e `updateRowPositions` (`:668-680`) fazem N updates em paralelo (aceitável).

### Duplicação / código grande
- `DatabaseView.tsx` **7289 linhas** (tabela + kanban + gráfico + editor de coluna + página + filtros + abas); `PageEditor.tsx` 1993; `ProjectsScreen.tsx` 792.
- Duplicação: `firstColumnOfType` (`lib/database-calendar.ts:59`, `lib/database-recurrence.ts:45`); `ensureHtml` (`lib/database-recurrence.ts:37`, `lib/markdown.ts:216`); conversão de data ISO (`types/database.ts:257-269`, `lib/database-recurrence.ts:16`, `lib/date-utils.ts:30-37`).
- `tools/dv.orig.tsx` — cópia antiga (~7k linhas).

### Dependências desatualizadas / sem uso
- **Nenhuma dependência declarada sem uso** (verifiquei imports).
- `npm outdated`: nenhuma com drift na faixa (Current = Wanted). Majors novos disponíveis: Next 14→16, React 18→19, ESLint 8→10, TypeScript 5→7, `@supabase/ssr` 0.5→0.12, Tailwind 3→4, Zod 3→4, lucide 0.x→1.x, `tailwind-merge` 2→3.
- Lockfiles duplicados (npm + pnpm).

### Falta de testes
**Zero testes automatizados.** Sem cobertura em: auth/OAuth, RLS, CRUD de eventos, CRUD de databases/linhas, editor/autosave/upload e na lógica não-trivial `runAutoTemplates`, `databaseRowsToEvents`, `recurrenceOccurrences*`.
Hoje: `tsc` ✅, `build` ✅, `lint` ✅ (2 warnings preexistentes de `react-hooks/exhaustive-deps` em `DatabaseView.tsx:2708` e `PageEditor.tsx:726`).

---

## Etapa 5 — Prontidão para lançamento (beta fechado)

| Item | Status | Evidência |
|---|---|---|
| Termos de Uso e Política de Privacidade | ❌ | Só 5 rotas; link "Privacidade" é âncora de marketing (`LandingFooter.tsx:20-22`) |
| Monitoramento de erros | ❌ | grep = 0; sem Error Boundary |
| Analytics | ❌ | grep = 0 |
| Backup / recuperação de dados | ❌ no repo | Sem config versionada; sem exclusão de conta/exportação |
| Recuperação de senha | ⚠️ N/A | Só OAuth Google; sem caminho alternativo de acesso |
| Onboarding | ❌ | grep = 0; abre direto no Workspace (`useCalendarStore.ts:69-71`) |
| Assinatura expirada | ⚠️ N/A | Não há assinatura/pagamento |

Outros faltantes:
- SEO/social: `layout.tsx:8-12` só tem title/description; sem Open Graph/Twitter/`metadataBase`; sem `robots.txt`/`sitemap`.
- Pasta `public/` **não existe** (sem favicon customizado/OG image).
- Tema: `layout.tsx:18` força `className="dark"`.
- Sem CI/CD (`/.github`), sem `vercel.json`, sem Dockerfile.
- Sem `loading.tsx`/`error.tsx`/`not-found.tsx`.
- Sem e-mails (boas-vindas/lembretes); SMTP só local (`config.toml:104-112`).
- Config de produção (redirects OAuth/SMTP) não versionada.
- Sem banner/política de cookies nem aceite no login.

---

## Etapa 6 — Plano de ação

### (1) Corrigir antes de lançar

| # | Tarefa | Gravidade | Esforço | Arquivos | Critério de pronto |
|---|---|---|---|---|---|
| 1 | Publicar Termos de Uso e Política de Privacidade e linká-los | Crítica | até 1 dia | `src/app/termos/page.tsx`, `src/app/privacidade/page.tsx`, `LandingFooter.tsx`, `login/page.tsx` | Páginas existem, acessíveis e linkadas no rodapé/login, cobrindo dados coletados (nome/e-mail, conteúdo, imagens), retenção e direitos |
| 2 | Adicionar Error Boundary e páginas de erro/loading | Alta | até 1 dia | `src/app/error.tsx`, `global-error.tsx`, `app/error.tsx`, `loading.tsx`, `not-found.tsx` | Erro de render mostra fallback amigável; rotas têm loading |
| 3 | Instrumentar monitoramento de erros (ex.: Sentry) | Alta | até 1 dia | `src/app/layout.tsx`, novo `src/lib/monitoring.ts`, `.env.example`, `package.json` | Erros de produção chegam ao painel; sem segredos no cliente |
| 4 | Corrigir possível open redirect no callback | Alta | até 1 dia | `src/app/auth/callback/route.ts` | `redirectTo` só aceita caminho relativo interno (como em `login/page.tsx:19-22`); `redirectTo=@evil.com` não sai do domínio |
| 5 | Confirmar/ativar RLS e policies no projeto de produção | Crítica | até 1 dia | dashboard + `supabase/schema.sql` | `relrowsecurity = true` em todas as tabelas e policies presentes; documentado |
| 6 | Endurecer RLS de UPDATE (revalidar `database_id`/`project_id`) | Média | 2-3 dias | `supabase/schema.sql`, nova migration `*_harden_rls.sql` | UPDATE de `database_rows` revalida `database_id` do dono; `databases.project_id` revalidado; testado com 2 usuários |
| 7 | Validar/limitar JSONB no servidor (`values`/`columns`) | Média | 2-3 dias | nova migration (constraints/função), `src/lib/database.ts` | Limite de tamanho e forma mínima; inserts fora do padrão rejeitados |
| 8 | Definir backup + exclusão de conta/exportação de dados | Alta | 2-3 dias | dashboard/`supabase/config.toml`, nova área de configurações, `src/lib/account.ts` | Backup ativo e retenção documentada; usuário exclui conta (cascade) e exporta dados |
| 9 | Reduzir carga de dados e criar índice de `end_date` | Alta | 2-3 dias | `src/lib/database.ts:91-135`, `CalendarProvider.tsx:107-136`, `CalendarSidebar.tsx`, nova migration de índice | Sidebar/calendário buscam só o necessário; `fetchEventsInRange` usa índice |
| 10 | Configurar analytics mínimo de ativação | Média | até 1 dia | `src/app/layout.tsx`, novo `src/lib/analytics.ts` | Eventos-chave (login, 1º database, 1º evento) registrados |
| 11 | Versionar/configurar produção (redirects OAuth, SMTP) e CI | Alta | 2-3 dias | `.github/workflows/ci.yml`, `vercel.json`, docs, `supabase/config.toml` | CI roda lint+tsc+build em PR; URLs de produção documentadas e conferidas |
| 12 | Adicionar onboarding mínimo | Média | 2-3 dias | `src/components/database/*`, `src/components/calendar/*` | Novo usuário recebe guia curto/estado vazio orientado |
| 13 | Reportar a falha silenciosa ao criar categoria | Baixa | até 1 dia | `DatabaseView.tsx:6801` | Erro é exibido ao usuário |
| 14 | Remover código morto e lockfiles duplicados | Baixa | até 1 dia | `tools/`, `_patch/`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` | Artefatos removidos; tsc/lint/build seguem verdes |

### (2) Melhorar depois do beta

| # | Tarefa | Gravidade | Esforço | Arquivos | Critério de pronto |
|---|---|---|---|---|---|
| 15 | Dividir `DatabaseView.tsx` em módulos | Média | mais de 3 dias | `src/components/database/*` | Tabela/kanban/gráfico/editor/página isolados e testáveis |
| 16 | Introduzir testes (unit + integração) nos fluxos críticos | Alta | mais de 3 dias | runner (vitest/playwright), `src/lib/*` | Cobertura de `runAutoTemplates`, `databaseRowsToEvents`, validações e CRUD |
| 17 | Deduplicar helpers (`firstColumnOfType`, `ensureHtml`, datas) | Baixa | 2-3 dias | `src/lib/*` | Helpers únicos reutilizados |
| 18 | Persistir views/filtros/kanban no servidor | Média | 2-3 dias | `DatabaseView.tsx`, nova migration | Config de view por usuário no banco (sincroniza entre dispositivos) |
| 19 | Completar filtros por tipo (select, status, data, número) | Média | 2-3 dias | `DatabaseView.tsx` | Todos os tipos filtráveis |
| 20 | Melhorar o tipo "Pessoa" (seletor de usuários) | Baixa | 2-3 dias | `DatabaseView.tsx`, `types/database.ts` | Coluna Pessoa escolhe usuários, não texto livre |
| 21 | Suportar toque no drag-and-drop (kanban/linhas/colunas) | Média | 2-3 dias | `DatabaseView.tsx`, `PageEditor.tsx` | Arrastar funciona em telas de toque |
| 22 | Atualizar dependências (majors) com plano | Média | mais de 3 dias | `package.json` | Next/React/Tailwind/ESLint atualizados com build e testes verdes |
| 23 | Adicionar SEO/OG/favicon/robots/sitemap e tema claro | Baixa | 2-3 dias | `src/app/layout.tsx`, `public/`, `src/app/sitemap.ts`, `globals.css` | Metadados sociais, assets e opção de tema claro |
| 24 | Refatorar `runAutoTemplates` para inserts em batch | Baixa | até 1 dia | `src/lib/database-recurrence.ts` | Geração usa uma operação em lote |

---

## Observações finais / limitações
- Análise baseada apenas no repositório; **não** houve acesso ao banco/dashboard Supabase, ao conteúdo real do `.env` nem a logs de produção.
- Não há testes automatizados; as conclusões de correção vêm de leitura de código, `tsc`, `lint` e `build`.
- As referências de linha correspondem ao estado do código no momento da análise.
