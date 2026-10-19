"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Database, Link2, Plus, Search, Table2, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { databaseIcon, ICON_OPTIONS } from "@/lib/database-icons";
import { cn } from "@/lib/utils";

/**
 * Resumo de um database exibido na listagem.
 * Mantido leve de propósito: a tela só precisa de metadados para renderizar os cards.
 */
export interface DatabaseSummary {
  id: string;
  name: string;
  /** Nome do ícone lucide escolhido pelo usuário. `null` = ícone padrão. */
  icon: string | null;
  /** Quantidade de linhas do database. */
  rowCount: number;
  /** Quantidade de propriedades/colunas do database. */
  columnCount: number;
  /** Visão vinculada: id do database de origem (`null` = database próprio). */
  linkedDatabaseId?: string | null;
}

/** Dados informados no popover de criação de database. */
export interface NewDatabaseInput {
  name: string;
  icon: string | null;
  /**
   * Id de um database existente para **espelhar**: o novo database nasce como
   * uma **visão vinculada** dele (mesmas propriedades e itens, ao vivo).
   * `null`/ausente = database próprio (vazio).
   */
  linkedDatabaseId?: string | null;
}

interface DatabasesScreenProps {
  databases: DatabaseSummary[];
  onOpen: (id: string) => void;
  /** Cria um database com os dados informados no popover e o abre. */
  onCreate: (input: NewDatabaseInput) => void;
  onDelete: (id: string) => void;
}

/**
 * Tela inicial do app "Database": lista os databases existentes
 * e permite criar um novo (estilo Notion).
 *
 * Os gatilhos de "Criar database" (cabeçalho, estado vazio e card tracejado)
 * abrem o mesmo popover, sempre ancorado **abaixo do botão branco do cabeçalho**,
 * com o nome e o ícone do novo database.
 */
export function DatabasesScreen({
  databases,
  onOpen,
  onCreate,
  onDelete,
}: DatabasesScreenProps) {
  /**
   * Todos os gatilhos de criação apontam para o **botão do cabeçalho** (o "botão
   * branco"), para que o popover sempre abra no mesmo lugar, logo abaixo dele.
   */
  const headerButtonRef = useRef<HTMLButtonElement>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const openCreate = useCallback(() => setCreateOpen(true), []);
  const closeCreate = useCallback(() => setCreateOpen(false), []);

  const handleConfirmCreate = useCallback(
    (input: NewDatabaseInput) => {
      onCreate(input);
      setCreateOpen(false);
    },
    [onCreate],
  );

  /** Busca por nome do database (case-insensitive). */
  const [search, setSearch] = useState("");
  const filteredDatabases = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return databases;
    return databases.filter((db) => db.name.toLowerCase().includes(q));
  }, [databases, search]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
        {/* Cabeçalho da tela */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
              <Database className="h-4 w-4 text-primary" />
            </span>
            <span className="text-lg font-semibold">Databases</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar database..."
                aria-label="Buscar database por nome"
                className="w-48 pl-7"
              />
            </div>
            <Button ref={headerButtonRef} size="sm" onClick={openCreate}>
              <Plus />
              Criar database
            </Button>
          </div>
        </div>

        {/* Conteúdo: grade de databases ou estado vazio */}
        <div className="no-scrollbar min-h-0 flex-1 overflow-auto p-4">
          {databases.length === 0 ? (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Database className="h-6 w-6 text-muted-foreground" />
              </span>
              <div className="space-y-1">
                <p className="text-sm font-medium">Nenhum database criado</p>
                <p className="text-xs text-muted-foreground">
                  Crie um database para começar a organizar seus itens.
                </p>
              </div>
              <Button size="sm" onClick={openCreate}>
                <Plus />
                Criar database
              </Button>
            </div>
          ) : filteredDatabases.length === 0 ? (
            <div className="flex h-full min-h-[240px] items-center justify-center text-sm text-muted-foreground">
              Nenhum database encontrado.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {filteredDatabases.map((db) => (
                <DatabaseCard
                  key={db.id}
                  database={db}
                  onOpen={onOpen}
                  onDelete={onDelete}
                />
              ))}

              {/* Card para criar novo database */}
              <button
                type="button"
                onClick={openCreate}
                className="flex min-h-[80px] flex-row items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent/40 hover:text-foreground"
              >
                <Plus className="h-5 w-5" />
                <span className="text-sm font-medium">Criar database</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {createOpen ? (
        <CreateDatabasePopover
          anchorEl={headerButtonRef.current}
          databases={databases.map((db) => ({
            id: db.id,
            name: db.name,
            icon: db.icon,
          }))}
          onCancel={closeCreate}
          onConfirm={handleConfirmCreate}
        />
      ) : null}
    </div>
  );
}

interface DatabaseCardProps {
  database: DatabaseSummary;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

/** Card individual de um database. O card inteiro é clicável para abrir;
 *  a ação de excluir aparece no hover, no canto superior direito. */
function DatabaseCard({ database, onOpen, onDelete }: DatabaseCardProps) {
  const Icon = databaseIcon(database.icon);
  return (
    <div
      className={cn(
        "group relative flex min-h-[80px] flex-col overflow-hidden rounded-lg border bg-card text-left shadow-sm transition-colors",
        "hover:border-primary/50 hover:bg-accent/40",
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(database.id)}
        className="flex flex-1 flex-col gap-3 p-4 text-left"
        title={database.name}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-md bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </span>
          <span className="min-w-0 flex-1 pr-6">
            <span className="block truncate text-sm font-semibold group-hover:underline">
              {database.name}
            </span>
          </span>
        </div>
      </button>

      <button
        type="button"
        onClick={() => onDelete(database.id)}
        aria-label={`Excluir ${database.name}`}
        title="Excluir database"
        className="absolute top-3 right-3 flex h-[30px] w-[30px] items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export interface CreateDatabasePopoverProps {
  /** Elemento ao qual o popover fica ancorado (o botão "Criar database"). */
  anchorEl: HTMLElement | null;
  /**
   * Databases existentes que podem ser **espelhados** (visão vinculada). Visões
   * vinculadas são excluídas da lista (não se espelha uma visão).
   */
  databases?: {
    id: string;
    name: string;
    icon: string | null;
    linkedDatabaseId?: string | null;
  }[];
  onCancel: () => void;
  onConfirm: (input: NewDatabaseInput) => void;
}

/**
 * Popover ancorado **logo abaixo** do botão informado, com o campo **nome** e um
 * **seletor de ícone** ao lado do input (estilo Notion), além dos botões
 * **Cancelar** e **Criar**. Renderizado em portal com `position: fixed`, para não
 * sofrer recorte de containers com `overflow`.
 */
export function CreateDatabasePopover({
  anchorEl,
  databases = [],
  onCancel,
  onConfirm,
}: CreateDatabasePopoverProps) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  /** Id do database escolhido para **espelhar** (visão vinculada, opcional). */
  const [linkedId, setLinkedId] = useState<string | null>(null);
  /** Seletor "Espelhar database…" está aberto. */
  const [linkedPickerOpen, setLinkedPickerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Posição (top/left) do popover, calculada ao abrir a partir do âncora. */
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Posiciona o popover abaixo do âncora, alinhado à esquerda, mantendo-o dentro
  // da viewport horizontalmente (encosta na borda quando não couber).
  useLayoutEffect(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const width = 320;
    const margin = 8;
    const left = Math.min(
      Math.max(margin, rect.left),
      Math.max(margin, window.innerWidth - width - margin),
    );
    const top = rect.bottom + 6;
    setPos({ top, left });
  }, [anchorEl]);

  // Foca o campo de nome assim que o popover é posicionado.
  useEffect(() => {
    if (pos) inputRef.current?.focus();
  }, [pos]);

  // Fecha com Esc: primeiro o seletor de espelho, depois o de ícone, depois o popover.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (linkedPickerOpen) setLinkedPickerOpen(false);
        else if (pickerOpen) setPickerOpen(false);
        else onCancel();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel, pickerOpen, linkedPickerOpen]);

  const ActiveIcon = databaseIcon(icon);
  /** Database escolhido para espelhar (para exibir o nome no botão). */
  const linkedSource = databases.find((db) => db.id === linkedId) ?? null;

  const submit = () =>
    onConfirm({
      name: name.trim() || "Novo database",
      icon,
      linkedDatabaseId: linkedId,
    });

  return createPortal(
    <div className="fixed inset-0 z-50" onClick={onCancel} role="presentation">
      <div
        className="absolute w-80 rounded-lg border bg-popover p-4 shadow-lg"
        style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Criar database"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label
            htmlFor="new-database-name"
            className="mb-1.5 block text-[11px] uppercase tracking-wide text-muted-foreground"
          >
            Nome do database
          </label>

          {/* Nome + seletor de ícone lado a lado */}
          <div className="relative flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={pickerOpen}
              title="Escolher ícone"
              aria-label="Escolher ícone"
              className="flex h-[30px] flex-none items-center gap-1 rounded-md border px-2 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ActiveIcon className="h-4 w-4" />
            </button>

            <Input
              id="new-database-name"
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Novo database"
              autoComplete="off"
            />

            {pickerOpen ? (
              <div
                className="absolute left-0 top-full z-10 mt-2 w-64 rounded-md border bg-popover p-2 shadow-md"
                role="menu"
              >
                <button
                  type="button"
                  onClick={() => {
                    setIcon(null);
                    setPickerOpen(false);
                  }}
                  className={cn(
                    "mb-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent",
                    !icon ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  <Table2 className="h-4 w-4" />
                  Padrão
                </button>
                <div className="grid grid-cols-6 gap-1">
                  {ICON_OPTIONS.map((option) => {
                    const OptionIcon = option.icon;
                    const isActive = icon === option.name;
                    return (
                      <button
                        key={option.name}
                        type="button"
                        title={option.name}
                        aria-label={option.name}
                        aria-pressed={isActive}
                        onClick={() => {
                          setIcon(option.name);
                          setPickerOpen(false);
                        }}
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded hover:bg-accent",
                          isActive
                            ? "bg-accent text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        <OptionIcon className="h-4 w-4" />
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          {/* Espelhar database: cria o novo database como uma **visão vinculada**
              do database escolhido (mesmas propriedades e itens, ao vivo). */}
          <div className="relative mt-3">
            <button
              type="button"
              onClick={() => {
                setLinkedPickerOpen((v) => !v);
                setPickerOpen(false);
              }}
              aria-haspopup="menu"
              aria-expanded={linkedPickerOpen}
              className={cn(
                "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-sm hover:bg-accent hover:text-foreground",
                linkedId ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <Link2 className="h-4 w-4 flex-none" />
              <span className="min-w-0 flex-1 truncate text-left">
                {linkedSource
                  ? `Espelhar ${linkedSource.name}`
                  : "Espelhar database…"}
              </span>
              <ChevronDown className="h-3.5 w-3.5 flex-none" />
            </button>

            {linkedPickerOpen ? (
              <div
                role="menu"
                aria-label="Escolher database para espelhar"
                className="absolute left-0 top-full z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
              >
                {linkedId ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setLinkedId(null);
                      setLinkedPickerOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5 flex-none" />
                    Sem vínculo
                  </button>
                ) : null}
                {databases.filter((db) => !db.linkedDatabaseId).length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">
                    Nenhum database.
                  </p>
                ) : (
                  databases
                    .filter((db) => !db.linkedDatabaseId)
                    .map((db) => {
                      const isActive = db.id === linkedId;
                      return (
                        <button
                          key={db.id}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setLinkedId(db.id);
                            setLinkedPickerOpen(false);
                            // Espelha também o **nome** da origem (se ainda vazio).
                            if (!name.trim()) setName(db.name);
                          }}
                          className={cn(
                            "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent",
                            isActive
                              ? "text-foreground"
                              : "text-muted-foreground",
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {db.name}
                          </span>
                          {isActive ? (
                            <Check className="ml-auto h-3.5 w-3.5 flex-none" />
                          ) : null}
                        </button>
                      );
                    })
                )}
              </div>
            ) : null}
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="submit" size="sm">
              Criar
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
