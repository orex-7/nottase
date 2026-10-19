# AGENTS.md

Notion-style calendar + workspace app. Next.js 14 (App Router) + React 18 + TypeScript + Tailwind + shadcn/ui, backed by Supabase (Postgres + RLS + Storage) with Google OAuth.

Team engineering rules live in [`.kilo/rules/engineering.md`](.kilo/rules/engineering.md) (Portuguese, referenced by `kilo.jsonc`). They mandate end-to-end implementation and validation; follow them in addition to this file.

## Commands

Package manager is **npm** (README and `node_modules/.package-lock.json`). `pnpm-lock.yaml` and `pnpm-workspace.yaml` are also committed but unused — ignore them.

| Task | Command |
| --- | --- |
| Dev server | `npm run dev` |
| Build | `npm run build` |
| Lint | `npm run lint` |
| Tests | `npm test` (`vitest run`) |
| Tests watch | `npm run test:watch` |
| Typecheck | `npx tsc --noEmit` (no npm script) |
| Single test file | `npx vitest run src/lib/number-format.test.ts` |
| Single test by name | `npx vitest run -t "formata moeda"` |

- No CI is configured (`.github/` is absent). Run lint + `tsc --noEmit` + `npm test` + `npm run build` manually before finishing.
- `npm run lint` currently emits 2 pre-existing `react-hooks/exhaustive-deps` **warnings** (`DatabaseView.tsx`, `PageEditor.tsx`). Don't chase them unless in scope.
- Tests: Vitest + jsdom + Testing Library, config in `vitest.config.ts` / `vitest.setup.ts`. Specs are colocated and must match `src/**/*.{test,spec}.{ts,tsx}`. Alias `@/*` → `./src/*` (mirrored in `vitest.config.ts`). Only one spec exists today (`src/lib/number-format.test.ts`).

## Setup

Copy `.env.example` to `.env` and fill: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`. The app needs these at runtime (Supabase clients read them directly); the test suite does not.

## Architecture

- Routes (`src/app/`): `/` public landing (`components/marketing/*`), `/login`, `/auth/callback`, `/auth/signout`, and `/app` (protected; server component → `CalendarProvider`).
- Route protection and session refresh: `src/middleware.ts` → `src/lib/supabase/middleware.ts`. Public paths are exactly `/`, `/login*`, `/auth*`; everything else requires a session and redirects to `/login?redirectTo=...`. Don't remove the `getUser()` call — it refreshes the token.
- Data access goes **directly from the browser to Supabase** using the anon key (`src/lib/events.ts`, `src/lib/database.ts`, `src/lib/images.ts`). There are **no API routes** for events/databases; per-user isolation is enforced by RLS, not by server code. Don't add API routes for this unless asked.
- Supabase clients: `src/lib/supabase/client.ts` (browser), `server.ts` (server components), `middleware.ts`. Only the anon key is ever used — never a `service_role` key on the client.
- Domain hierarchy is **Project > Databases > rows**. `databases.columns` and `database_rows.values` are free-form JSONB. Reserved keys in `values`: `__content` (page HTML) and `__time`. Column types: `text | number | select | status | multi_select | date | checkbox | person` (`src/types/database.ts`).
- Database view tabs, active view, kanban grouping, and filters are persisted in **`localStorage`**, not in Postgres.
- `fetchDatabases()` (`src/lib/database.ts`) loads all of the user's databases + rows + templates without pagination; it is called even by the calendar sidebar. Treat it as the main perf hotspot.

## Supabase / schema changes

- `supabase/migrations/*.sql` are the versioned source of truth (`supabase db push` applies them). `supabase/schema.sql` is the consolidated "paste into SQL Editor" version and can **lag** the migrations — e.g. `events.end_date` exists only in a migration. When changing schema, add a migration and update `schema.sql` to match.
- `supabase/config.toml` is local-dev config; production auth/redirect/SMTP settings live in the Supabase dashboard and are not versioned. `config.toml` points at `./seed.sql`, which does not exist.

## Conventions & gotchas

- UI copy and comments are **Brazilian Portuguese** (commit messages usually too); keep new user-facing strings pt-BR with correct accents. Code identifiers stay English.
- Reuse shadcn/ui components in `src/components/ui` and the `cn()` helper in `src/lib/utils.ts`. `components.json` fixes shadcn style `default`, base `slate`, CSS variables.
- Event validation uses Zod (`src/lib/validations.ts`) and runs **client-side only**. Server-side guarantees come from RLS + Postgres constraints.
- `src/components/database/DatabaseView.tsx` (~4000 lines) holds the table, kanban, chart, property editor, and page logic; `PageEditor.tsx` is ~2000 lines (TipTap). Make targeted edits — don't rewrite these files.
- `tools/` (`dv.orig.tsx`, `gitcheck.tsx`, `diag.txt`, `*.ps1`, `tsc.log`) and `_patch/` are stale scratch artifacts. They are **not** part of the app, but `tools/*.tsx` are still type-checked via `tsconfig.json`'s `**/*.tsx` include. Don't edit or "fix" them unless asked.
- There is no `public/` directory (no favicon/OG assets) and no `error.tsx` / `loading.tsx` / `not-found.tsx` / Error Boundary.
- `README.md` documents Supabase setup well, but its scripts and structure lists lag the code (e.g. it omits the `test` scripts and newer `database/*` modules). Trust `package.json` and the source over the README's lists.
