# Plano — Gerar o instalador do app desktop (Windows)

## Resposta curta

**Sim, já dá para empacotar.** O pipeline de desktop (Electron + electron-builder)
está implementado e documentado no README; falta apenas **criar o `.env`** e
**rodar o build**. O instalador sai em `dist/` (nada precisa ser "baixado" de
fora — o arquivo é gerado localmente).

## Situação atual (verificada no código)

Já pronto:
- `next.config.mjs` → `output: "standalone"`.
- `desktop/build.cjs` → lê o `.env`, valida as chaves, gera
  `desktop/build-env.json`, roda `next build`, copia `public/` e `.next/static/`
  para `.next/standalone/` e roda o `electron-builder`.
- `desktop/main.js` / `desktop/preload.js` → sobem o servidor Next standalone em
  `http://localhost:4173` (porta fixa) e abrem a janela; encerram o servidor ao
  fechar.
- `desktop/electron-builder.yml` → alvo **NSIS** (Windows), ícone
  `public/icone.png`, `extraResources` com o standalone + env.
- `package.json` → script `desktop:build`; `electron` e `electron-builder` em
  `devDependencies`; `main: desktop/main.js`.
- Assets presentes: `public/icone.png`, `public/logo.png`.

Falta:
- `.env` **não existe** (só `.env.example`).
- `dist/` ainda não foi gerado (build nunca rodou).

## Objetivo

Gerar um instalador `.exe` (NSIS) em `dist/` para instalar o app no PC (Windows).

## Pré-requisitos (manuais)

1. Criar `.env` na raiz a partir de `.env.example` e preencher
   `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Dashboard do
   Supabase → Project Settings → API). `NEXT_PUBLIC_SITE_URL` é ignorado no build
   desktop (fixado em `http://localhost:4173`).
2. No Supabase → Authentication → URL Configuration → **Redirect URLs**,
   adicionar `http://localhost:4173/auth/callback` (sem isso, o login Google falha).
3. Rede disponível no build (`next/font/google` baixa as fontes em build time) e
   na primeira execução do `electron-builder` (baixa binários do Electron).
4. `public/icone.png` com ≥ 256×256 (o electron-builder gera o `.ico`).

## Passos (requer agente com permissão de escrita/execução)

1. Criar o `.env` (item 1 acima).
2. Rodar `npm run desktop:build`.
3. Conferir a saída em `dist/` (instalador `Nottase Setup <versão>.exe`).
4. Opcional: `npm run desktop:start` para abrir o Electron com o standalone já
   gerado (sem reinstalar).

## Resultado esperado

- `dist/` com o instalador NSIS (permite escolher diretório; cria atalhos na área
  de trabalho e no menu iniciar) e a pasta do app descompactado.

## Validação

1. `npm run lint` e `npx tsc --noEmit` sem novos erros (baseline: 2 warnings
   pré-existentes em `DatabaseView.tsx` e `PageEditor.tsx`).
2. `npm run build` (web) continua passando.
3. Rodar o instalador em uma máquina Windows: abrir, fazer login Google (deve
   voltar para `http://localhost:4173/auth/callback`), criar evento/database,
   subir imagem, fechar e reabrir (sessão persiste).
4. Fechar a janela → nenhum processo `node`/servidor órfão.

## Riscos e cuidados

- **Sem `.env`/chaves**: `desktop:build` falha de propósito (evita pacote sem
  chaves). Corrija criando o `.env`.
- **Redirect URL ausente no Supabase**: login Google falha no app instalado.
- **Porta 4173 ocupada**: o servidor interno não sobe; liberar a porta.
- **Primeira execução do electron-builder**: baixa binários (precisa de rede);
  `winCodeSign` está desativado (`signAndEditExecutable: false`) para evitar falha
  de symlink no Windows.
- **Instalador não assinado**: o Windows pode exibir aviso do SmartScreen.
- **macOS/Linux**: alvos configurados no yml, mas exigem build no respectivo SO —
  fora do escopo deste pedido (o pedido é "instalar no PC" → Windows).

## Fora de escopo

- Assinatura de código / notarização.
- Auto-update (ex.: `electron-updater`).
- Build para macOS/Linux a partir do Windows.
- Alterações de código-fonte (o pipeline já está completo).

## Observação

Este plano é **operacional** (criar `.env` + rodar `npm run desktop:build`); não
exige edição de código. A execução precisa de um agente com permissão de
execução/escrita (este agente de planejamento não roda comandos mutáveis).
