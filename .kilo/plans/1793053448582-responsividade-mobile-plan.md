# Responsividade mobile — paridade funcional

## Objetivo

Deixar o app **utilizável em celular (360–430px, retrato)** sem estourar a viewport e sem esconder
funcionalidade: navegação do Workspace acessível, popovers/painéis presos à tela, página do item
editável e arraste por toque sem conflitar com a rolagem.

Não é um redesign: a tabela continua com rolagem horizontal e os layouts densos. Um layout mobile
dedicado (cards no lugar da tabela, bottom sheets) fica para outra fase.

## Decisões (fechadas com o usuário)

1. **Escopo**: paridade funcional (não layout dedicado).
2. **Navegação**: off-canvas reaproveitando a sidebar existente (`ProjectsSidebar`/`CalendarSidebar`),
   aberta por um botão de menu no `Header`, com fundo escurecido. Sem dependência nova, sem
   componente duplicado.
3. **Página do item**: em `<768px` ocupa a tela toda (ignora a preferência centralizada/à direita).
4. **Breakpoint de referência**: `md` (768px) do Tailwind — o mesmo já usado por
   `ProjectsSidebar.tsx:989,1055` e `CalendarSidebar.tsx:147,171`. `tailwind.config.ts` não tem
   `screens` customizados; não vamos criar.

## Contexto (levantamento)

Já funciona em 360px: landing/marketing, kanban (rola na horizontal), gráfico (`ResponsiveContainer`),
faixa de abas dos databases (`OpenDatabaseBar`, rola), `TableSettingsPopover`/`OptionColorPopover`/
`AutomationsPanel` (têm `max-w`), barra de título da tabela (`flex-wrap`).

Lacunas a corrigir:

- **Navegação**: as duas sidebars são `hidden … md:flex` e não existe drawer/Sheet nem hook de media
  query → no celular não dá para buscar no Workspace, criar projeto, gerenciar categorias nem ver a
  árvore (só trocar de database pelo "+" da faixa de abas).
- **Popovers com largura fixa** ancorados dentro da tabela larga: editor de coluna (`w-64`/`w-72`),
  seletor de ícone da coluna (`h-80 w-64`), opções de Status/Seleção (`w-80`), menus numéricos
  (`min-w-[280px]`/`min-w-[220px]`), popover da célula de relação (`w-72`), menu de filtros (`w-56`),
  menu da coluna do Kanban (`w-60`), popovers da página do item (`w-52`/`w-56`).
- **Página do item**: layout "centralizada" usa `max-w-[60vw]` (≈216px em 360) e `RowPageContent`
  tem paddings fixos e nome de propriedade `w-32`.
- **Toque**: o `DndContext` usa só `PointerSensor` com `activationConstraint: { distance: 6 }`
  (`DatabaseView.tsx:879-882`) → 6px de movimento já inicia arraste de linha/coluna, brigando com a
  rolagem no celular.
- **Diálogos**: `EventDialog` (conteúdo longo) sem `max-h`/`max-w` relativo à viewport.

## Etapas

### 1. Navegação off-canvas (Workspace e Calendário)

1. `src/components/calendar/CalendarProvider.tsx`: novo estado `mobileNavOpen` + `closeMobileNav()`.
   - Fechar em `Escape` e ao trocar `appView`.
   - Renderizar o fundo (`md:hidden fixed inset-0 z-40 bg-black/40`) quando aberto, com clique para
     fechar.
   - Passar `mobileOpen`/`onCloseMobile` para `CalendarSidebar` e (via `DatabaseView`) para
     `ProjectsSidebar`.
2. `src/components/calendar/Header.tsx`: botão "Abrir navegação" (ícone `Menu` do lucide) com
   `md:hidden`, `aria-label="Abrir navegação"`, `aria-expanded={mobileNavOpen}`, antes do seletor
   Calendário/Workspace. Nova prop `onOpenMobileNav`.
3. `src/components/database/ProjectsSidebar.tsx`: trocar `hidden shrink-0 … md:flex` (rail em `:989`,
   expandida em `:1055`) por off-canvas:
   - `fixed inset-y-0 left-0 z-50 flex w-60 -translate-x-full transition-transform md:static md:z-auto md:translate-x-0` + `mobileOpen && "translate-x-0"`.
   - Novas props **opcionais** `mobileOpen?: boolean` / `onCloseMobile?: () => void` (opcionais para
     não quebrar quem renderiza o componente em teste).
   - No celular **ignorar `collapsed`**: o drawer sempre mostra a versão expandida.
   - Chamar `onCloseMobile()` ao abrir projeto/database/busca (navegação fecha o drawer).
4. `src/components/calendar/CalendarSidebar.tsx`: mesmo tratamento (`:147` rail, `:171` expandida).
5. `src/components/database/DatabaseView.tsx`: nova prop opcional `onCloseMobileNav`, chamada ao
   abrir/trocar database pelo "+" e pelas abas (para o drawer fechar depois da escolha).

### 2. Nada estoura a viewport

Adicionar `max-w-[calc(100vw-1rem)]` (e `max-h-[80vh] overflow-y-auto` onde o conteúdo for longo) aos
elementos de largura fixa:

- `DatabaseView.tsx`: `data-column-editor` (`w-64`/`w-72`), seletor de ícone da coluna
  (`h-80 w-64`), opções de Status/Seleção (`w-80`), menus numéricos (`min-w-[280px]`,
  `min-w-[220px]`), popover da célula de relação (`w-72`), menu de filtros (`w-56`).
- Painel da célula (`w-64 min-w-full`): manter `min-w-full` só a partir de `md`
  (`md:min-w-full`), para uma coluna larga não forçar o painel a passar da tela.
- `src/components/database/KanbanBoard.tsx:189` (`w-60`).
- `src/components/database/RowPageContent.tsx` (`w-52`, `w-56`).
- Larguras calculadas por JS: `WorkspaceSearchPopover.tsx:101` e `DatabasePickerPopover.tsx:57` usam
  `Math.max(320, …)` → trocar por um clamp que caiba (`window.innerWidth - 16`, mínimo ~288) e
  garantir `left + width <= window.innerWidth - 8`.

### 3. Página do item em tela cheia no celular

- `DatabaseView.tsx` (overlay/painel da página do item, layouts `center`/`right`): em `< md` o painel
  ocupa tudo — overlay `max-md:p-0`; painel `max-md:max-w-none max-md:rounded-none max-md:border-0`.
  O layout "Página inteira" já funciona; o efeito é os três ficarem iguais no celular.
- `src/components/database/RowPageContent.tsx`: paddings fixos (`pl-[3.75rem] pr-5`, `pl-[2.5rem]
  pr-[2.5rem]`) → reduzir em `< md` (ex.: `pl-3 pr-3 md:pl-[3.75rem]`); nome da propriedade `w-32` →
  `w-24 md:w-32`.

### 4. Calendário e diálogos

- `src/components/EventDialog.tsx` e `src/components/ui/dialog.tsx`: `max-w-[calc(100vw-2rem)]` +
  `max-h-[90vh] overflow-y-auto` (o formulário de evento é longo).
- `src/components/calendar/MonthGrid.tsx` e `WeekCalendar.tsx`: reduzir paddings/fontes em `< sm`
  (célula do dia fica ~48px em 360) e truncar os chips de evento para não empurrar a largura.
- `src/components/calendar/EventDetails.tsx`: `grid-cols-2` → `sm:grid-cols-2` se ficar apertado.

### 5. Toque no arraste (dnd-kit)

- `DatabaseView.tsx:879-882`: trocar `PointerSensor` por `MouseSensor` (`distance: 6`) +
  `TouchSensor` (`{ delay: 250, tolerance: 8 }`) — toque longo arrasta, rolagem vertical não.

### 6. Polimento da barra de título da tabela (opcional)

- `DatabaseView.tsx` (barra em `:3771`): esconder rótulos em `< md` (o input de busca `w-44` e o link
  do database relacionado `max-w-[160px]`) para a barra não virar 3 linhas em 360.
- `Header.tsx`: o rótulo "Workspace" já é o único texto do seletor de app; considerar `hidden sm:inline`.

## Testes e validação

- Novo teste (jsdom valida estado/DOM, não layout): com `DatabaseView` renderizado, clicar no botão
  "Abrir navegação" do Header mostra a sidebar; clicar no fundo escurecido fecha; trocar de database
  fecha.
- `npx tsc --noEmit` · `npm run lint` (deve seguir com **2 warnings pré-existentes**) · `npm test`
  (baseline atual: **200 testes**) · `npm run build`.
- Manual (DevTools, 360×740 e 390×844): drawer abre/fecha e dá acesso a projetos/busca/categorias;
  cada popover da tabela fica dentro da tela; página do item em tela cheia e editável; tabela rola na
  horizontal com a barra fixa alinhada; kanban rola; mês/semana do calendário legíveis; diálogo de
  evento utilizável; arraste de linha no mouse continua funcionando e no toque só após 250ms.
- Conferir o **desktop** (1280px) depois das mudanças de sidebar: rail colapsado, layout normal e
  nenhum popover alterado.

## Riscos

- Trocar `hidden md:flex` por off-canvas pode afetar o desktop → conferir 1280px e o estado colapsado.
- Os `max-w` novos só agem em viewport estreita; revisar visualmente que o desktop não mudou.
- A troca de sensor pode afetar o arraste com mouse → manter `distance: 6` no `MouseSensor`.
- A página do item ignorar a preferência no celular é intencional; registrar em comentário no código.
- `z-index`: o drawer precisa ficar acima da tabela e do rodapé fixo (`z-40`) — usar `z-50` e conferir
  o menu do usuário no Header (`z-50`).

## Fora de escopo

- Layout mobile dedicado (cards no lugar da tabela, bottom sheets, kanban de uma coluna por vez).
- PWA/manifest, modo offline, atalhos de teclado.
- Editores de célula específicos para toque além do sensor do dnd-kit.
- Telas de marketing (já responsivas) e o componente `DatabasesScreen` (aparentemente não usado hoje).
