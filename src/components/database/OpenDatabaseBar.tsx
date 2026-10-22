"use client";

import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { databaseIcon } from "@/lib/database-icons";
import { DatabasePickerPopover } from "@/components/database/DatabasePickerPopover";
import type { Database } from "@/types/database";

export interface OpenDatabaseBarProps {
  /** Id do database aberto (aba ativa). `null` = nenhum. */
  currentDatabaseId: string | null;
  /** Todos os databases do Workspace (resolução das abas e lista do seletor). */
  databases: Database[];
  /** Projetos (contexto exibido no seletor). */
  projects: { id: string; name: string }[];
  /** Databases abertos, na **ordem fixa** das abas (inclui o ativo). */
  openDatabaseIds: string[];
  /** Coloca um database nas abas (escolhido no seletor do "+"). */
  onSelectDatabase: (id: string) => void;
  /** Abre um database já nas abas (clique na aba). */
  onOpenDatabase: (id: string) => void;
  /** Fecha a aba do database (não o exclui). */
  onCloseDatabase: (id: string) => void;
}

/**
 * Faixa acima da barra de título da tabela com as **abas** dos databases abertos
 * (ordem fixa; a aba ativa fica destacada) e o botão "+", que abre o seletor de
 * databases do Workspace.
 *
 * A posição das abas nunca muda: clicar em uma aba só troca qual database está
 * aberto, e escolher um database no seletor acrescenta uma aba ao final.
 */
export function OpenDatabaseBar({
  currentDatabaseId,
  databases,
  projects,
  openDatabaseIds,
  onSelectDatabase,
  onOpenDatabase,
  onCloseDatabase,
}: OpenDatabaseBarProps) {
  /** Elemento de referência do seletor (a própria faixa); `null` = fechado. */
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Abas na ordem salva; um database excluído some sozinho da faixa.
  const tabs = openDatabaseIds
    .map((id) => databases.find((d) => d.id === id))
    .filter((d): d is Database => Boolean(d));

  return (
    <div
      ref={barRef}
      className="flex h-7 shrink-0 items-stretch gap-2 border-b bg-card px-4"
    >
      <div
        className="no-scrollbar flex min-w-0 items-stretch overflow-x-auto"
        role="group"
        aria-label="Databases abertos"
      >
        {tabs.map((db) => {
          const isActive = db.id === currentDatabaseId;
          const TabIcon = databaseIcon(db.icon);
          return (
            <div
              key={db.id}
              className={cn(
                "group flex max-w-[14rem] flex-none items-stretch",
                isActive
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <button
                type="button"
                onClick={() => onOpenDatabase(db.id)}
                title={db.name}
                aria-current={isActive ? "true" : undefined}
                className="flex min-w-0 items-center gap-1 pl-3 pr-1 text-xs"
              >
                <TabIcon className="h-3.5 w-3.5 flex-none" />
                <span className="min-w-0 truncate">{db.name}</span>
              </button>
              <button
                type="button"
                onClick={() => onCloseDatabase(db.id)}
                aria-label={`Fechar ${db.name}`}
                title={`Fechar ${db.name}`}
                className="flex w-6 flex-none items-center justify-center opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 flex-none self-center"
        aria-label="Abrir outro database"
        title="Abrir outro database"
        onClick={() => setAnchor(barRef.current)}
      >
        <Plus className="h-4 w-4" />
      </Button>

      {anchor ? (
        <DatabasePickerPopover
          anchorEl={anchor}
          databases={databases}
          projects={projects}
          currentDatabaseId={currentDatabaseId}
          onSelect={(id) => {
            setAnchor(null);
            onSelectDatabase(id);
          }}
          onClose={() => setAnchor(null)}
        />
      ) : null}
    </div>
  );
}
