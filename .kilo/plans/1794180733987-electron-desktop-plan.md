# Plano — App Desktop (Electron) para o Calendário

## Objetivo

Empacotar o app atual (Next.js 14 App Router + Supabase) como aplicativo desktop
Windows/macOS/Linux usando **Electron**, com **servidor Next embutido** (spawn de
`next start` em `localhost`) e distribuição via **electron-builder**.

## Viabilidade (verificada no código)

**É possível** sem refatorar o app. Pontos confirmados:

- App é **SSR**: `src/app/app/page.tsx` (Server Component) e `src/app/login/page.tsx`
  usam `createClient()` de `src/lib/supabase/server.ts` (`cookies()` de `next/headers`).
  → precisa de um processo Node servindo HTTP, não dá para servir via `file://`.
- **Middleware de auth** (`src/middleware.ts` → `src/lib/supabase/middleware.ts`) renova
  sessão e protege rotas. Roda no servidor Next.
- **Callback OAuth** (`src/app/auth/callback/route.ts`) troca o `code` por sessão via
  cookie no servidor. Precisa de um host HTTP acessível.
- `src/lib/supabase/client.ts` e `src/lib/images.ts` rodam no navegador (uploads via
  Supabase Storage). Nenhuma API Node-only no código compartilhado.
- `next/font/google` (`src/app/layout.tsx`) baixa a fonte **em build time** e a
  embute como asset estático → sem dependência de rede em runtime.
- Sem `next/image` nem `next.config` custom relevante (`next.config.mjs` só define
  `reactStrictMode`). `public/` contém `icone.png`/`logo.png`.
- Env necessária: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `NEXT_PUBLIC_SITE_URL` (`.env.example`).

**Restrição-chave**: as variáveis `NEXT_PUBLIC_*` são **inlinadas em build time** pelo
Next. O build do pacote desktop precisa recebê-las no momento do `next build`.

## Decisões

- **Servir o app**: Electron (main) sobe `next start` em **porta fixa** de
  `127.0.0.1` e o `BrowserWindow` carrega `http://127.0.0.1:<PORT>`.
  - Porta **fixa** (ex.: `4173`) para manter estável a redirect URL do OAuth.
  - Alternativa dinâmica exigiria recalcular a allowlist do Supabase a cada execução
    — descartada.
- **Empacotamento**: `electron-builder` (instaladores NSIS no Windows; dmg/zip no
  macOS; AppImage/deb no Linux).
- **Servidor empacotado**: usar **Next standalone output**
  (`output: "standalone"` em `next.config.mjs`) e empacotar `.next/standalone`.
  O server standalone é um `server.js` que escuta numa porta (via `PORT`/`HOSTNAME`).
  Isso evita depender do `next` CLI no pacote final e reduz o tamanho.
- **OAuth**: fluxo carregado **na própria janela** do Electron (a URL do Google abre
  no `BrowserWindow`, redireciona de volta para `http://127.0.0.1:<PORT>/auth/callback`).
  Simples e compatível com o callback SSR atual. (Deep-link com `shell.openExternal`
  + protocolo custom fica fora de escopo.)

## Mudanças necessárias

### 1. Configuração do Next (build do desktop)
- Adicionar `output: "standalone"` ao `next.config.mjs`.
  - Impacto: `npm run build` web continua funcionando; passa a gerar
    `.next/standalone` (recomendado ler `next start`-compatible).
  - **Atenção**: validar que a landing/rotas estáticas e o middleware continuam OK
    no modo standalone (o standalone copia `public/` e `.next/static`
    manualmente — o plano de build deve copiá-los para dentro do pacote).
- Não mudar `reactStrictMode`.

### 2. Estrutura Electron (novos arquivos)
Criar diretório `desktop/` (fora de `src/`, sem interferir no app Next):
- `desktop/main.js` (ou `.ts` com build): processo principal.
  - Cria `BrowserWindow` com `contextIsolation: true`, `nodeIntegration: false`.
  - Sobe o servidor standalone: `spawn(process.execPath, [serverPath], { env: {
    PORT, HOSTNAME: "127.0.0.1", NODE_ENV: "production",
    NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SITE_URL }})`.
    - Usar `process.execPath` com `ELECTRON_RUN_AS_NODE=1` para reusar o Node do
      Electron (evita exigir Node instalado na máquina do usuário).
  - Espera o servidor responder (poll em `http://127.0.0.1:<PORT>`) e só então
    `loadURL`.
  - `will-quit`/`before-quit`: encerra o processo servidor (kill).
  - Restringe navegação externa: `setWindowOpenHandler` → `shell.openExternal`.
- `desktop/preload.js`: mínimo (sem APIs sensíveis necessárias hoje; expor no-op ou
  nada). Garantir contexto isolado.
- `desktop/electron-builder.yml`: config do instalador.
  - `files`: incluir `.next/standalone/**`, `.next/static/**`, `public/**`,
    `desktop/**`, `package.json`.
  - `extraResources` para o server standalone + `.env` de produção (ou env embutido).
  - `directories.output: dist/`.
  - `appId`, `productName: "Calendário"`, `win.target: nsis`.

### 3. Scripts (package.json)
Adicionar (não remover os existentes):
- `next:build:desktop`: `next build` com as env de produção do Supabase (o CI/dev
  exporta as variáveis antes).
- `desktop:dev`: roda Electron apontando para `next dev` (localhost:3000) para
  desenvolvimento rápido.
- `desktop:build`: `next build` (standalone) → copiar `public`/`.next/static` para
  `.next/standalone` → `electron-builder`.
- `desktop:start`: `electron desktop`.

### 4. Variáveis de ambiente
- Definir uma fonte única das `NEXT_PUBLIC_*` para o build do desktop (ex.: `.env`
  lido no script de build) e repassá-las ao processo servidor no runtime.
- `NEXT_PUBLIC_SITE_URL` deve ser `http://127.0.0.1:4173` (mesma porta fixa) para o
  redirect do OAuth bater.

### 5. Configuração no Supabase (ação manual, fora do código)
- Adicionar às **Redirect URLs** permitidas do projeto Supabase:
  `http://127.0.0.1:4173/auth/callback`.
- (Opcional) manter `http://localhost:3000/auth/callback` para o modo dev.

## Fluxo de dados / runtime (resumo)

1. Usuário abre o app → Electron main inicia o servidor standalone em
   `127.0.0.1:4173`.
2. `BrowserWindow` carrega `http://127.0.0.1:4173` → middleware redireciona para
   `/login` se não houver sessão.
3. "Entrar com Google" → `signInWithOAuth` (client) com redirect
   `http://127.0.0.1:4173/auth/callback` → Google → callback troca `code` por
   sessão (cookies) → `/app`.
4. Dados de eventos/databases imagens seguem direto do renderer para o Supabase
   (igual ao web). RLS inalterado.
5. Ao fechar a janela, o processo servidor é encerrado.

## Riscos e mitigação

- **Env `NEXT_PUBLIC_*` em build**: se ausentes no `next build`, o app fica sem
  chaves. → Script de build falha explicitamente se as variáveis não estiverem
  definidas.
- **Standalone não copia `public/`/`.next/static`**: assets 404. → Passo de cópia
  explícito no script build.
- **Porta ocupada**: se `4173` estiver em uso, o servidor falha. → Checar porta e
  exibir erro amigável / matar e reabrir.
- **Cookies/URL do OAuth**: precisa casar exatamente com a allowlist do Supabase.
  → Documentar e travar porta fixa em `NEXT_PUBLIC_SITE_URL`.
- **Segurança Electron**: manter `contextIsolation: true`, `nodeIntegration: false`,
  bloquear navegação externa no próprio window.
- **Fonte Google offline**: já embutida no build; se o build for offline, `next/font`
  pode falhar. → Build precisa de rede (documentar).
- **Tamanho do pacote**: ~ Electron + Node + `.next`. Aceitável; standalone reduz vs.
  empacotar `node_modules` completo.
- **macOS/Linux**: assinatura de código não incluída; instaladores não assinados
  funcionam localmente, mas geram avisos. Fora de escopo assinar.

## Plano de validação

1. `npm run lint && npx tsc --noEmit -p tsconfig.json && npm test` (app web intacto).
2. `npm run build` (web) continua passando.
3. `npm run desktop:dev`: janela abre no `next dev`; login OAuth Google completa;
   navegação para `/app` funciona.
4. `npm run desktop:build`: gera instalador; instalar em máquina limpa (Windows);
   abrir, logar, criar evento, subir imagem, fechar e reabrir (sessão persiste via
   cookies do Electron).
5. Verificar no `dist/` que `public/`, `.next/static`, `.next/standalone` e
   `desktop/` foram incluídos.
6. Confirmar que fechar a janela encerra o processo servidor (sem `node` órfão).

## Ordem de execução (para o agente de implementação)

1. Adicionar `output: "standalone"` ao `next.config.mjs`.
2. Criar `desktop/main.js`, `desktop/preload.js`, `desktop/electron-builder.yml`.
3. Adicionar scripts `desktop:*` e dependências dev (`electron`, `electron-builder`).
4. Definir a fonte de env para o build do desktop (porta fixa `4173`,
   `NEXT_PUBLIC_SITE_URL=http://127.0.0.1:4173`).
5. Implementar o passo de build que copia `public`/`.next/static` para
   `.next/standalone`.
6. Rodar validação (seção acima).
7. Documentar no README a ação manual no Supabase (Redirect URLs) e os comandos.

## Fora de escopo

- Assinatura de código / notarização.
- Auto-update (ex.: `electron-updater`).
- Deep-link com protocolo customizado (OAuth na janela é suficiente).
- Ícone/tema específicos do desktop além de reaproveitar `public/icone.png`.

## Ação do usuário (manual)

- Adicionar `http://127.0.0.1:4173/auth/callback` às Redirect URLs do Supabase.
- Fornecer `.env` com as chaves do Supabase antes do build do desktop.
