"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { DragEvent as ReactDragEvent } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  FolderKanban,
  GripVertical,
  MoreVertical,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Tags,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_PROJECT_COLOR, defaultColorForCategory } from "@/lib/database";
import type { ProjectCategory } from "@/types/database";
import {
  CategoryEditPopover,
  CreateProjectPopover,
  ProjectOptionsPopover,
  type NewProjectInput,
  type ProjectSummary,
} from "@/components/database/ProjectsScreen";

/** Chave de persistência do estado minimizado da sidebar de projetos. */
const COLLAPSED_KEY = "workspace:projectsSidebarCollapsed";

/**
 * Tipo MIME "privado" usado para marcar um arraste **de projeto** dentro da
 * sidebar. Permite reconhecer o nosso arraste de forma inequívoca durante o
 * `dragover` (sem confundir com arrastes externos de texto/links/arquivos), o
 * que evita o cursor de "proibido" (circle slash) em pontos válidos.
 */
const PROJECT_DRAG_MIME = "application/x-workspace-project";

interface ProjectsSidebarProps {
  /** Projetos do usuário (com categoria/cor), já carregados pelo Workspace. */
  projects: ProjectSummary[];
  /** Categorias do usuário (persistidas), já ordenadas por `position`. */
  categories: ProjectCategory[];
  /** Projeto ativo no Workspace (`null` = tela de projetos). */
  activeProjectId: string | null;
  /** Abre um projeto (passa a exibir os databases daquele projeto). */
  onOpenProject: (id: string) => void;
  /** Cria um projeto com os dados informados no popover e entra nele. */
  onCreateProject: (input: NewProjectInput) => void;
  /** Persiste uma categoria criada no popover (idempotente). */
  onCreateCategory: (name: string) => void;
  /** Persiste a nova ordem das categorias após um arraste (drag & drop). */
  onReorderCategories: (orderedNames: string[]) => void;
  /** Persiste a nova ordem dos projetos após um arraste (drag & drop). */
  onReorderProjects: (orderedIds: string[]) => void;
  /**
   * Atualiza a categoria de um projeto (arrastar um projeto para dentro/fora de
   * uma categoria na sidebar). `null` = sem categoria.
   */
  onUpdateProject: (id: string, patch: { category: string | null }) => void;
  /** Renomeia e/ou recolore uma categoria (propaga o nome para os projetos). */
  onUpdateCategory: (
    id: string,
    patch: { name?: string; color?: string | null },
  ) => void;
  /** Exclui uma categoria (os projetos que a usavam ficam sem categoria). */
  onDeleteCategory: (id: string) => void;
  /** Exclui um projeto (e, em cascata, os databases vinculados a ele). */
  onDeleteProject: (id: string) => void;
}
/**
 * Popover de **gerenciamento de categorias** aberto pelo botão de ícone da
 * sidebar. Lista as categorias (com a cor de cada uma), permite **criar** uma
 * nova categoria pelo input, **reordenar** arrastando as linhas (drag & drop) e
 * **editar/excluir** as existentes — a edição abre o `CategoryEditPopover`
 * (renomear / recolorir / excluir) ancorado à linha clicada. Renderizado em
 * portal com `position: fixed`, à direita do âncora.
 */
function CategoriesManagerPopover({
  anchorEl,
  categories,
  onCreateCategory,
  onReorderCategories,
  onUpdateCategory,
  onDeleteCategory,
  onClose,
}: {
  anchorEl: HTMLElement;
  categories: ProjectCategory[];
  onCreateCategory: (name: string) => void;
  /** Persiste a nova ordem das categorias após um arraste (drag & drop). */
  onReorderCategories: (orderedNames: string[]) => void;
  onUpdateCategory: (
    id: string,
    patch: { name?: string; color?: string | null },
  ) => void;
  onDeleteCategory: (id: string) => void;
  onClose: () => void;
}) {
  /** Texto do input de criação de categoria (limpo a cada Enter). */
  const [newName, setNewName] = useState("");
  /** Categoria cujo `CategoryEditPopover` está aberto (âncora + nome). */
  const [editAnchor, setEditAnchor] = useState<{
    el: HTMLElement;
    name: string;
  } | null>(null);
  /** Posição (viewport) do popover, calculada a partir do âncora. */
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  /**
   * Ordem exibida localmente. Deriva das categorias persistidas (`categories`),
   * mas é mantida localmente para refletir o arraste **na hora** (otimista),
   * enquanto a gravação de `position` roda em background.
   */
  const [orderedNames, setOrderedNames] = useState<string[]>(() =>
    categories.map((c) => c.name),
  );
  /**
   * Estado do arraste: `from` é a categoria arrastada e `over` é a
   * categoria-alvo (onde cairia). `null` quando não há arraste em andamento.
   */
  const [dragCategory, setDragCategory] = useState<{
    from: string;
    over: string;
  } | null>(null);

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

  // Posiciona o popover à direita do botão âncora (ou à esquerda, se não
  // couber), alinhado ao topo e mantido dentro da viewport.
  useLayoutEffect(() => {
    const rect = anchorEl.getBoundingClientRect();
    const width = 240; // w-60
    const margin = 8;
    const openLeft = rect.right + margin + width > window.innerWidth;
    const left = openLeft
      ? Math.max(margin, rect.left - margin - width)
      : rect.right + margin;
    const top = Math.min(
      Math.max(margin, rect.top),
      Math.max(margin, window.innerHeight - 320),
    );
    setPos({ top, left });
  }, [anchorEl]);

  /** Id persistido de uma categoria pelo nome (ou `null` se não existir). */
  const idOf = (name: string) =>
    categories.find((c) => c.name === name)?.id ?? null;

  /** Cria a categoria informada no input (ignora vazios e duplicatas). */
  const addCategory = (raw: string) => {
    const next = raw.trim();
    if (!next) return;
    if (!categories.some((c) => c.name === next)) onCreateCategory(next);
    setNewName("");
  };

  /**
   * Reordena as categorias: move a categoria `from` para a posição ocupada por
   * `over`, preservando a ordem relativa das demais. Atualiza a lista local na
   * hora (otimista) e persiste a nova ordem (grava `position`) no servidor.
   */
  const moveCategory = (from: string, over: string) => {
    if (from === over) return;
    const fromIndex = orderedNames.indexOf(from);
    const overIndex = orderedNames.indexOf(over);
    if (fromIndex === -1 || overIndex === -1) return;
    const next = [...orderedNames];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(overIndex, 0, moved);
    setOrderedNames(next);
    onReorderCategories(next);
  };

  /** Fecha o popover com Esc. */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (editAnchor) setEditAnchor(null);
        else onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [editAnchor, onClose]);
  return createPortal(
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} role="presentation" />
      <div
        data-categories-manager
        style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}
        className="fixed z-[60] w-60 rounded-md border bg-popover p-2 shadow-lg"
        role="dialog"
        aria-label="Gerenciar categorias"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mb-1.5 block px-1 text-[11px] uppercase tracking-wide text-muted-foreground">
          Categorias
        </span>

        {/* Input de criação no topo do popover; as categorias criadas aparecem
            logo abaixo dele (abaixo). */}
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            addCategory(newName);
          }}
        >
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nova categoria"
            autoComplete="off"
            className="h-9 min-w-0 flex-1"
            aria-label="Nova categoria"
          />
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            className="h-9 w-9 flex-none"
            title="Criar categoria"
            aria-label="Criar categoria"
            disabled={!newName.trim()}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </form>

        {categories.length === 0 ? (
          <p className="mt-2 px-1 pb-1 text-xs text-muted-foreground">
            Nenhuma categoria criada ainda.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-0.5">
            {orderedNames.map((name) => {
              const id = idOf(name);
              const isDragging = dragCategory?.from === name;
              const showLineBefore =
                dragCategory !== null &&
                dragCategory.over === name &&
                dragCategory.from !== name;
              return (
                <Fragment key={name}>
                  {/* Linha indicadora da posição de inserção durante o arraste */}
                  {showLineBefore ? (
                    <li className="h-0.5 rounded-full bg-primary" aria-hidden />
                  ) : null}
                  <li
                    className={cn("rounded", isDragging && "opacity-40")}
                    onDragOver={(event) => {
                      if (!dragCategory) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      if (dragCategory.over !== name) {
                        setDragCategory({ ...dragCategory, over: name });
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (dragCategory) moveCategory(dragCategory.from, name);
                      setDragCategory(null);
                    }}
                  >
                    <div className="group flex items-center gap-0.5 rounded hover:bg-accent/60">
                      {/* Alça de arraste: arraste para reordenar a categoria */}
                      <span
                        draggable
                        role="button"
                        tabIndex={-1}
                        aria-label={`Arrastar categoria ${name}`}
                        title="Arraste para mover"
                        onDragStart={(event) => {
                          event.dataTransfer.setData("text/plain", name);
                          event.dataTransfer.effectAllowed = "move";
                          setDragCategory({ from: name, over: name });
                        }}
                        onDragEnd={() => setDragCategory(null)}
                        className="flex h-7 w-4 flex-none cursor-grab items-center justify-center text-muted-foreground/60 active:cursor-grabbing"
                      >
                        <GripVertical className="h-3.5 w-3.5" />
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          if (id === null) return;
                          const el = e.currentTarget;
                          setEditAnchor((cur) =>
                            cur?.name === name ? null : { el, name },
                          );
                        }}
                        title={`Editar categoria ${name}`}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left text-sm"
                      >
                        <span
                          className={cn(
                            "h-2 w-2 flex-none rounded-full",
                            categories.find((c) => c.name === name)?.color ??
                              defaultColorForCategory(name),
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate">{name}</span>
                      </button>
                      <Trash2
                        className="mr-1 h-3.5 w-3.5 flex-none text-muted-foreground opacity-0 group-hover:opacity-100"
                        aria-hidden
                      />
                    </div>
                  </li>
                </Fragment>
              );
            })}
          </ul>
        )}
      </div>

      {editAnchor ? (
        <CategoryEditPopover
          key={editAnchor.name}
          anchorEl={editAnchor.el}
          name={editAnchor.name}
          color={
            categories.find((c) => c.name === editAnchor.name)?.color ??
            defaultColorForCategory(editAnchor.name)
          }
          onRename={(raw) => {
            const id = idOf(editAnchor.name);
            const next = raw.trim();
            if (id && next) onUpdateCategory(id, { name: next });
          }}
          onRecolor={(color) => {
            const id = idOf(editAnchor.name);
            if (id) onUpdateCategory(id, { color });
          }}
          onRemove={() => {
            const id = idOf(editAnchor.name);
            if (id) onDeleteCategory(id);
            setEditAnchor(null);
          }}
          onClose={() => setEditAnchor(null)}
        />
      ) : null}
    </>,
    document.body,
  );
}

/**
 * Sidebar esquerda da área de Workspace (estilo Notion).
 *
 * Lista os projetos do usuário agrupados pela categoria (na ordem persistida),
 * permitindo alternar entre eles sem voltar à grade. Também permite criar um
 * novo projeto pelo botão "Novo projeto" e **gerenciar as categorias** pelo
 * botão de ícone logo abaixo (criar / renomear / recolorir / excluir). Pode ser
 * minimizada — a preferência é guardada em localStorage, no mesmo padrão da
 * sidebar do calendário.
 */
export function ProjectsSidebar({
  projects,
  categories,
  activeProjectId,
  onOpenProject,
  onCreateProject,
  onCreateCategory,
  onReorderCategories,
  onReorderProjects,
  onUpdateProject,
  onUpdateCategory,
  onDeleteCategory,
  onDeleteProject,
}: ProjectsSidebarProps) {
  /** Estado de minimização da sidebar (persistido em localStorage). */
  const [collapsed, setCollapsed] = useState(false);
  /** Categorias recolhidas pelo usuário (por nome). */
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  /** Texto do filtro de busca de projetos (por nome). */
  const [query, setQuery] = useState("");
  /** Elemento ao qual o popover de criação de projeto fica ancorado. */
  const [createAnchor, setCreateAnchor] = useState<HTMLElement | null>(null);
  /** Referência à própria sidebar (usada como âncora do popover de criação). */
  const asideRef = useRef<HTMLElement>(null);
  /** Elemento âncora do popover de **gerenciamento de categorias** (botão de ícone). */
  const [categoriesAnchor, setCategoriesAnchor] = useState<HTMLElement | null>(null);
  /** Categoria sendo editada no `CategoryEditPopover` (âncora + nome). */
  const [editAnchor, setEditAnchor] = useState<{
    el: HTMLElement;
    name: string;
  } | null>(null);
  /**
   * Linha de projeto cujo `ProjectOptionsPopover` (menu de 3 pontos) está
   * aberto — guarda o botão âncora, o id e o nome do projeto.
   */
  const [optionsAnchor, setOptionsAnchor] = useState<{
    el: HTMLElement;
    project: ProjectSummary;
  } | null>(null);
  /**
   * Ordem exibida localmente (ids dos projetos). Deriva de `projects` (que vem
   * posicionado pelo banco), mas é mantida localmente para refletir o arraste
   * **na hora** (otimista), enquanto a gravação de `position` roda em background.
   */
  const [orderedIds, setOrderedIds] = useState<string[]>(() =>
    projects.map((p) => p.id),
  );
  /**
   * Estado do arraste de projetos: `from` é o projeto arrastado, `over` é o
   * projeto-alvo (onde cairia) e `overGroup` é o **nome da categoria** sob o
   * ponteiro (`null` = "Sem categoria"). Permite soltar sobre o **cabeçalho**
   * do grupo para mover o projeto para dentro/fora de uma categoria.
   */
  const [dragProject, setDragProject] = useState<{
    from: string;
    over: string;
    overGroup: string | null;
  } | null>(null);
  /**
   * Marca, de forma SINCRONA, que um arraste de projeto esta em andamento.
   * Independe do estado React (que pode estar defasado num dragover) e serve
   * como fonte ultima para autorizar o drop — evitando o cursor de "proibido"
   * (circle slash). Setada no dragstart e limpa no dragend/drop.
   */
  const projectDragActiveRef = useRef(false);

  // Sincroniza a ordem local quando a lista persistida muda, SEM reordenar os
  // ids que ja existiam localmente. Motivo: se reordenassemos por `projects`
  // (que vem do servidor), uma gravacao de `position` ainda em andamento
  // (background) faria a ordem otimista do arraste "voltar" ate o reload.
  // Aqui apenas removemos ids que sumiram e anexamos ids novos ao final.
  useEffect(() => {
    setOrderedIds((prev) => {
      const persisted = projects.map((p) => p.id);
      const known = prev.filter((id) => persisted.includes(id));
      const added = persisted.filter((id) => !prev.includes(id));
      const next = [...known, ...added];
      return next.length === prev.length && next.every((id, i) => id === prev[i])
        ? prev
        : next;
    });
  }, [projects]);

  /**
   * Categoria atual de um projeto (nome) ou `null` quando sem categoria.
   * Usa `projects` (fonte persistida) porque `orderedIds` só guarda ids.
   */
  const categoryOf = useCallback(
    (id: string): string | null => {
      const project = projects.find((p) => p.id === id);
      return project?.category ?? null;
    },
    [projects],
  );

  /** Move um projeto para outra categoria (optimista) e persiste. */
  const assignCategory = useCallback(
    (id: string, category: string | null) => {
      if (categoryOf(id) === category) return;
      onUpdateProject(id, { category });
    },
    [categoryOf, onUpdateProject],
  );
  /**
   * Calcula a nova ordem plana movendo `from` para junto de `target`
   * (`before` = antes do alvo; `false` = logo depois). Remove `from` da posicao
   * atual e o reinsere no indice do alvo, independente de categoria. Assim,
   * apos a troca de categoria, o projeto cai junto do alvo no grupo de destino.
   * Retorna `null` quando nao ha mudanca.
   */
  const computeOrderRelativeTo = useCallback(
    (
      current: string[],
      from: string,
      target: string,
      before = true,
    ): string[] | null => {
      if (from === target) return null;
      const withoutFrom = current.filter((id) => id !== from);
      const targetIndex = withoutFrom.indexOf(target);
      let next: string[];
      if (targetIndex === -1) {
        if (current.includes(from)) return null;
        next = [...withoutFrom, from];
      } else {
        next = [...withoutFrom];
        next.splice(before ? targetIndex : targetIndex + 1, 0, from);
      }
      const changed =
        next.length !== current.length || next.some((id, i) => id !== current[i]);
      return changed ? next : null;
    },
    [],
  );

  /**
   * Descobre o id do projeto arrastado no momento do drop.
   *
   * Usa o estado `dragProject` quando disponivel, mas cai para o `dataTransfer`
   * (gravado no `onDragStart`) quando o estado ja foi limpo. Isso evita a
   * "corrida" entre `dragend` e `drop`: em alguns navegadores o `dragend` chega
   * antes e zera `dragProject`, fazendo o drop parecer que "falhou".
   */
  const draggedIdFrom = useCallback(
    (e: ReactDragEvent): string | null => {
      if (dragProject) return dragProject.from;
      const custom = e.dataTransfer.getData(PROJECT_DRAG_MIME);
      if (custom) return custom;
      const id = e.dataTransfer.getData("text/plain");
      return id || null;
    },
    [dragProject],
  );

  /** Encerra o arraste de projeto, limpando a ref sincrona e o estado visual. */
  const endProjectDrag = useCallback(() => {
    projectDragActiveRef.current = false;
    setDragProject(null);
  }, []);

  /**
   * Handler global de arraste. Enquanto um projeto esta sendo arrastado,
   * registra listeners em `document` para autorizar o drop em TODA a janela —
   * assim o navegador nunca desenha o cursor de "proibido" (circle slash),
   * mesmo com o ponteiro fora da sidebar (ex.: sobre a area de databases).
   *
   * Os handlers especificos da sidebar continuam decidindo ONDE soltar; aqui
   * so garantimos que o drop e sempre permitido. Ao soltar fora da sidebar, o
   * arraste e apenas encerrado (sem mover nada).
   */
  useEffect(() => {
    if (!dragProject) return;
    const onDragOver = (event: DragEvent) => {
      if (!projectDragActiveRef.current) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    };
    const onDrop = (event: DragEvent) => {
      if (!projectDragActiveRef.current) return;
      // Soltar fora de um alvo valido (que trata o drop e chama stopPropagation)
      // apenas encerra o arraste, evitando estados "presos".
      event.preventDefault();
      endProjectDrag();
    };
    const onDragEnd = () => {
      // Rede de seguranca global: cobre arraste cancelado (ESC) ou solto fora
      // da janela, onde o `dragend` pode nao borbulhar ate o `<aside>`.
      if (projectDragActiveRef.current) endProjectDrag();
    };
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
    document.addEventListener("dragend", onDragEnd);
    return () => {
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
      document.removeEventListener("dragend", onDragEnd);
    };
  }, [dragProject, endProjectDrag]);

  /**
   * Retorna `true` se o arraste corrente e de um projeto (nosso).
   *
   * Usa o `dataTransfer` (sincrono e sempre disponivel durante `dragover`) como
   * fonte principal, caindo para o estado `dragProject`. Isso evita o cursor de
   * "proibido" (circle slash) que o navegador mostra quando o `dragover` NAO
   * chama `preventDefault()` por causa da corrida com o `dragend`.
   *
   * Obs.: durante `dragover`/`dragenter` o `getData()` pode vir vazio por
   * seguranca do navegador; nesses casos `types` ainda lista `text/plain`.
   */
  const isProjectDrag = useCallback(
    (e: ReactDragEvent): boolean => {
      if (projectDragActiveRef.current) return true;
      if (dragProject) return true;
      const types = e.dataTransfer?.types;
      if (!types) return false;
      const has = (value: string) => Array.prototype.includes.call(types, value);
      // Reconhece primeiro o tipo "privado" gravado no dragstart do projeto.
      // O fallback para text/plain cobre navegadores que nao expoem tipos
      // customizados durante o dragover.
      return has(PROJECT_DRAG_MIME) || has("text/plain");
    },
    [dragProject],
  );






  /** Abre o popover de criação ancorado à sidebar (abre à direita dela). */
  const openCreate = useCallback(() => {
    setCreateAnchor(asideRef.current);
  }, []);

  // Restaura a preferência de minimização após a montagem (evita mismatch de hidratação).
  useEffect(() => {
    if (typeof window === "undefined") return;
    setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "1");
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      }
      return next;
    });
  }, []);

  const toggleGroup = useCallback((name: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  /**
   * Projetos agrupados por categoria. Respeita a ordem de `categories` (que já
   * vem posicionada) e coloca "Sem categoria" por último.
   */
  const groups = useMemo(() => {
    const byCategory = new Map<string, ProjectSummary[]>();
    // Respeita a ordem local (`orderedIds`) refletida pelo arraste, caindo para
    // a ordem de `projects` para ids ainda não presentes localmente.
    const byId = new Map(projects.map((p) => [p.id, p]));
    const orderedProjects = [
      ...orderedIds
        .map((id) => byId.get(id))
        .filter((p): p is ProjectSummary => Boolean(p)),
      ...projects.filter((p) => !orderedIds.includes(p.id)),
    ];
    for (const project of orderedProjects) {
      const key = project.category ?? "";
      const list = byCategory.get(key);
      if (list) list.push(project);
      else byCategory.set(key, [project]);
    }

    const ordered: { name: string; color: string; items: ProjectSummary[] }[] = [];
    for (const category of categories) {
      const items = byCategory.get(category.name);
      if (!items || items.length === 0) continue;
      ordered.push({
        name: category.name,
        color: category.color ?? defaultColorForCategory(category.name),
        items,
      });
      byCategory.delete(category.name);
    }

    // Categorias usadas por projetos mas ausentes da tabela de categorias.
    for (const [name, items] of byCategory) {
      if (name === "") continue;
      ordered.push({ name, color: defaultColorForCategory(name), items });
    }

    const uncategorized = byCategory.get("");
    if (uncategorized && uncategorized.length > 0) {
      ordered.push({ name: "", color: DEFAULT_PROJECT_COLOR, items: uncategorized });
    }

    return ordered;
  }, [categories, projects, orderedIds]);

  /**
   * Grupos filtrados pelo texto de busca (`query`). Compara o nome do projeto de
   * forma insensível a caixa e acentos; grupos sem correspondências somem.
   */
  const filteredGroups = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return groups;
    const normalize = (value: string) =>
      value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    const needle = normalize(term);
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((project) =>
          normalize(project.name).includes(needle),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, query]);

  // Estado minimizado: rail estreito apenas com os controles essenciais.
  if (collapsed) {
    return (
      <aside
        ref={asideRef}
        className="hidden shrink-0 flex-col items-center gap-2 border-r bg-background/60 p-2 md:flex"
      >
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label="Expandir sidebar de projetos"
          title="Expandir sidebar de projetos"
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={openCreate}
          aria-label="Novo projeto"
          title="Novo projeto"
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={(e) => setCategoriesAnchor(e.currentTarget)}
          aria-label="Gerenciar categorias"
          title="Gerenciar categorias"
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Tags className="h-4 w-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside
      ref={asideRef}
      // Autoriza o drop em QUALQUER ponto da sidebar enquanto um projeto e
      // arrastado. Sem isto, soltar em uma area sem handler (vao entre itens,
      // espaco vazio, cabecalho) cancelava o drop e a movimentacao "falhava".
      onDragOver={(e) => {
        if (!isProjectDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={(e) => {
        // Se nenhum alvo especifico (li/section) tratou o drop, apenas limpa o
        // estado para nao ficar com um arraste "preso".
        endProjectDrag();
      }}
      // Rede de seguranca: o `dragend` borbulha do grip ate aqui. Se o arraste
      // terminar fora de um alvo valido (ESC, area externa), encerra o estado.
      onDragEnd={endProjectDrag}
      className="scrollbar-on-hover hidden w-60 shrink-0 flex-col gap-3 overflow-y-scroll border-r bg-background/60 p-3 md:flex"
    >
      <section className="flex flex-col gap-0.5">
        <div className="mb-0.5 flex items-center justify-between px-1">
          <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <FolderKanban className="h-3.5 w-3.5" />
            Projetos
          </span>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Minimizar sidebar de projetos"
            title="Minimizar sidebar de projetos"
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={openCreate}
          title="Novo projeto"
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5 flex-none" />
          <span className="min-w-0 flex-1 truncate">Novo projeto</span>
        </button>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar projeto"
            autoComplete="off"
            aria-label="Buscar projeto pelo nome"
            className="h-8 pl-7"
          />
        </div>

        <button
          type="button"
          onClick={(e) => setCategoriesAnchor(e.currentTarget)}
          aria-label="Gerenciar categorias"
          title="Gerenciar categorias"
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Tags className="h-3.5 w-3.5 flex-none" />
        </button>
      </section>

      {groups.length === 0 ? (
        <p className="px-1 text-xs text-muted-foreground">
          Nenhum projeto criado ainda.
        </p>
      ) : filteredGroups.length === 0 ? (
        <p className="px-1 text-xs text-muted-foreground">
          Nenhum projeto encontrado.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {filteredGroups.map((group) => {
            const key = group.name || "__uncategorized__";
            const isGroupCollapsed = collapsedGroups.has(key);
            const groupName = group.name || null;
            // Grupo sob o ponteiro durante o arraste (destaque + alvo do drop).
            const isGroupDropTarget =
              dragProject !== null && dragProject.overGroup === groupName;

            return (
              <section
                key={key}
                onDragOver={(e) => {
                  if (!isProjectDrag(e)) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragProject && dragProject.overGroup !== groupName) {
                    setDragProject((prev) =>
                      prev ? { ...prev, overGroup: groupName } : prev,
                    );
                  }
                }}
                onDrop={(e) => {
                  const from = draggedIdFrom(e);
                  if (!from) return;
                  e.preventDefault();
                  endProjectDrag();
                  // Move para a categoria do grupo solto e posiciona o projeto
                  // junto do ultimo item do grupo (ou no fim, se o grupo estiver
                  // vazio). Assim o projeto entra no grupo de destino.
                  assignCategory(from, groupName);
                  const target = group.items
                    .map((p) => p.id)
                    .filter((id) => id !== from)
                    .pop();
                  const next = target
                    ? computeOrderRelativeTo(orderedIds, from, target, false)
                    : (() => {
                        const withoutFrom = orderedIds.filter((id) => id !== from);
                        return [...withoutFrom, from];
                      })();
                  if (!next) return;
                  setOrderedIds(next);
                  onReorderProjects(next);
                }}
                onDragEnd={endProjectDrag}
                className={cn(
                  "flex flex-col gap-0.5 rounded transition-colors",
                  isGroupDropTarget && "bg-primary/5 ring-1 ring-primary/30",
                )}
              >
                {group.name ? (
                  <button
                    type="button"
                    onClick={() => toggleGroup(key)}
                    aria-expanded={!isGroupCollapsed}
                    title={group.name}
                    className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground hover:bg-accent"
                  >
                    <ChevronDown
                      className={cn(
                        "h-3 w-3 flex-none transition-transform",
                        isGroupCollapsed && "-rotate-90",
                      )}
                    />
                    <span className={cn("h-2.5 w-2.5 flex-none rounded-full", group.color)} />
                    <span className="min-w-0 flex-1 truncate">{group.name}</span>
                    <span className="flex-none text-muted-foreground/70">
                      {group.items.length}
                    </span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 px-1 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <span className={cn("h-2.5 w-2.5 flex-none rounded-full", group.color)} />
                    <span className="min-w-0 flex-1 truncate">Sem categoria</span>
                    <span className="flex-none text-muted-foreground/70">
                      {group.items.length}
                    </span>
                  </div>
                )}

                {!isGroupCollapsed ? (
                  <ul
                    className="space-y-0.5"
                    // Cobre os "vaos" (2px) entre os itens: sem isto, soltar o
                    // projeto exatamente entre duas linhas cancela o drop e a
                    // movimentacao "falha" silenciosamente.
                    onDragOver={(e) => {
                      if (!isProjectDrag(e)) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                  >
                    {group.items.map((project) => {
                      const isActive = project.id === activeProjectId;
                      const optionsOpen = optionsAnchor?.project.id === project.id;
                      const isDragging = dragProject?.from === project.id;
                      const isDropTarget =
                        dragProject !== null &&
                        dragProject.over === project.id &&
                        dragProject.from !== project.id;
                      return (
                        <li
                          key={project.id}
                          onDragOver={(e) => {
                            if (!isProjectDrag(e)) return;
                            e.preventDefault();
                            e.stopPropagation();
                            e.dataTransfer.dropEffect = "move";
                            if (
                              dragProject &&
                              (dragProject.over !== project.id ||
                                dragProject.overGroup !== groupName)
                            ) {
                              setDragProject((prev) =>
                                prev
                                  ? { ...prev, over: project.id, overGroup: groupName }
                                  : prev,
                              );
                            }
                          }}
                          onDrop={(e) => {
                            const from = draggedIdFrom(e);
                            if (!from) return;
                            e.preventDefault();
                            e.stopPropagation();
                            endProjectDrag();
                            // Move para a categoria do projeto-alvo e insere
                            // `from` logo **antes** dele na ordem plana.
                            assignCategory(from, groupName);
                            const next = computeOrderRelativeTo(
                              orderedIds,
                              from,
                              project.id,
                              true,
                            );
                            if (!next) return;
                            setOrderedIds(next);
                            onReorderProjects(next);
                          }}
                          onDragEnd={endProjectDrag}
                          className={cn(
                            "relative",
                            isDropTarget &&
                              "before:absolute before:-top-0.5 before:left-1 before:right-1 before:h-0.5 before:rounded-full before:bg-primary",
                          )}
                        >
                          <div
                            className={cn(
                              "group relative flex items-center",
                              isDragging && "opacity-50",
                            )}
                          >
                            <button
                              type="button"
                              draggable
                              onDragStart={(e) => {
                                projectDragActiveRef.current = true;
                                setDragProject({
                                  from: project.id,
                                  over: project.id,
                                  overGroup: groupName,
                                });
                                e.dataTransfer.effectAllowed = "move";
                                // Marca o arraste como "de projeto" (tipo privado,
                                // sem payload) e grava o id em text/plain.
                                e.dataTransfer.setData(PROJECT_DRAG_MIME, project.id);
                                e.dataTransfer.setData("text/plain", project.id);
                              }}
                              aria-label={`Reordenar projeto ${project.name}`}
                              title="Arrastar para reordenar"
                              className={cn(
                                "absolute left-0 z-10 flex h-6 w-6 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground active:cursor-grabbing",
                                isDragging
                                  ? "opacity-100"
                                  : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                              )}
                            >
                              <GripVertical className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenProject(project.id)}
                              title={project.name}
                              className={cn(
                                "flex min-w-0 flex-1 items-center gap-2 rounded py-1.5 pl-6 pr-6 text-left text-sm hover:bg-accent",
                                isActive && "bg-primary/10 font-medium text-primary",
                                optionsOpen && "bg-accent",
                              )}
                            >
                              <span
                                className={cn(
                                  "h-1.5 w-1.5 flex-none rounded-full",
                                  project.color ?? group.color,
                                )}
                              />
                              <span className="min-w-0 flex-1 truncate">{project.name}</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOptionsAnchor({ el: e.currentTarget, project });
                              }}
                              aria-label={`Opções do projeto ${project.name}`}
                              title="Opções do projeto"
                              className={cn(
                                "absolute right-1 flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground",
                                optionsOpen
                                  ? "opacity-100"
                                  : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                              )}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </section>
            );
          })}
        </div>
      )}

      {createAnchor ? (
        <CreateProjectPopover
          anchorEl={createAnchor}
          categories={categories}
          onCancel={() => setCreateAnchor(null)}
          onCreateCategory={onCreateCategory}
          onConfirm={(input) => {
            onCreateProject(input);
            setCreateAnchor(null);
          }}
        />
      ) : null}

      {categoriesAnchor ? (
        <CategoriesManagerPopover
          anchorEl={categoriesAnchor}
          categories={categories}
          onCreateCategory={onCreateCategory}
          onReorderCategories={onReorderCategories}
          onUpdateCategory={onUpdateCategory}
          onDeleteCategory={onDeleteCategory}
          onClose={() => setCategoriesAnchor(null)}
        />
      ) : null}

      {optionsAnchor ? (
        <ProjectOptionsPopover
          anchorEl={optionsAnchor.el}
          projectName={optionsAnchor.project.name}
          onDelete={() => onDeleteProject(optionsAnchor.project.id)}
          onClose={() => setOptionsAnchor(null)}
        />
      ) : null}
    </aside>
  );
}

