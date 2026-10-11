"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  FolderKanban,
  Plus,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_PROJECT_COLOR,
  PROJECT_COLORS,
  defaultColorForCategory,
} from "@/lib/database";
import type { ProjectCategory } from "@/types/database";
import { cn } from "@/lib/utils";

/**
 * Resumo de um projeto exibido na listagem.
 * Mantido leve de propósito: a tela só precisa de metadados para renderizar as linhas.
 */
export interface ProjectSummary {
  id: string;
  name: string;
  /** Categoria do projeto (ex.: Trabalho, Pessoal...). `null` = sem categoria. */
  category: string | null;
  /** Classe de cor **da categoria** do projeto. `null` = cor padrão. */
  color: string | null;
  /** Quantidade de databases vinculados ao projeto. */
  databaseCount: number;
}

/** Dados informados no popover de criação de projeto. */
export interface NewProjectInput {
  name: string;
  category: string | null;
  color: string | null;
}

interface ProjectsScreenProps {
  projects: ProjectSummary[];
  /** Categorias do usuário (persistidas), já ordenadas por `position`. */
  categories: ProjectCategory[];
  onOpen: (id: string) => void;
  /** Cria um projeto com os dados informados no popover e entra nele. */
  onCreate: (input: NewProjectInput) => void;
  /** Persiste uma categoria criada no popover (idempotente). */
  onCreateCategory: (name: string) => void;
  onDelete: (id: string) => void;
}

/**
 * Tela inicial do Workspace: lista os projetos existentes e permite criar um
 * novo. Ao abrir um projeto, a tela de databases daquele projeto é exibida.
 *
 * Os gatilhos de "Criar projeto" (cabeçalho e estado vazio) abrem o mesmo
 * popover ancorado logo abaixo do botão clicado, com nome, categoria e cor.
 */
export function ProjectsScreen({
  projects,
  categories,
  onOpen,
  onCreate,
  onCreateCategory,
  onDelete,
}: ProjectsScreenProps) {
  /** Elemento ao qual o popover de criação fica ancorado (botão clicado). */
  const [createAnchor, setCreateAnchor] = useState<HTMLElement | null>(null);

  const openCreate = useCallback((anchor: HTMLElement) => {
    setCreateAnchor(anchor);
  }, []);

  const closeCreate = useCallback(() => setCreateAnchor(null), []);

  const handleConfirmCreate = useCallback(
    (input: NewProjectInput) => {
      onCreate(input);
      setCreateAnchor(null);
    },
    [onCreate],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
        {/* Cabeçalho da tela */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
              <FolderKanban className="h-4 w-4 text-primary" />
            </span>
            <div className="flex flex-col leading-tight">
              <span className="text-lg font-semibold">Projetos</span>
              <span className="text-xs text-muted-foreground">
                {projects.length === 0
                  ? "Nenhum projeto ainda"
                  : `${projects.length} ${
                      projects.length === 1 ? "projeto" : "projetos"
                    }`}
              </span>
            </div>
          </div>

          <Button size="sm" onClick={(e) => openCreate(e.currentTarget)}>
            <Plus />
            Criar projeto
          </Button>
        </div>

        {/* Conteúdo: grade de cards de projetos ou estado vazio */}
        <div className="no-scrollbar min-h-0 flex-1 overflow-auto p-4">
          {projects.length === 0 ? (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <FolderKanban className="h-6 w-6 text-muted-foreground" />
              </span>
              <div className="space-y-1">
                <p className="text-sm font-medium">Nenhum projeto criado</p>
                <p className="text-xs text-muted-foreground">
                  Crie um projeto para começar a organizar seus databases.
                </p>
              </div>
              <Button size="sm" onClick={(e) => openCreate(e.currentTarget)}>
                <Plus />
                Criar projeto
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onOpen={onOpen}
                  onDelete={onDelete}
                />
              ))}

              {/* Card fantasma: abre o popover de criação */}
              <button
                type="button"
                onClick={(e) => openCreate(e.currentTarget)}
                className={cn(
                  "flex min-h-[132px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-muted-foreground transition-colors",
                  "hover:border-primary/40 hover:bg-accent/40 hover:text-primary",
                )}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                  <Plus className="h-4 w-4" />
                </span>
                <span className="text-sm font-medium">Novo projeto</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {createAnchor ? (
        <CreateProjectPopover
          anchorEl={createAnchor}
          categories={categories}
          onCancel={closeCreate}
          onCreateCategory={onCreateCategory}
          onConfirm={handleConfirmCreate}
        />
      ) : null}
    </div>
  );
}


/**
 * Botão de cor de uma categoria + paleta. A paleta é renderizada num **portal**
 * com `position: fixed` (ancorada ao botão), para que abrir a cor **não** conte
 * como transbordamento do popover rolável do "Criar projeto" — mesma técnica do
 * seletor de propriedade do database.
 */
function CategoryColorButton({
  color,
  label,
  open,
  onToggle,
  onPick,
}: {
  color: string;
  label: string;
  open: boolean;
  onToggle: () => void;
  onPick: (color: string) => void;
}) {
  /** Botão usado para ancorar a paleta fora do container rolável. */
  const btnRef = useRef<HTMLButtonElement>(null);
  /** Posição (viewport) da paleta, calculada ao abrir. */
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  /** Abre/fecha a paleta, posicionando-a sobre o botão. */
  const handleClick = () => {
    if (open) {
      onToggle();
      setPos(null);
      return;
    }
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      const paletteWidth = 152; // w-[152px] (grid de 5 colunas + gaps)
      const paletteHeight = 152;
      const left = Math.min(rect.left, window.innerWidth - paletteWidth - 8);
      const openUp = rect.bottom + 4 + paletteHeight > window.innerHeight;
      setPos({
        top: openUp ? rect.top - paletteHeight - 4 : rect.bottom + 4,
        left: Math.max(8, left),
      });
    }
    onToggle();
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleClick}
        aria-label={`Cor da categoria ${label}`}
        aria-expanded={open}
        title="Alterar cor"
        className="flex h-7 w-7 flex-none items-center justify-center rounded hover:bg-accent"
      >
        <span className={cn("h-3.5 w-3.5 rounded-full", color)} />
      </button>
      {open && pos
        ? createPortal(
            <div
              data-category-color-palette
              style={{ top: pos.top, left: pos.left }}
              className="fixed z-[60] grid w-[152px] grid-cols-5 gap-1 rounded-md border bg-popover p-2 shadow-lg"
            >
              {PROJECT_COLORS.map((option) => (
                <button
                  key={option.color}
                  type="button"
                  onClick={() => {
                    onPick(option.color);
                    setPos(null);
                  }}
                  aria-label={`Cor ${option.label}`}
                  title={option.label}
                  className={cn(
                    "h-5 w-5 rounded-full ring-offset-1 hover:ring-2 hover:ring-ring",
                    option.color,
                    color === option.color && "ring-2 ring-ring",
                  )}
                />
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}


/**
 * Popover **flutuante** de edição de uma categoria, aberto ao clicar no chevron
 * da linha. Renderizado num portal com `position: fixed`, ancorado ao chevron e
 * aberto à direita dele (ou à esquerda, se não couber), no mesmo espírito do
 * seletor de propriedade do database. Permite **alterar a cor** (paleta),
 * **renomear** e **excluir** (ícone de lixeira à direita).
 */
export function CategoryEditPopover({
  anchorEl,
  name,
  color,
  onRename,
  onRecolor,
  onRemove,
  onClose,
}: {
  anchorEl: HTMLElement;
  name: string;
  color: string;
  onRename: (rawName: string) => void;
  onRecolor: (color: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  /** Valor do input de nome (controlado localmente). */
  const [value, setValue] = useState(name);
  /** Categoria cuja paleta de cores está aberta. */
  const [paletteOpen, setPaletteOpen] = useState(false);
  /** Posição (viewport) do popover, calculada a partir do chevron. */
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Reposiciona o popover ao abrir: à direita do chevron; se não couber, à
  // esquerda. Alinha o topo com o chevron, mantendo-o dentro da viewport.
  useLayoutEffect(() => {
    const rect = anchorEl.getBoundingClientRect();
    const width = 288; // w-72
    const margin = 8;
    const openLeft = rect.right + margin + width > window.innerWidth;
    const left = openLeft
      ? Math.max(margin, rect.left - margin - width)
      : rect.right + margin;
    const top = Math.min(
      Math.max(margin, rect.top),
      Math.max(margin, window.innerHeight - 96),
    );
    setPos({ top, left });
  }, [anchorEl]);

  return createPortal(
    <div
      data-category-edit-popover
      style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}
      className="fixed z-[70] w-72 rounded-md border bg-popover p-2 shadow-lg"
      role="dialog"
      aria-label={`Editar categoria ${name}`}
    >
      <div className="flex items-center gap-1.5">
        <CategoryColorButton
          color={color}
          label={name}
          open={paletteOpen}
          onToggle={() => setPaletteOpen((cur) => !cur)}
          onPick={(next) => {
            onRecolor(next);
            setPaletteOpen(false);
          }}
        />
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onRename(value);
              onClose();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setValue(name);
              onClose();
            }
          }}
          className="h-7 min-w-0 flex-1 border-0 px-1 shadow-none"
          aria-label={`Nome da categoria ${name}`}
        />
        <button
          type="button"
          onClick={() => {
            onRemove();
            onClose();
          }}
          aria-label={`Excluir categoria ${name}`}
          title="Excluir categoria"
          className="flex h-7 w-7 flex-none items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>,
    document.body,
  );
}


/**
 * Popover de **opções do projeto** aberto pelo botão de 3 pontos (vertical) de
 * cada linha da sidebar de projetos. Renderizado num portal com
 * `position: fixed`, ancorado ao botão e aberto **à direita** dele (ou à
 * esquerda, se não couber), no mesmo espírito dos demais popovers da sidebar.
 * Por enquanto expõe apenas a ação **Excluir projeto**.
 */
export function ProjectOptionsPopover({
  anchorEl,
  projectName,
  onDelete,
  onClose,
}: {
  anchorEl: HTMLElement;
  projectName: string;
  onDelete: () => void;
  onClose: () => void;
}) {
  /** Posição (viewport) do popover, calculada a partir do botão âncora. */
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Reposiciona o popover ao abrir: à direita do botão; se não couber, à
  // esquerda. Alinha o topo com o botão, mantendo-o dentro da viewport.
  useLayoutEffect(() => {
    const rect = anchorEl.getBoundingClientRect();
    const width = 192; // w-48
    const margin = 8;
    const openLeft = rect.right + margin + width > window.innerWidth;
    const left = openLeft
      ? Math.max(margin, rect.left - margin - width)
      : rect.right + margin;
    const top = Math.min(
      Math.max(margin, rect.top),
      Math.max(margin, window.innerHeight - 96),
    );
    setPos({ top, left });
  }, [anchorEl]);

  // Fecha com Esc.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <>
      {/* Overlay invisível: clicar fora fecha o popover. */}
      <div className="fixed inset-0 z-[60]" onClick={onClose} role="presentation" />
      <div
        data-project-options-popover
        style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}
        className="fixed z-[70] w-48 rounded-md border bg-popover p-1 shadow-lg"
        role="menu"
        aria-label={`Opções do projeto ${projectName}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onDelete();
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5 flex-none" />
          <span className="min-w-0 flex-1 truncate">Excluir projeto</span>
        </button>
      </div>
    </>,
    document.body,
  );
}


export interface CreateProjectPopoverProps {
  /** Elemento ao qual o popover fica ancorado (o botão "Criar projeto" clicado). */
  anchorEl: HTMLElement | null;
  /** Categorias do usuário (persistidas), já ordenadas por `position`. */
  categories: ProjectCategory[];
  onCancel: () => void;
  /** Persiste uma categoria criada no popover (idempotente). */
  onCreateCategory: (name: string) => void;
  onConfirm: (input: NewProjectInput) => void;
}

/**
 * Popover ancorado ao elemento informado (tipicamente a sidebar de projetos,
 * abrindo **à direita** dela). Contém o campo **nome** e o campo **categoria**
 * (um **input** que, abaixo de si, mostra o seletor estilo Notion enquanto vazio
 * e, após criar no Enter, a lista de opções no **mesmo formato do seletor** —
 * pill + lista clicável para selecionar), além dos botões **Cancelar** e
 * **Confirmar**. As categorias são **persistidas** por usuário. O gerenciamento
 * (renomear / recolorir / excluir / reordenar) fica no gerenciador de categorias
 * da sidebar. Renderizado em portal com `position: fixed`, para não sofrer
 * recorte de containers com `overflow`.
 */
export function CreateProjectPopover({
  anchorEl,
  categories,
  onCancel,
  onCreateCategory,
  onConfirm,
}: CreateProjectPopoverProps) {
  const [name, setName] = useState("");
  /** Categoria **selecionada** (é o que vai para o projeto ao confirmar). */
  const [category, setCategory] = useState("");
  /** Texto exibido no input de criação (limpo a cada Enter). */
  const [categoryInput, setCategoryInput] = useState("");
  const [color, setColor] = useState<string>(DEFAULT_PROJECT_COLOR);
  /**
   * Ordem exibida no popover. Deriva das categorias persistidas (`categories`),
   * mas é mantida localmente para refletir o arraste **na hora** (otimista),
   * enquanto a gravação de `position` roda em background.
   */
  const [orderedNames, setOrderedNames] = useState<string[]>(() =>
    categories.map((c) => c.name),
  );
  const inputRef = useRef<HTMLInputElement>(null);
  /** Posição (top/left) do popover, calculada ao abrir a partir do âncora. */
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Sincroniza a ordem local quando a lista persistida muda (ex.: categoria
  // recém-criada no servidor), preservando as categorias ainda não recarregadas.
  useEffect(() => {
    setOrderedNames((prev) => {
      const persisted = categories.map((c) => c.name);
      const known = prev.filter((n) => persisted.includes(n));
      const added = persisted.filter((n) => !prev.includes(n));
      const next = [...known, ...added];
      return next.length === prev.length && next.every((n, i) => n === prev[i])
        ? prev
        : next;
    });
  }, [categories]);

  // Posiciona o popover à direita do elemento âncora (a sidebar), alinhado ao
  // topo, mantendo-o dentro da viewport. Se não houver espaço à direita, abre
  // à esquerda do âncora.
  useLayoutEffect(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const width = 384; // w-96
    const margin = 8;
    const rightOfAnchor = rect.right + margin;
    const fitsRight = rightOfAnchor + width <= window.innerWidth - margin;
    const left = fitsRight
      ? rightOfAnchor
      : Math.max(margin, rect.left - margin - width);
    // Mantém o popover dentro da viewport verticalmente (alinhado ao topo do âncora).
    const estimatedHeight = 520;
    const top = Math.min(
      Math.max(margin, rect.top),
      Math.max(margin, window.innerHeight - estimatedHeight - margin),
    );
    setPos({ top, left });
  }, [anchorEl]);

  // Foca o campo de nome assim que o popover é posicionado.
  useEffect(() => {
    if (pos) inputRef.current?.focus();
  }, [pos]);

  // Fecha com Esc.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  /**
   * Lista exibida no popover: as **categorias persistidas** do usuário, na ordem
   * salva (`orderedNames`) — que reflete o arraste otimista. Começa vazia quando
   * o usuário ainda não criou nenhuma (mostrando o seletor de "Nova opção").
   */
  const categoryList = orderedNames;

  /** Cor de uma categoria persistida (ou a cor padrão dela). */
  const colorOfCategory = (name: string) =>
    categories.find((c) => c.name === name)?.color ??
    defaultColorForCategory(name);

  /** Seleciona a categoria e aplica a cor dela ao projeto. */
  const selectCategory = (name: string) => {
    setCategory(name);
    setColor(colorOfCategory(name));
  };

  /**
   * Cria uma categoria a partir do texto do input (chamado no Enter). Ignora
   * vazios e duplicatas; ao criar, já a seleciona e aplica a cor dela. A criação
   * é persistida (para a categoria existir na próxima abertura) e a ordem local
   * é atualizada na hora; o servidor devolve a lista já ordenada.
   */
  const addCategory = (raw: string) => {
    const next = raw.trim();
    if (!next) return;
    if (!orderedNames.includes(next)) {
      setOrderedNames((prev) =>
        prev.includes(next) ? prev : [...prev, next],
      );
    }
    setCategory(next);
    setColor(colorOfCategory(next) || defaultColorForCategory(next));
    onCreateCategory(next);
  };

  const submit = () =>
    onConfirm({
      name: name.trim() || "Novo projeto",
      category: category.trim() || null,
      color,
    });

  return createPortal(
    <div className="fixed inset-0 z-50" onClick={onCancel} role="presentation">
      <div
        className="absolute max-h-[calc(100vh-1rem)] w-72 overflow-y-auto rounded-lg border bg-popover p-4 shadow-lg"
        style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Criar projeto"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label
            htmlFor="new-project-name"
            className="mb-1.5 block text-[11px] uppercase tracking-wide text-muted-foreground"
          >
            Nome do projeto
          </label>
          <Input
            id="new-project-name"
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Novo projeto"
            autoComplete="off"
          />

          {/* Categoria: input de criação no topo e, abaixo dele, as categorias
              já criadas (estilo Notion). O input permanece sempre visível. */}
          <label
            htmlFor="new-project-category"
            className="mb-1.5 mt-3 block text-[11px] uppercase tracking-wide text-muted-foreground"
          >
            Categoria
          </label>
          <Input
            id="new-project-category"
            value={categoryInput}
            onChange={(e) => setCategoryInput(e.target.value)}
            onKeyDown={(e) => {
              // Só cria a categoria ao apertar Enter (não a cada tecla digitada)
              // e, em seguida, limpa o input para a próxima.
              if (e.key === "Enter") {
                e.preventDefault();
                addCategory(categoryInput);
                setCategoryInput("");
              }
            }}
            placeholder="Nova opção"
            autoComplete="off"
          />

          {/* Abaixo do input: as categorias já criadas, uma por linha. */}
          {categoryList.length > 0 ? (
            <div className="mt-2 space-y-0.5">
              {categoryList.map((c) => {
                const active = category === c;
                return (
                  <div
                    key={c}
                    className={cn(
                      "rounded-md transition-colors hover:bg-accent",
                      active && "ring-2 ring-primary/40",
                    )}
                  >
                    <div className="flex h-7 w-full items-center gap-2 pr-2">
                      <span
                        className={cn(
                          "h-3 w-3 flex-none rounded-full",
                          colorOfCategory(c),
                        )}
                        aria-hidden
                      />
                      {/* Nome (clicável para selecionar a categoria) */}
                      <button
                        type="button"
                        onClick={() => selectCategory(c)}
                        title={c}
                        className="flex min-w-0 flex-1 items-center rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span
                          className={cn(
                            "max-w-full truncate rounded px-1.5 py-0.5 text-sm font-medium",
                            active
                              ? "bg-primary/15 text-primary"
                              : "text-foreground",
                          )}
                        >
                          {c}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="mt-3 flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="submit" size="sm">
              Confirmar
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

interface ProjectCardProps {
  project: ProjectSummary;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

/**
 * Card de um projeto na grade: barra de cor da categoria no topo, nome, chip de
 * categoria e rodapé com a contagem de databases + ação de excluir (no hover).
 * Clicar no corpo do card abre o projeto.
 */
function ProjectCard({ project, onOpen, onDelete }: ProjectCardProps) {
  const accent = project.color ?? DEFAULT_PROJECT_COLOR;

  return (
    <div
      className={cn(
        "group relative flex min-h-[132px] flex-col overflow-hidden rounded-lg border bg-card shadow-sm transition-all",
        "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
      )}
    >
      {/* Barra superior com a cor da categoria */}
      <div className={cn("h-1.5 w-full", accent)} />

      {/* Corpo clicável (abre o projeto) */}
      <button
        type="button"
        onClick={() => onOpen(project.id)}
        className="flex flex-1 flex-col gap-2 p-3.5 text-left"
        title={project.name}
      >
        <div className="flex items-start gap-2.5">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-md bg-primary/10">
            <FolderKanban className="h-4 w-4 text-primary" />
          </span>
          <span className="min-w-0 flex-1 pt-0.5">
            <span className="block truncate text-sm font-semibold group-hover:underline">
              {project.name}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {project.databaseCount}{" "}
              {project.databaseCount === 1 ? "database" : "databases"}
            </span>
          </span>
        </div>

        {/* Chip da categoria, com a cor da categoria */}
        {project.category ? (
          <span
            className={cn(
              "inline-flex w-fit max-w-full items-center truncate rounded-full px-2 py-0.5 text-xs font-medium text-white",
              accent,
            )}
          >
            {project.category}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/50">Sem categoria</span>
        )}
      </button>

      {/* Ação de excluir (aparece no hover) */}
      <button
        type="button"
        onClick={() => onDelete(project.id)}
        aria-label={`Excluir ${project.name}`}
        title="Excluir projeto"
        className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded text-muted-foreground opacity-0 transition-colors group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
