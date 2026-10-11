"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Database, Plus, Table2, Trash2 } from "lucide-react";

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
}

/** Dados informados no popover de criação de database. */
export interface NewDatabaseInput {
  name: string;
  icon: string | null;
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

          <Button ref={headerButtonRef} size="sm" onClick={openCreate}>
            <Plus />
            Criar database
          </Button>
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
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {databases.map((db) => (
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
        className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export interface CreateDatabasePopoverProps {
  /** Elemento ao qual o popover fica ancorado (o botão "Criar database"). */
  anchorEl: HTMLElement | null;
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
  onCancel,
  onConfirm,
}: CreateDatabasePopoverProps) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
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

  // Fecha com Esc: primeiro o seletor de ícone, depois o popover inteiro.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (pickerOpen) setPickerOpen(false);
        else onCancel();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel, pickerOpen]);

  const ActiveIcon = databaseIcon(icon);

  const submit = () => onConfirm({ name: name.trim() || "Novo database", icon });

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
              className="flex h-9 flex-none items-center gap-1 rounded-md border px-2 text-muted-foreground hover:bg-accent hover:text-foreground"
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
