# 📅 Calendário Anual — 12 meses

Aplicação de calendário com visualização de **12 meses** em grid, navegação por
ano e gerenciamento completo de eventos (CRUD) por usuário, com **login via
Google** e persistência no **Supabase** (Postgres + Row Level Security).

## 🧰 Stack

| Camada         | Tecnologia                                 |
| -------------- | ------------------------------------------ |
| Framework      | Next.js 14 (App Router)                     |
| Linguagem      | TypeScript                                  |
| UI             | React 18 + Tailwind CSS                     |
| Componentes    | shadcn/ui (Radix + CVA)                     |
| Ícones         | Lucide React                                |
| Datas          | date-fns (+ locale pt-BR)                   |
| Estado global  | Zustand                                     |
| Validação      | Zod                                         |
| Auth + Banco   | Supabase (Google OAuth + Postgres + RLS)    |

> **Segurança:** cada evento pertence a um usuário (`user_id`). As políticas de
> **Row Level Security (RLS)** garantem que um usuário só leia/edite os próprios
> eventos — inclusive contra acesso direto via API.

## 🔐 Configuração do Supabase (passo a passo)

Você já criou o projeto no Supabase. Siga os passos abaixo:

### 1. Criar as tabelas (SQL)

1. No dashboard do Supabase, abra **SQL Editor → New query**.
2. Cole todo o conteúdo de [`supabase/schema.sql`](./supabase/schema.sql) e clique em **Run**.

Isso cria as tabelas `public.events`, `public.databases`,
`public.database_rows` e `public.database_templates`, o bucket de **Storage**
`page-images` (para as imagens das páginas), liga o RLS e adiciona as políticas
de acesso por usuário. Para conferir, vá em **Table Editor** e veja `events` e
`databases`; em **Storage** você verá o bucket `page-images`.

> Se preferir usar as **migrations** (`supabase/migrations/*.sql`) com o Supabase
> CLI, rode `supabase db push`. O arquivo `schema.sql` é a versão consolidada
> para colar direto no **SQL Editor**.

### 2. Ativar o provedor Google (OAuth)

1. Crie credenciais OAuth no **Google Cloud Console**:
   - **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
   - Tipo: **Web application**.
   - **Authorized redirect URI** (obrigatório e exato):
     ```
     https://SEU-PROJETO.supabase.co/auth/v1/callback
     ```
     > O `SEU-PROJETO` é o ID do seu projeto Supabase (o mesmo do `NEXT_PUBLIC_SUPABASE_URL`).
2. Copie o **Client ID** e o **Client Secret** gerados.
3. No Supabase: **Authentication → Providers → Google** → habilite, cole o
   **Client ID** e o **Client Secret** e salve.

### 3. Definir as URLs de redirecionamento no Supabase

Em **Authentication → URL Configuration**:

- **Site URL:** `http://localhost:3000` (em produção, a URL do seu domínio).
- **Redirect URLs:** adicione `http://localhost:3000/auth/callback`
  (e, em produção, `https://SEU-DOMINIO/auth/callback`).

### 4. Variáveis de ambiente

Em **Project Settings → API**, copie a **Project URL** e a **anon public key**.
Depois, crie/edite o arquivo `.env` na raiz (use o `.env.example` como base):

```env
NEXT_PUBLIC_SUPABASE_URL="https://SEU-PROJETO.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="SUA_ANON_KEY"
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
```

## 🚀 Como rodar

```bash
# 1. Instalar dependências
npm install

# 2. Preencher o .env (passo 4 acima)

# 3. Iniciar em modo de desenvolvimento
npm run dev
```

Acesse http://localhost:3000 — você será redirecionado para **/login** e poderá
entrar com o Google.

## 📜 Scripts

| Script             | Descrição                                  |
| ------------------ | ------------------------------------------ |
| `npm run dev`      | Servidor de desenvolvimento                |
| `npm run build`    | Build de produção                          |
| `npm run start`    | Servidor de produção                       |
| `npm run lint`     | Lint (ESLint via Next)                     |


## 🗂️ Estrutura

```
supabase/
├── schema.sql               # tabelas (events + databases), bucket page-images e RLS (rodar no SQL Editor)
└── migrations/              # migrations versionadas (alternativa ao schema.sql)
src/
├── app/
│   ├── auth/
│   │   ├── callback/route.ts  # troca code OAuth pela sessão
│   │   └── signout/route.ts   # logout (volta para a landing)
│   ├── app/page.tsx           # app protegido (server component → CalendarProvider)
│   ├── login/page.tsx         # página de login (Google)
│   ├── globals.css            # Tema (variáveis CSS shadcn)
│   ├── layout.tsx
│   └── page.tsx               # landing pública (apresentação/venda)
├── components/
│   ├── auth/LoginButton.tsx   # botão "Entrar com Google"
│   ├── marketing/          # landing pública (apresentação/venda)
│   │   ├── LandingNav.tsx   # cabeçalho fixo (marca, âncoras, Entrar)
│   │   ├── Hero.tsx         # proposta de valor + CTA (login)
│   │   ├── AppPreview.tsx   # mockup da grade de 12 meses (HTML/CSS)
│   │   ├── FeatureGrid.tsx  # grade de recursos
│   │   ├── ShowcaseSection.tsx  # demonstrações (kanban, editor)
│   │   ├── PrivacySection.tsx   # faixa de privacidade (RLS)
│   │   ├── CtaSection.tsx       # chamada final para ação
│   │   └── LandingFooter.tsx    # rodapé
│   ├── calendar/
│   │   ├── CalendarProvider.tsx  # orquestração client-side
│   │   ├── YearCalendar.tsx      # alterna entre visão de semana e de mês
│   │   ├── WeekCalendar.tsx      # semana estilo Notion (7 dias + horas)
│   │   ├── MonthGrid.tsx         # um mês (7 colunas × 5-6 linhas)
│   │   ├── Header.tsx            # navegação + usuário + logout
│   │   └── EventDetails.tsx      # edição do evento no painel (autosave)
│   ├── EventDialog.tsx           # criar/editar/excluir evento
│   ├── database/
│   │   ├── ProjectsScreen.tsx    # lista de projetos (Workspace) + criar projeto
│   │   ├── DatabasesScreen.tsx   # lista de databases + criar database
│   │   ├── DatabaseView.tsx      # database estilo Notion (tabela + kanban)
│   │   └── PageEditor.tsx        # editor rico da página (TipTap + autosave debounced)
│   └── ui/                       # componentes shadcn
├── lib/
│   ├── events.ts                 # CRUD de eventos no Supabase
│   ├── database.ts               # CRUD de databases/linhas/modelos no Supabase
│   ├── images.ts                 # upload de imagens de página (Supabase Storage)
│   ├── markdown.ts               # helpers de conteúdo do editor (markdown→HTML, contagens)
│   ├── supabase/
│   │   ├── client.ts             # cliente browser
│   │   ├── server.ts             # cliente server
│   │   └── middleware.ts         # refresh de sessão + proteção de rota
│   ├── date-utils.ts             # helpers date-fns
│   ├── utils.ts                  # cn()
│   └── validations.ts            # schemas Zod
├── middleware.ts                 # invoca updateSession
├── store/useCalendarStore.ts     # Zustand
└── types/
    ├── event.ts
    └── database.ts
```

## ✨ Funcionalidades

- **Landing pública** (`/`): tela de apresentação/venda do produto — hero com prévia
  da grade de 12 meses, grade de recursos, demonstrações (kanban e editor), faixa de
  privacidade e chamada final para entrar. Não exige login.
- **App protegido** em `/app`: usuário não logado que acessa `/app` é redirecionado
  para `/login` (com `redirectTo`), e o login bem-sucedido cai de volta em `/app`.
- **Login com Google** (Supabase Auth) e logout (volta para a landing pública).
- Cada usuário enxerga **apenas os próprios eventos** (RLS no Postgres).
- Grid de **12 meses** responsivo (1 a 4 colunas conforme a tela).
- Navegação por ano (anterior / próximo / Hoje).
- Marcação do dia atual e do dia selecionado.
- **Clique** em um dia → lista de eventos na barra lateral.
- **Duplo clique** (ou botão `+`) em um dia → criar evento.
- Criar, editar e excluir eventos com validação (Zod).
- Eventos de **dia inteiro** ou com **horário** (início/fim).
- **Cores** personalizáveis por evento.
- **Alternância de telas** no header: **Calendário** ↔ **Workspace**.
- **Tela de projetos** (Workspace, persistida por usuário no Supabase): ao clicar em
  **Workspace** aparece a página de **Projetos** — cada projeto agrupa vários databases
  (hierarquia **Projeto > Databases**). Os projetos são exibidos em uma **grade de
  cards** responsiva; cada card tem uma **barra de cor no topo** com a cor da categoria,
  o **chip colorido da categoria** e a contagem de databases (a lixeira aparece no hover).
  Um **card "Novo projeto"** no fim da grade abre o popover de criação, que contém **nome**
  e **categoria**: um **input** de categoria e, logo abaixo dele, um **seletor estilo
  Notion** (grip + pill + chevron) enquanto não há itens — ao digitar e apertar **Enter**,
  a categoria é criada e passa a aparecer abaixo **no mesmo formato do seletor**
  (grip + pill + chevron), uma por linha. As categorias são **persistidas por usuário**
  (tabela `project_categories`) e podem ser **reordenadas arrastando o grip** — a nova
  ordem (`position`) é salva no Supabase. A cor pertence à
  **categoria** (não ao projeto); ao criar, o projeto é aberto em seguida. Dentro do projeto, a
  **página de databases** daquele projeto é exibida (com um botão de **voltar** para a
  lista de projetos).
- **Tela de databases** (estilo Notion, persistida por usuário no Supabase): lista os
  databases **do projeto ativo** em cards (com contagem de linhas e propriedades) e um
  botão **Criar database** — que cria um novo database (colunas padrão + uma linha em
  branco) e o abre. Cada card pode ser **aberto** (ou excluído) e há um botão de
  **voltar** dentro do database para retornar à lista.
- **Database de tabela** (estilo Notion, persistido no Supabase): colunas de título,
  status, tags, data e responsável; busca, adicionar/remover linhas e edição inline.
  Clicando no **cabeçalho de uma coluna** abre o editor de **propriedade**, onde é
  possível renomear a coluna, trocar o **tipo** (texto, número, seleção, seleção
  múltipla, data, pessoa), criar novas colunas e excluir propriedades. As colunas são
  **redimensionáveis**: arraste a alça na borda direita do cabeçalho para ajustar a
  largura (duplo clique redefine para o padrão); a largura é salva junto da definição
  de colunas do database. O popup de propriedade e os menus de célula (seleção /
  seleção múltipla) fecham ao **clicar fora**. Cada item tem
  um botão **abrir página** (ícone no hover da primeira coluna) que abre uma
  **janela flutuante centralizada** com as propriedades (uma embaixo da outra) e um
  campo de conteúdo, no estilo da página de item do Notion. O conteúdo da página é um
  **editor rico (WYSIWYG, estilo Notion)** com barra de formatação (negrito, itálico,
  tachado, título, lista, lista numerada, tarefa, citação, código e link) e
  desfazer/refazer. Os caracteres de markdown **não aparecem**: digitar `**texto**`,
  `# `, `- `, `- [ ] ` etc. já aplica a formatação na hora (input rules). Há atalhos de
  teclado (Ctrl/Cmd+B, +I, +K, +Z) e, ao pressionar Enter em uma lista/tarefa, o item é
  continuado automaticamente. Ao colocar o cursor numa linha, aparece um botão **+**
  flutuante à esquerda dela (estilo Notion); clicando nele abre um **popover para
  adicionar imagem**, que faz o **upload para o Supabase Storage** (bucket `page-images`,
  via `src/lib/images.ts`) e insere a imagem no ponto do cursor (também aceita colar uma
  URL de imagem). O editor mostra a contagem de palavras e o progresso de
  tarefas (`x/y concluídas`) e salva com **autosave debounced** (500 ms). O conteúdo é
  persistido como **HTML** em `values.__content`; modelos de página legados (markdown)
  são convertidos automaticamente. As alterações são aplicadas **otimisticamente** (UI
  atualiza na hora) e salvas em background, com refetch para reverter em caso de erro.
- **Visualizações do database** (estilo Notion): o database abre com **abas de
  visualização** criadas pelo usuário (botão **+** cria uma visão de **Tabela** ou
  **Kanban**). As abas podem ser **renomeadas** (duplo clique no rótulo) e **removidas**
  (X no hover; a última não pode ser excluída). A escolha de visão ativa e a
  propriedade de agrupamento são persistidas localmente (`localStorage`, por database).
- **Visão Kanban** (estilo Notion): as linhas viram **cards** distribuídos em colunas
  conforme o valor de uma propriedade de **Seleção/Status** ("Agrupar por"); itens sem
  valor caem em **"Sem valor"**. Cada coluna tem um botão **+ Novo** que cria um card já
  com o valor daquela coluna. Os cards podem ser **arrastados** entre colunas (mudando o
  valor de grupo) e **reordenados dentro de uma coluna** — uma **linha indicadora** mostra
  onde o card vai cair. A nova ordem é gravada em `position` (Supabase). O arraste usa o
  **drag-and-drop nativo** (HTML5; não é disparado em telas de toque).

## 🔌 Acesso a dados

Os eventos são lidos/gravados diretamente no Supabase pelo client
(`src/lib/events.ts`) usando a **anon key**, e o **RLS** no Postgres garante o
isolamento por usuário. Não há mais rotas `/api/events`.

Tabela `public.events`:

| Coluna        | Tipo          | Observação                          |
| ------------- | ------------- | ----------------------------------- |
| `id`          | uuid (pk)     | gerado automaticamente              |
| `user_id`     | uuid          | dono (FK `auth.users`)              |
| `title`       | text          | obrigatório                         |
| `description` | text          | opcional                            |
| `date`        | date          | `yyyy-MM-dd`                        |
| `all_day`     | boolean       | padrão `true`                       |
| `start_time`  | text          | `HH:mm` (quando não é dia inteiro)  |
| `end_time`    | text          | `HH:mm` (quando não é dia inteiro)  |
| `color`       | text          | hex, padrão `#3b82f6`               |
| `created_at`  | timestamptz   |                                     |
| `updated_at`  | timestamptz   | atualizado por trigger              |
