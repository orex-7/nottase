import { createClient } from "@/lib/supabase/client";
import type {
  CellValue,
  Column,
  Database,
  DbRow,
  PageTemplate,
  Project,
  ProjectCategory,
  Recurrence,
} from "@/types/database";

/* -------------------------------------------------------------------------- */
/* Linhas do banco (snake_case) e mapeadores para o domínio (camelCase)        */
/* -------------------------------------------------------------------------- */

interface DatabaseDbRow {
  id: string;
  name: string;
  icon: string | null;
  project_id: string | null;
  columns: Column[];
}

interface ProjectDbRow {
  id: string;
  name: string;
  category: string | null;
  color: string | null;
  position: number;
}

interface ProjectCategoryDbRow {
  id: string;
  name: string;
  color: string | null;
  position: number;
}

interface DatabaseRowsDbRow {
  id: string;
  database_id: string;
  values: Record<string, CellValue>;
  position: number;
}

interface DatabaseTemplateDbRow {
  id: string;
  database_id: string;
  name: string;
  content: string;
  recurrence: Recurrence | null;
  position: number;
}

function rowToDbRow(row: DatabaseRowsDbRow): DbRow {
  return { id: row.id, values: row.values ?? {} };
}

function rowToTemplate(row: DatabaseTemplateDbRow): PageTemplate {
  return {
    id: row.id,
    name: row.name,
    content: row.content,
    recurrence: row.recurrence ?? null,
  };
}

/**
 * Colunas padrão de um novo database.
 * Um database novo começa com uma única propriedade de texto ("Nome"),
 * e o usuário adiciona as demais conforme precisar.
 */
export const DEFAULT_COLUMNS: Column[] = [
  { id: "name", name: "Nome", type: "text" },
];

/** Cria o mapa de valores em branco para uma linha, conforme as colunas. */
export function emptyValuesFor(columns: Column[]): Record<string, CellValue> {
  const values: Record<string, CellValue> = {};
  for (const col of columns) {
    values[col.id] = col.type === "multi_select" ? [] : "";
  }
  return values;
}

/**
 * Busca todos os databases do usuário autenticado, já com linhas e modelos.
 * A RLS no Postgres garante o filtro por usuário.
 */
export async function fetchDatabases(): Promise<Database[]> {
  const supabase = createClient();

  const [databasesRes, rowsRes, templatesRes] = await Promise.all([
    supabase.from("databases").select("*").order("created_at", { ascending: true }),
    supabase
      .from("database_rows")
      .select("*")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("database_templates")
      .select("*")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (databasesRes.error) throw databasesRes.error;
  if (rowsRes.error) throw rowsRes.error;
  if (templatesRes.error) throw templatesRes.error;

  const rowsByDb = new Map<string, DbRow[]>();
  for (const r of (rowsRes.data as DatabaseRowsDbRow[]) ?? []) {
    const list = rowsByDb.get(r.database_id) ?? [];
    list.push(rowToDbRow(r));
    rowsByDb.set(r.database_id, list);
  }

  const templatesByDb = new Map<string, PageTemplate[]>();
  for (const t of (templatesRes.data as DatabaseTemplateDbRow[]) ?? []) {
    const list = templatesByDb.get(t.database_id) ?? [];
    list.push(rowToTemplate(t));
    templatesByDb.set(t.database_id, list);
  }

  return ((databasesRes.data as DatabaseDbRow[]) ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    icon: d.icon ?? null,
    projectId: d.project_id ?? null,
    columns: d.columns ?? [],
    rows: rowsByDb.get(d.id) ?? [],
    templates: templatesByDb.get(d.id) ?? [],
  }));
}

/**
 * Busca um único database (com linhas e modelos) pelo id. A RLS garante que
 * apenas o dono consiga lê-lo. Retorna `null` se não existir.
 */
export async function fetchDatabaseById(id: string): Promise<Database | null> {
  const supabase = createClient();

  const [databaseRes, rowsRes, templatesRes] = await Promise.all([
    supabase.from("databases").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("database_rows")
      .select("*")
      .eq("database_id", id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("database_templates")
      .select("*")
      .eq("database_id", id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (databaseRes.error) throw databaseRes.error;
  if (rowsRes.error) throw rowsRes.error;
  if (templatesRes.error) throw templatesRes.error;

  const d = databaseRes.data as DatabaseDbRow | null;
  if (!d) return null;

  return {
    id: d.id,
    name: d.name,
    icon: d.icon ?? null,
    projectId: d.project_id ?? null,
    columns: d.columns ?? [],
    rows: ((rowsRes.data as DatabaseRowsDbRow[]) ?? []).map(rowToDbRow),
    templates: ((templatesRes.data as DatabaseTemplateDbRow[]) ?? []).map(
      rowToTemplate,
    ),
  };
}

/**
 * Cria um database com as colunas padrão e uma linha em branco inicial.
 * Quando `projectId` é informado, o database é vinculado a esse projeto.
 * Retorna o database completo já montado.
 */
export async function createDatabase(
  name: string,
  icon: string | null = null,
  projectId: string | null = null,
): Promise<Database> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not-authenticated");

  const columns = DEFAULT_COLUMNS.map((c) => ({ ...c }));

  const { data: db, error: dbError } = await supabase
    .from("databases")
    .insert({ user_id: user.id, name, icon, columns, project_id: projectId })
    .select("*")
    .single();
  if (dbError) throw dbError;

  const { data: row, error: rowError } = await supabase
    .from("database_rows")
    .insert({
      database_id: (db as DatabaseDbRow).id,
      user_id: user.id,
      values: emptyValuesFor(columns),
      position: 0,
    })
    .select("*")
    .single();
  if (rowError) throw rowError;

  return {
    id: (db as DatabaseDbRow).id,
    name: (db as DatabaseDbRow).name,
    icon: (db as DatabaseDbRow).icon ?? null,
    projectId: (db as DatabaseDbRow).project_id ?? null,
    columns,
    rows: [rowToDbRow(row as DatabaseRowsDbRow)],
    templates: [],
  };
}

/** Remove um database (linhas e modelos são removidos em cascata). */
export async function deleteDatabase(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("databases").delete().eq("id", id);
  if (error) throw error;
}

/** Renomeia um database. */
export async function updateDatabaseName(id: string, name: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("databases").update({ name }).eq("id", id);
  if (error) throw error;
}

/** Define (ou limpa, com `null`) o ícone escolhido de um database. */
export async function updateDatabaseIcon(
  id: string,
  icon: string | null,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("databases").update({ icon }).eq("id", id);
  if (error) throw error;
}

/** Substitui a definição de colunas de um database. */
export async function updateDatabaseColumns(
  id: string,
  columns: Column[],
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("databases")
    .update({ columns })
    .eq("id", id);
  if (error) throw error;
}

/* -------------------------------------------------------------------------- */
/* Projetos                                                                    */
/* -------------------------------------------------------------------------- */

/** Busca todos os projetos do usuário autenticado (RLS filtra por dono). */
export async function fetchProjects(): Promise<Project[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data as ProjectDbRow[]) ?? []).map(projectRowToProject);
}

/** Mapeia uma linha do banco (snake_case) para o domínio (camelCase). */
function projectRowToProject(row: ProjectDbRow): Project {
  return {
    id: row.id,
    name: row.name,
    category: row.category ?? null,
    color: row.color ?? null,
    position: row.position ?? 0,
  };
}

/** Nome do projeto padrão usado quando um database é criado sem projeto. */
export const DEFAULT_PROJECT_NAME = "Geral";

/**
 * Categorias sugeridas para classificar um projeto. O usuário pode digitar
 * uma categoria livre, mas estas cobrem os casos mais comuns (estilo Notion).
 * Cada categoria tem uma **cor padrão**, aplicada ao ser escolhida.
 */
export const PROJECT_CATEGORIES = [
  "Pessoal",
  "Trabalho",
  "Estudos",
  "Finanças",
  "Saúde",
  "Ideias",
] as const;

/**
 * Paleta de cores do marcador **da categoria** do projeto. Cada item tem um
 * rótulo legível e a classe de cor do chip (mesmo estilo dos chips de opções
 * do database).
 */
export const PROJECT_COLORS: { label: string; color: string }[] = [
  { label: "Cinza", color: "bg-slate-500" },
  { label: "Azul", color: "bg-blue-500" },
  { label: "Verde", color: "bg-emerald-500" },
  { label: "Vermelho", color: "bg-red-500" },
  { label: "Roxo", color: "bg-purple-500" },
  { label: "Ciano", color: "bg-cyan-500" },
  { label: "Laranja", color: "bg-orange-500" },
  { label: "Rosa", color: "bg-pink-500" },
  { label: "Amarelo", color: "bg-yellow-500" },
  { label: "Verde-água", color: "bg-teal-500" },
];

/** Cor padrão do marcador quando o projeto/categoria não tem cor definida. */
export const DEFAULT_PROJECT_COLOR = "bg-slate-500";

/**
 * Cor padrão sugerida para cada categoria conhecida. Usada para preencher a cor
 * automaticamente quando o usuário escolhe uma das categorias sugeridas.
 */
export const PROJECT_CATEGORY_DEFAULT_COLORS: Record<string, string> = {
  Pessoal: "bg-emerald-500",
  Trabalho: "bg-blue-500",
  Estudos: "bg-purple-500",
  "Finanças": "bg-teal-500",
  "Saúde": "bg-red-500",
  Ideias: "bg-yellow-500",
};

/** Devolve a cor padrão de uma categoria (ou a cor padrão geral). */
export function defaultColorForCategory(category: string): string {
  return PROJECT_CATEGORY_DEFAULT_COLORS[category] ?? DEFAULT_PROJECT_COLOR;
}

/**
 * Garante a existência do projeto padrão ("Geral") e retorna o seu id.
 * Usado quando um database precisa ser criado sem um projeto explícito (ex.:
 * criação a partir da sidebar do calendário), evitando databases "órfãos".
 */
export async function ensureDefaultProject(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not-authenticated");

  const { data: existing, error: selectError } = await supabase
    .from("projects")
    .select("*")
    .eq("name", DEFAULT_PROJECT_NAME)
    .limit(1)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return (existing as ProjectDbRow).id;

  const { data, error } = await supabase
    .from("projects")
    .insert({ user_id: user.id, name: DEFAULT_PROJECT_NAME })
    .select("*")
    .single();
  if (error) throw error;
  return (data as ProjectDbRow).id;
}

/** Cria um projeto e devolve o registro criado. */
export async function createProject(
  name: string,
  category: string | null = null,
  color: string | null = null,
): Promise<Project> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not-authenticated");

  // Novo projeto entra na **última** posição da sidebar (maior `position` + 1).
  const { data: current } = await supabase
    .from("projects")
    .select("position");
  const nextPosition =
    ((current as { position: number }[] | null) ?? []).reduce(
      (max, p) => Math.max(max, p.position ?? 0),
      -1,
    ) + 1;

  const { data, error } = await supabase
    .from("projects")
    .insert({ user_id: user.id, name, category, color, position: nextPosition })
    .select("*")
    .single();
  if (error) throw error;
  return projectRowToProject(data as ProjectDbRow);
}

/** Remove um projeto (os databases vinculados são removidos em cascata). */
export async function deleteProject(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
}

/** Renomeia um projeto. */
export async function updateProjectName(id: string, name: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("projects").update({ name }).eq("id", id);
  if (error) throw error;
}

/** Atualiza categoria e/ou cor de um projeto. */
export async function updateProject(
  id: string,
  patch: { category?: string | null; color?: string | null },
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("projects").update(patch).eq("id", id);
  if (error) throw error;
}

/**
 * Persiste a nova **ordem** dos projetos: grava `position` = índice de cada id
 * recebido. Chamada ao soltar um arraste (drag & drop) na sidebar. As escritas
 * rodam em paralelo.
 */
export async function reorderProjects(orderedIds: string[]): Promise<void> {
  if (orderedIds.length === 0) return;
  const supabase = createClient();
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from("projects").update({ position: index }).eq("id", id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}

/* -------------------------------------------------------------------------- */
/* Categorias de projetos                                                      */
/* -------------------------------------------------------------------------- */

/** Mapeia uma linha do banco (snake_case) para o domínio (camelCase). */
function projectCategoryRowToCategory(
  row: ProjectCategoryDbRow,
): ProjectCategory {
  return {
    id: row.id,
    name: row.name,
    color: row.color ?? null,
    position: row.position ?? 0,
  };
}

/**
 * Busca as categorias de projetos do usuário autenticado, já ordenadas por
 * `position` (a ordem exibida no seletor do popover "Novo projeto").
 */
export async function fetchProjectCategories(): Promise<ProjectCategory[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("project_categories")
    .select("*")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data as ProjectCategoryDbRow[]) ?? []).map(
    projectCategoryRowToCategory,
  );
}

/**
 * Cria uma categoria de projetos (se ainda não existir) na **última** posição e
 * devolve a lista atualizada. Se a categoria já existir, devolve a lista atual
 * sem criar duplicata (a unicidade é garantida no banco por `user_id, name`).
 */
export async function createProjectCategory(
  name: string,
  color: string | null = null,
): Promise<ProjectCategory[]> {
  const trimmed = name.trim();
  if (!trimmed) return fetchProjectCategories();

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not-authenticated");

  const current = await fetchProjectCategories();
  if (current.some((c) => c.name === trimmed)) return current;

  const nextPosition = current.reduce(
    (max, c) => Math.max(max, c.position),
    -1,
  ) + 1;

  const { error } = await supabase.from("project_categories").insert({
    user_id: user.id,
    name: trimmed,
    color,
    position: nextPosition,
  });
  if (error) throw error;
  return fetchProjectCategories();
}

/**
 * Persiste a nova **ordem** das categorias: grava `position` = índice de cada
 * nome recebido. Chamada ao soltar um arraste (drag & drop) no popover. As
 * escritas rodam em paralelo; a lista é devolvida reordenada localmente.
 */
export async function reorderProjectCategories(
  orderedNames: string[],
): Promise<void> {
  if (orderedNames.length === 0) return;
  const supabase = createClient();
  const results = await Promise.all(
    orderedNames.map((name, index) =>
      supabase
        .from("project_categories")
        .update({ position: index })
        .eq("name", name),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}

/**
 * Renomeia uma categoria de projetos **e/ou** atualiza a sua cor. Como os
 * projetos guardam o nome da categoria (não o id), renomear também propaga o
 * novo nome para os projetos que a usavam — assim os chips e marcadores
 * continuam consistentes. A lista atualizada é devolvida.
 */
export async function updateProjectCategory(
  id: string,
  patch: { name?: string; color?: string | null },
): Promise<ProjectCategory[]> {
  const supabase = createClient();
  const current = await fetchProjectCategories();
  const target = current.find((c) => c.id === id);
  if (!target) return current;

  const nextName = patch.name?.trim() ?? target.name;
  if (!nextName) return current;

  const renaming = nextName !== target.name;
  if (renaming && current.some((c) => c.name === nextName)) {
    throw new Error("Já existe uma categoria com esse nome");
  }

  // Monta o patch só com os campos informados (nome e/ou cor).
  const update: { name?: string; color?: string | null } = {};
  if (renaming) update.name = nextName;
  if (patch.color !== undefined) update.color = patch.color;

  if (Object.keys(update).length > 0) {
    const { error } = await supabase
      .from("project_categories")
      .update(update)
      .eq("id", id);
    if (error) throw error;
  }

  // Renomear a categoria precisa refletir nos projetos que a referenciavam.
  if (renaming) {
    const { error } = await supabase
      .from("projects")
      .update({ category: nextName })
      .eq("category", target.name);
    if (error) throw error;
  }

  return fetchProjectCategories();
}

/**
 * Exclui uma categoria de projetos. Os projetos que a usavam passam a ficar
 * **sem categoria** (a coluna é um texto simples, então não há cascata no banco)
 * — evitando chips apontando para uma categoria inexistente. A lista atualizada
 * é devolvida.
 */
export async function deleteProjectCategory(
  id: string,
): Promise<ProjectCategory[]> {
  const supabase = createClient();
  const current = await fetchProjectCategories();
  const target = current.find((c) => c.id === id);
  if (!target) return current;

  const { error } = await supabase
    .from("project_categories")
    .delete()
    .eq("id", id);
  if (error) throw error;

  const { error: clearError } = await supabase
    .from("projects")
    .update({ category: null })
    .eq("category", target.name);
  if (clearError) throw clearError;

  return fetchProjectCategories();
}

/* -------------------------------------------------------------------------- */
/* Linhas                                                                      */
/* -------------------------------------------------------------------------- */

/** Insere uma nova linha em um database. */
export async function createRow(
  databaseId: string,
  values: Record<string, CellValue>,
  position: number,
): Promise<DbRow> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not-authenticated");

  const { data, error } = await supabase
    .from("database_rows")
    .insert({ database_id: databaseId, user_id: user.id, values, position })
    .select("*")
    .single();
  if (error) throw error;
  return rowToDbRow(data as DatabaseRowsDbRow);
}

/** Atualiza o mapa de valores de uma linha. */
export async function updateRowValues(
  rowId: string,
  values: Record<string, CellValue>,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("database_rows")
    .update({ values })
    .eq("id", rowId);
  if (error) throw error;
}

/** Remove uma linha. */
export async function deleteRow(rowId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("database_rows").delete().eq("id", rowId);
  if (error) throw error;
}

/**
 * Reordena linhas gravando a nova `position` de cada uma. Recebe os pares
 * (id, position) já normalizados pelo chamador. Roda em paralelo e é
 * best-effort: qualquer falha propaga para o fluxo de persistência reverter.
 */
export async function updateRowPositions(
  updates: { id: string; position: number }[],
): Promise<void> {
  if (updates.length === 0) return;
  const supabase = createClient();
  const results = await Promise.all(
    updates.map(({ id, position }) =>
      supabase.from("database_rows").update({ position }).eq("id", id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}

/* -------------------------------------------------------------------------- */
/* Modelos de página                                                           */
/* -------------------------------------------------------------------------- */

/** Insere um novo modelo de página em um database. */
export async function createTemplate(
  databaseId: string,
  name: string,
  content: string,
  recurrence: Recurrence | null,
  position: number,
): Promise<PageTemplate> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not-authenticated");

  const { data, error } = await supabase
    .from("database_templates")
    .insert({
      database_id: databaseId,
      user_id: user.id,
      name,
      content,
      recurrence,
      position,
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToTemplate(data as DatabaseTemplateDbRow);
}

/** Remove um modelo de página. */
export async function deleteTemplate(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("database_templates")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

/**
 * Atualiza apenas a configuração de recorrência de um modelo. Usada pela
 * geração automática para gravar a última data gerada (`lastGenerated`) e, ao
 * editar o modelo, para registrar/ajustar a regra (incl. horário e início).
 */
export async function updateTemplateRecurrence(
  id: string,
  recurrence: Recurrence | null,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("database_templates")
    .update({ recurrence })
    .eq("id", id);
  if (error) throw error;
}


