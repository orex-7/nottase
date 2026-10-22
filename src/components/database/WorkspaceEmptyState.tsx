"use client";

import { useCallback, useState } from "react";
import { Database, FolderKanban, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  CreateDatabasePopover,
  type NewDatabaseInput,
} from "@/components/database/DatabasesScreen";
import {
  CreateProjectPopover,
  type NewProjectInput,
} from "@/components/database/ProjectsScreen";
import type {
  Database as DatabaseModel,
  ProjectCategory,
} from "@/types/database";

/**
 * Cartão de boas-vindas da área principal do Workspace.
 *
 * Cobre dois vazios:
 * - `"no-projects"`: conta nova, sem nenhum projeto (antes a área principal
 *   ficava em branco). Oferece criar o primeiro projeto ou já criar um database
 *   (que garante o projeto padrão "Geral").
 * - `"no-database"`: projeto ativo **sem nenhum** database. Oferece criar o
 *   primeiro database do projeto. Quando o projeto já tem databases, o
 *   `DatabaseView` abre o primeiro automaticamente e este cartão não aparece.
 *
 * Não cria nenhum dado por conta própria: apenas abre os popovers existentes e
 * repassa a confirmação aos callbacks do `DatabaseView`.
 */
export interface WorkspaceEmptyStateProps {
  /** Nome do usuário (a saudação usa apenas o primeiro nome). Opcional. */
  userName?: string;
  variant: "no-projects" | "no-database";
  /** Categorias do usuário, para o popover de criação de projeto. */
  categories: ProjectCategory[];
  /** Databases existentes (opção "Espelhar database…" do popover de database). */
  databases: DatabaseModel[];
  /** Nome do projeto ativo (só na variante `no-database`). */
  projectName?: string;
  /** Cria um projeto e entra nele. */
  onCreateProject: (input: NewProjectInput) => void;
  /** Persiste uma categoria criada no popover (idempotente). */
  onCreateCategory: (name: string) => void;
  /** Cria um database (no projeto ativo; sem projeto, garante o "Geral"). */
  onCreateDatabase: (input: NewDatabaseInput) => void;
}

export function WorkspaceEmptyState({
  userName,
  variant,
  categories,
  databases,
  projectName,
  onCreateProject,
  onCreateCategory,
  onCreateDatabase,
}: WorkspaceEmptyStateProps) {
  const [projectAnchor, setProjectAnchor] = useState<HTMLElement | null>(null);
  const [databaseAnchor, setDatabaseAnchor] = useState<HTMLElement | null>(null);

  const noProjects = variant === "no-projects";
  // Saudação com o primeiro nome; sem nome, cai no título genérico (evita um
  // "Bem-vindo, " solto).
  const firstName = userName?.trim().split(/\s+/)[0] ?? "";

  const handleConfirmProject = useCallback(
    (input: NewProjectInput) => {
      onCreateProject(input);
      setProjectAnchor(null);
    },
    [onCreateProject],
  );

  const handleConfirmDatabase = useCallback(
    (input: NewDatabaseInput) => {
      onCreateDatabase(input);
      setDatabaseAnchor(null);
    },
    [onCreateDatabase],
  );

  const Icon = noProjects ? FolderKanban : Database;
  const title = noProjects
    ? firstName
      ? `Bem-vindo, ${firstName}`
      : "Bem-vindo ao seu Workspace"
    : "Nenhum database ainda";
  const description = noProjects
    ? "Organize seus itens em databases dentro de projetos. Crie seu primeiro projeto ou comece por um database."
    : projectName
      ? `Crie o primeiro database de "${projectName}" para começar a organizar seus itens.`
      : "Crie seu primeiro database para começar a organizar seus itens.";

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </span>
        <div className="space-y-1">
          <h2 className="text-sm font-medium">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {noProjects ? (
            <Button size="sm" onClick={(e) => setProjectAnchor(e.currentTarget)}>
              <Plus />
              Criar meu primeiro projeto
            </Button>
          ) : null}
          <Button
            variant={noProjects ? "outline" : "default"}
            size="sm"
            onClick={(e) => setDatabaseAnchor(e.currentTarget)}
          >
            <Plus />
            Criar database
          </Button>
        </div>
      </div>

      {projectAnchor ? (
        <CreateProjectPopover
          anchorEl={projectAnchor}
          categories={categories}
          onCancel={() => setProjectAnchor(null)}
          onCreateCategory={onCreateCategory}
          onConfirm={handleConfirmProject}
        />
      ) : null}

      {databaseAnchor ? (
        <CreateDatabasePopover
          anchorEl={databaseAnchor}
          placement="anchor"
          databases={databases.map((db) => ({
            id: db.id,
            name: db.name,
            icon: db.icon,
            linkedDatabaseId: db.linkedDatabaseId ?? null,
          }))}
          onCancel={() => setDatabaseAnchor(null)}
          onConfirm={handleConfirmDatabase}
        />
      ) : null}
    </div>
  );
}
