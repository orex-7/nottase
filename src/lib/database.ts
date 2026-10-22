import { createClient } from "@/lib/supabase/client";
import type {
  CalcFunction,
  CellValue,
  Column,
  ColumnType,
  Database,
  DbRow,
  PageTemplate,
  Project,
  ProjectCategory,
  Recurrence,
  RelationLimit,
  RollupFunction,
} from "@/types/database";

/* -------------------------------------------------------------------------- */
/* Linhas do banco (snake_case) e mapeadores para o domínio (camelCase)        */
/* -------------------------------------------------------------------------- */

interface DatabaseDbRow {
  id: string;
  name: string;
  icon: string | null;
  project_id: string | null;
  /** Visão vinculada: database de origem (null = database próprio). */
  linked_database_id?: string | null;
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
  return { id: row.id, values: row.values ?? {}, position: row.position };
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
    // Relação (vínculos em `relation_links`) e rollup (calculado) não são mais
    // gravados em `values` — começam vazios.
    values[col.id] = col.type === "multi_select" ? [] : "";
  }
  return values;
}

/**
 * Gera um id de linha no cliente (uuid v4). Necessário ao **duplicar** um
 * database: como os vínculos de relação são remapeados para os ids novos, o
 * cliente precisa conhecer o id de cada linha copiada de antemão.
 */
function newRowId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Busca todos os databases do usuário autenticado (metadados + colunas +
 * modelos). As **linhas não vêm aqui**: a Tabela pagina por cursor
 * (`fetchDatabaseRowsPage`) e Kanban/Gráfico/Calendário carregam o conjunto
 * completo sob demanda (`fetchAllDatabaseRows`). A RLS filtra por usuário.
 */
export async function fetchDatabases(): Promise<Database[]> {
  const supabase = createClient();

  const [databasesRes, templatesRes] = await Promise.all([
    supabase.from("databases").select("*").order("created_at", { ascending: true }),
    supabase
      .from("database_templates")
      .select("*")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (databasesRes.error) throw databasesRes.error;
  if (templatesRes.error) throw templatesRes.error;

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
    linkedDatabaseId: d.linked_database_id ?? null,
    columns: d.columns ?? [],
    rows: [],
    templates: templatesByDb.get(d.id) ?? [],
  }));
}

/**
 * Busca um único database (com linhas e modelos) pelo id. A RLS garante que
 * apenas o dono consiga lê-lo. Retorna `null` se não existir.
 */
export async function fetchDatabaseById(id: string): Promise<Database | null> {
  const supabase = createClient();

  const [databaseRes, templatesRes] = await Promise.all([
    supabase.from("databases").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("database_templates")
      .select("*")
      .eq("database_id", id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (databaseRes.error) throw databaseRes.error;
  if (templatesRes.error) throw templatesRes.error;

  const d = databaseRes.data as DatabaseDbRow | null;
  if (!d) return null;

  return {
    id: d.id,
    name: d.name,
    icon: d.icon ?? null,
    projectId: d.project_id ?? null,
    linkedDatabaseId: d.linked_database_id ?? null,
    columns: d.columns ?? [],
    // Linhas não vêm aqui (a Tabela pagina; as visões carregam sob demanda).
    rows: [],
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
    linkedDatabaseId: null,
    columns,
    rows: [rowToDbRow(row as DatabaseRowsDbRow)],
    templates: [],
  };
}

/**
 * Cria um database **vinculado** a outro (visão ao vivo): sem colunas nem linhas
 * próprias, ele exibe as mesmas propriedades e itens do database de origem
 * (`linked_database_id`). Não cria linha inicial — as linhas vêm da origem.
 */
export async function createLinkedDatabase(
  sourceId: string,
  name: string,
  icon: string | null = null,
  projectId: string | null = null,
): Promise<Database> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not-authenticated");

  const { data: db, error } = await supabase
    .from("databases")
    .insert({
      user_id: user.id,
      name,
      icon,
      columns: [],
      project_id: projectId,
      linked_database_id: sourceId,
    })
    .select("*")
    .single();
  if (error) throw error;

  return {
    id: (db as DatabaseDbRow).id,
    name: (db as DatabaseDbRow).name,
    icon: (db as DatabaseDbRow).icon ?? null,
    projectId: (db as DatabaseDbRow).project_id ?? null,
    linkedDatabaseId: sourceId,
    columns: [],
    rows: [],
    templates: [],
  };
}

/** Tamanho do bloco de linhas copiadas em `duplicateDatabase`. */
const DUPLICATE_ROWS_CHUNK = 500;

/**
 * Cria um **novo database copiando** outro: mesmas propriedades (colunas) e as
 * mesmas linhas/valores, na mesma ordem. Os modelos de página **não** são
 * copiados.
 */
export async function duplicateDatabase(
  sourceId: string,
  name: string,
  icon: string | null = null,
  projectId: string | null = null,
): Promise<Database> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not-authenticated");

  const [sourceRes, sourceRows] = await Promise.all([
    supabase.from("databases").select("*").eq("id", sourceId).maybeSingle(),
    fetchAllDatabaseRows(sourceId),
  ]);
  if (sourceRes.error) throw sourceRes.error;

  const source = sourceRes.data as DatabaseDbRow | null;
  if (!source) throw new Error("Database de origem não encontrado.");

  const sourceColumns: Column[] = (source.columns ?? []).map((c) => ({ ...c }));
  const columns =
    sourceColumns.length > 0
      ? sourceColumns
      : DEFAULT_COLUMNS.map((c) => ({ ...c }));

  const { data: db, error: dbError } = await supabase
    .from("databases")
    .insert({
      user_id: user.id,
      name,
      icon,
      columns,
      project_id: projectId,
    })
    .select("*")
    .single();
  if (dbError) throw dbError;

  const newId = (db as DatabaseDbRow).id;
  /** Colunas de relação: os vínculos são copiados à parte (não via `values`). */
  const relationColumnIds = new Set(
    columns.filter((c) => c.type === "relation").map((c) => c.id),
  );
  const stripRelation = (
    values: Record<string, CellValue>,
  ): Record<string, CellValue> => {
    if (relationColumnIds.size === 0) return values;
    const next = { ...values };
    for (const id of relationColumnIds) delete next[id];
    return next;
  };
  /** Mapeia o id antigo de cada linha copiada para o id novo (p/ remapear vínculos). */
  const newRowIdByOld = new Map<string, string>();

  if (sourceRows.length > 0) {
    const payload = sourceRows.map((r) => {
      const rowId = newRowId();
      newRowIdByOld.set(r.id, rowId);
      return {
        id: rowId,
        database_id: newId,
        user_id: user.id,
        values: stripRelation(r.values ?? {}),
        position: r.position ?? 0,
      };
    });
    for (let i = 0; i < payload.length; i += DUPLICATE_ROWS_CHUNK) {
      const { error } = await supabase
        .from("database_rows")
        .insert(payload.slice(i, i + DUPLICATE_ROWS_CHUNK));
      if (error) throw error;
    }

    // Copia os vínculos das linhas copiadas: alvo interno remapeia para o id
    // novo; alvo externo mantém o mesmo id. Best-effort (não quebra a cópia).
    if (relationColumnIds.size > 0) {
      try {
        const links = await fetchRelationLinksForRows(sourceRows.map((r) => r.id));
        const linkPayload = links
          .filter((l) => newRowIdByOld.has(l.sourceItemId))
          .map((l) => ({
            user_id: user.id,
            property_id: l.propertyId,
            source_item_id: newRowIdByOld.get(l.sourceItemId) as string,
            target_item_id: newRowIdByOld.get(l.targetItemId) ?? l.targetItemId,
          }));
        for (let i = 0; i < linkPayload.length; i += DUPLICATE_ROWS_CHUNK) {
          const { error } = await supabase
            .from("relation_links")
            .insert(linkPayload.slice(i, i + DUPLICATE_ROWS_CHUNK));
          if (error) throw error;
        }
      } catch {
        /* a cópia das linhas segue válida mesmo se os vínculos falharem */
      }
    }
  } else {
    // Origem sem linhas: cria uma linha em branco, como um database novo.
    const { error } = await supabase.from("database_rows").insert({
      database_id: newId,
      user_id: user.id,
      values: emptyValuesFor(columns),
      position: 0,
    });
    if (error) throw error;
  }

  return {
    id: newId,
    name: (db as DatabaseDbRow).name,
    icon: (db as DatabaseDbRow).icon ?? null,
    projectId: (db as DatabaseDbRow).project_id ?? null,
    columns,
    // As linhas são paginadas pela Tabela (não vêm aqui).
    rows: [],
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
/* Navegação entre databases abertos (por usuário)                             */
/* -------------------------------------------------------------------------- */

/**
 * Navegação entre databases abertos na faixa acima da tabela: os databases
 * colocados ao lado (chips) e o database aberto no momento. Persistida por
 * usuário na tabela `workspace_open_databases` (uma linha por usuário).
 */
export interface OpenDatabasesState {
  /** Ids dos databases abertos (chips), na ordem de exibição. */
  ids: string[];
  /** Id do database aberto no momento (`null` = nenhum). */
  selectedId: string | null;
}

/** Estado vazio da navegação (usuário sem linha salva). */
export const EMPTY_OPEN_DATABASES: OpenDatabasesState = {
  ids: [],
  selectedId: null,
};

interface WorkspaceOpenDatabasesDbRow {
  database_ids: unknown;
  selected_id: string | null;
}

/**
 * Lê a navegação salva do usuário autenticado (a RLS limita à própria linha).
 * Sem linha salva (primeiro uso), devolve o estado vazio.
 */
export async function fetchOpenDatabases(): Promise<OpenDatabasesState> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("workspace_open_databases")
    .select("database_ids, selected_id")
    .maybeSingle();
  if (error) throw error;
  if (!data) return EMPTY_OPEN_DATABASES;

  const row = data as WorkspaceOpenDatabasesDbRow;
  const ids = Array.isArray(row.database_ids)
    ? row.database_ids.filter((id): id is string => typeof id === "string")
    : [];
  return { ids, selectedId: row.selected_id ?? null };
}

/**
 * Salva a navegação do usuário autenticado (upsert de uma linha por usuário).
 * É uma conveniência de UI: sobrescreve o estado anterior a cada mudança.
 */
export async function saveOpenDatabases(
  state: OpenDatabasesState,
): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not-authenticated");

  const { error } = await supabase.from("workspace_open_databases").upsert(
    {
      user_id: user.id,
      database_ids: state.ids,
      selected_id: state.selectedId,
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
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

/**
 * Grava **uma** célula fazendo merge no JSONB no servidor (RPC
 * `database_row_set_cell`). Não exige o mapa inteiro de `values` no cliente —
 * que, com a Tabela paginada, não está todo carregado.
 */
export async function updateRowCell(
  rowId: string,
  columnId: string,
  value: CellValue,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("database_row_set_cell", {
    p_row_id: rowId,
    p_column_id: columnId,
    p_value: value,
  });
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
/* Paginação por cursor (keyset) das linhas                                    */
/* -------------------------------------------------------------------------- */

/** Cursor de keyset: `(position, id)` da última linha carregada. */
export interface RowsCursor {
  position: number;
  id: string;
}

/**
 * Operador de filtro de uma propriedade. Os operadores `relation_*` são
 * resolvidos no servidor contra a tabela `relation_links` (a célula de relação
 * não vive mais em `values`).
 */
export type FilterOperator =
  | "is"
  | "is_not"
  | "is_empty"
  | "is_not_empty"
  | "relation_is"
  | "relation_is_not"
  | "relation_is_empty"
  | "relation_is_not_empty";

/** Filtro por propriedade aplicado no servidor. */
export interface RowsFilter {
  columnId: string;
  operator: FilterOperator;
  /** Valor comparado em `is`/`is_not` (id da opção, "true" para caixa, etc.). */
  value?: string;
}

/** Parâmetros de uma página de linhas. */
export interface RowsPageParams {
  cursor?: RowsCursor | null;
  limit?: number;
  search?: string;
  filters?: RowsFilter[];
}

/** Uma página de linhas + o cursor da próxima + se ainda há mais. */
export interface RowsPage {
  rows: DbRow[];
  nextCursor: RowsCursor | null;
  hasMore: boolean;
}

/** Tamanho padrão de página (bem abaixo do teto de 1000 do PostgREST). */
export const DEFAULT_ROWS_PAGE_SIZE = 300;

/**
 * Monta os argumentos da RPC `database_rows_page` (função pura, testável).
 * `p_search` vazio vira `null`; `p_checkbox` vazio vira `null`; `p_limit` é
 * limitado a 1..1000.
 */
export function buildRowsPageArgs(
  databaseId: string,
  params: RowsPageParams = {},
): {
  p_database_id: string;
  p_limit: number;
  p_cursor_position: number | null;
  p_cursor_id: string | null;
  p_search: string | null;
  p_filters: RowsFilter[] | null;
} {
  const limit = params.limit ?? DEFAULT_ROWS_PAGE_SIZE;
  const search = params.search?.trim() ?? "";
  const filters = params.filters ?? [];
  return {
    p_database_id: databaseId,
    p_limit: Math.min(Math.max(1, Math.floor(limit)), 1000),
    p_cursor_position: params.cursor ? params.cursor.position : null,
    p_cursor_id: params.cursor ? params.cursor.id : null,
    p_search: search ? search : null,
    p_filters: filters.length > 0 ? filters : null,
  };
}

/**
 * Constrói a página a partir da resposta crua da RPC (função pura, testável).
 * O cursor é o `(position, id)` da última linha — funciona mesmo com `position`
 * repetida, pois o `id` desempata. `hasMore` = a página veio cheia (o próximo
 * fetch confirma se há mais).
 */
export function toRowsPage(
  raw: { id: string; values: Record<string, CellValue>; position: number }[],
  limit: number,
): RowsPage {
  const last = raw[raw.length - 1];
  return {
    rows: raw.map((r) => ({
      id: r.id,
      values: r.values ?? {},
      position: r.position,
    })),
    nextCursor: last ? { position: last.position, id: last.id } : null,
    hasMore: raw.length >= limit,
  };
}

/**
 * Busca uma página de linhas de um database via keyset, com busca e filtros no
 * servidor (RPC `database_rows_page`, `security invoker` → a RLS continua valendo).
 */
export async function fetchDatabaseRowsPage(
  databaseId: string,
  params: RowsPageParams = {},
): Promise<RowsPage> {
  const supabase = createClient();
  const args = buildRowsPageArgs(databaseId, params);
  const { data, error } = await supabase.rpc("database_rows_page", args);
  if (error) throw error;
  return toRowsPage(
    (data as DatabaseRowsDbRow[] | null) ?? [],
    args.p_limit,
  );
}

/**
 * Busca TODAS as linhas de um database, em loop de páginas (o PostgREST limita
 * cada resposta a 1000). Usado pelas visões que precisam do conjunto completo
 * (Kanban/Gráfico), sob demanda.
 */
export async function fetchAllDatabaseRows(
  databaseId: string,
): Promise<DbRow[]> {
  const all: DbRow[] = [];
  let cursor: RowsCursor | null = null;
  // Trava de segurança contra loop infinito.
  for (let page = 0; page < 1000; page += 1) {
    const result = await fetchDatabaseRowsPage(databaseId, {
      cursor,
      limit: 1000,
    });
    all.push(...result.rows);
    if (!result.hasMore || !result.nextCursor) break;
    cursor = result.nextCursor;
  }
  return all;
}

/** Contagem de linhas por database (uma consulta para todos os databases). */
export async function countDatabaseRows(): Promise<Map<string, number>> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("database_row_counts");
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of (data as { database_id: string; total: number }[] | null) ?? []) {
    counts.set(row.database_id, Number(row.total));
  }
  return counts;
}

/**
 * Próxima `position` (fim da lista) de um database, calculada **no servidor**
 * (`max(position) + 1000`). Antes vinha de `rows.length` no cliente, o que com
 * paginação seria apenas o tamanho da página carregada.
 */
export async function nextRowPosition(databaseId: string): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("database_next_row_position", {
    p_database_id: databaseId,
  });
  if (error) throw error;
  return typeof data === "number" ? data : Number(data ?? 0);
}

/** Um resultado da busca global de itens: a linha + o database a que pertence. */
export interface RowSearchHit {
  databaseId: string;
  row: DbRow;
}

/** Nº padrão de resultados da busca global (o servidor também limita a 50). */
export const ROW_SEARCH_LIMIT = 10;

/**
 * Busca itens (linhas) em **todos** os databases do usuário (RPC
 * `database_rows_search`), por substring nos valores, usando o índice trigram.
 * A RLS limita ao dono. Termo vazio → nenhuma consulta. Nunca renderizar o
 * `values` como HTML (pode conter o conteúdo da página) — use só o título.
 */
export async function searchDatabaseRows(
  search: string,
  limit = ROW_SEARCH_LIMIT,
): Promise<RowSearchHit[]> {
  const term = search.trim();
  if (!term) return [];
  const supabase = createClient();
  const { data, error } = await supabase.rpc("database_rows_search", {
    p_search: term,
    p_limit: limit,
  });
  if (error) throw error;
  return ((data as DatabaseRowsDbRow[] | null) ?? []).map((row) => ({
    databaseId: row.database_id,
    row: rowToDbRow(row),
  }));
}

/** Busca uma única linha pelo id (usada pelo popover do calendário). */
export async function fetchRowById(rowId: string): Promise<DbRow | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("database_rows")
    .select("*")
    .eq("id", rowId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToDbRow(data as DatabaseRowsDbRow) : null;
}

/** Tamanho do bloco de ids por consulta em `fetchRowsByIds` (limite do `in`). */
export const ROWS_BY_IDS_CHUNK = 500;

/**
 * Busca várias linhas pelos ids (uma consulta por bloco de ~500, para não
 * estourar o `in` do PostgREST). Usado para resolver os títulos das linhas
 * referenciadas por uma coluna de relação. Ids inexistentes simplesmente ficam
 * de fora do mapa (o chamador trata como referência órfã).
 */
export async function fetchRowsByIds(ids: string[]): Promise<Map<string, DbRow>> {
  const result = new Map<string, DbRow>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return result;

  const supabase = createClient();
  for (let i = 0; i < unique.length; i += ROWS_BY_IDS_CHUNK) {
    const chunk = unique.slice(i, i + ROWS_BY_IDS_CHUNK);
    const { data, error } = await supabase
      .from("database_rows")
      .select("*")
      .in("id", chunk);
    if (error) throw error;
    for (const row of (data as DatabaseRowsDbRow[] | null) ?? []) {
      result.set(row.id, rowToDbRow(row));
    }
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/* Relação (junção) e Rollup                                                    */
/* -------------------------------------------------------------------------- */

/** Um vínculo de relação (linha de `relation_links`). */
export interface RelationLink {
  propertyId: string;
  sourceItemId: string;
  targetItemId: string;
}

interface RelationLinkDbRow {
  property_id: string;
  source_item_id: string;
  target_item_id: string;
}

/** Tamanho do bloco de ids por consulta (limite do `any`/`in`). */
export const RELATION_LINKS_CHUNK = 500;

/**
 * Cria/atualiza a configuração de uma propriedade de relação (RPC
 * `relation_property_create`). Quando bidirecional, cria o espelho no database
 * alvo e devolve o id dele (ou `null`). Idempotente.
 */
export async function createRelationProperty(params: {
  databaseId: string;
  columnId: string;
  name: string;
  relationDatabaseId: string;
  limit?: RelationLimit;
  bidirectional?: boolean;
  reverseColumnId?: string;
  reverseName?: string;
}): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("relation_property_create", {
    p_database_id: params.databaseId,
    p_column_id: params.columnId,
    p_name: params.name,
    p_relation_database_id: params.relationDatabaseId,
    p_limit: params.limit ?? "many",
    p_bidirectional: params.bidirectional ?? false,
    p_reverse_column_id: params.reverseColumnId ?? null,
    p_reverse_name: params.reverseName ?? null,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}

/** Atualiza o limite (um/vários) de uma relação (remove excedentes se "um"). */
export async function setRelationLimit(
  databaseId: string,
  columnId: string,
  limit: RelationLimit,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("relation_property_set_limit", {
    p_database_id: databaseId,
    p_column_id: columnId,
    p_limit: limit,
  });
  if (error) throw error;
}

/** Remove a propriedade de relação (coluna, vínculos e espelho). */
export async function deleteRelationProperty(
  databaseId: string,
  columnId: string,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("relation_property_delete", {
    p_database_id: databaseId,
    p_column_id: columnId,
  });
  if (error) throw error;
}

/** Adiciona um vínculo (e o espelho quando a relação é bidirecional). */
export async function addRelationLink(
  propertyId: string,
  sourceItemId: string,
  targetItemId: string,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("relation_link_add", {
    p_property_id: propertyId,
    p_source_item_id: sourceItemId,
    p_target_item_id: targetItemId,
  });
  if (error) throw error;
}

/** Remove um vínculo (e o espelho correspondente). */
export async function removeRelationLink(
  propertyId: string,
  sourceItemId: string,
  targetItemId: string,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("relation_link_remove", {
    p_property_id: propertyId,
    p_source_item_id: sourceItemId,
    p_target_item_id: targetItemId,
  });
  if (error) throw error;
}

/**
 * Busca em lote os vínculos das linhas informadas (RPC
 * `relation_links_for_rows`), em blocos de `RELATION_LINKS_CHUNK`.
 */
export async function fetchRelationLinksForRows(
  rowIds: string[],
): Promise<RelationLink[]> {
  const unique = [...new Set(rowIds.filter(Boolean))];
  if (unique.length === 0) return [];
  const supabase = createClient();
  const out: RelationLink[] = [];
  for (let i = 0; i < unique.length; i += RELATION_LINKS_CHUNK) {
    const chunk = unique.slice(i, i + RELATION_LINKS_CHUNK);
    const { data, error } = await supabase.rpc("relation_links_for_rows", {
      p_row_ids: chunk,
    });
    if (error) throw error;
    for (const l of (data as RelationLinkDbRow[] | null) ?? []) {
      out.push({
        propertyId: l.property_id,
        sourceItemId: l.source_item_id,
        targetItemId: l.target_item_id,
      });
    }
  }
  return out;
}

/** Requisição de um valor de rollup (uma coluna) para o RPC em lote. */
export interface RollupValueRequest {
  propertyId: string;
  relationPropertyId: string;
  targetPropertyId: string;
  fn: RollupFunction;
  /** Tipo da propriedade alvo (ajuda o SQL a decidir min/max numérico vs texto). */
  targetType?: ColumnType;
}

/** Tamanho do bloco de linhas por consulta em `fetchRollupValues`. */
export const ROLLUP_ROWS_CHUNK = 500;

/** Converte um `jsonb` do servidor em `CellValue` (string | string[]). */
function jsonToCell(value: unknown): CellValue {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === "string" ? v : String(v)));
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

/**
 * Calcula os rollups em lote para as linhas informadas (RPC
 * `rollup_values_for_rows`). Devolve um mapa chaveado por `${rowId}|${columnId}`.
 */
export async function fetchRollupValues(
  configs: RollupValueRequest[],
  rowIds: string[],
): Promise<Map<string, CellValue>> {
  const result = new Map<string, CellValue>();
  const unique = [...new Set(rowIds.filter(Boolean))];
  if (unique.length === 0 || configs.length === 0) return result;
  const supabase = createClient();
  const payload = configs.map((c) => ({
    propertyId: c.propertyId,
    relationPropertyId: c.relationPropertyId,
    targetPropertyId: c.targetPropertyId,
    fn: c.fn,
    targetType: c.targetType ?? "",
  }));
  for (let i = 0; i < unique.length; i += ROLLUP_ROWS_CHUNK) {
    const chunk = unique.slice(i, i + ROLLUP_ROWS_CHUNK);
    const { data, error } = await supabase.rpc("rollup_values_for_rows", {
      p_configs: payload,
      p_row_ids: chunk,
    });
    if (error) throw error;
    for (const row of (data as
      | { row_id: string; property_id: string; value: unknown }[]
      | null) ?? []) {
      result.set(`${row.row_id}|${row.property_id}`, jsonToCell(row.value));
    }
  }
  return result;
}

/** Requisição de um agregado de coluna (uma coluna) para o RPC em lote. */
export interface ColumnAggregateRequest {
  columnId: string;
  fn: CalcFunction;
}

/** Parâmetros de visão do agregado (mesmos da Tabela: busca + filtros). */
export interface ColumnAggregateParams {
  search?: string;
  filters?: RowsFilter[];
}

/**
 * Calcula, no servidor, os agregados de colunas numéricas (RPC
 * `database_column_aggregates`) sobre **todas** as linhas do database,
 * respeitando a busca e os filtros da visão ativa. Devolve um mapa por id de
 * coluna. Sem configs → não chama a RPC.
 */
export async function fetchColumnAggregates(
  databaseId: string,
  configs: ColumnAggregateRequest[],
  params: ColumnAggregateParams = {},
): Promise<Map<string, CellValue>> {
  const result = new Map<string, CellValue>();
  if (configs.length === 0) return result;
  const supabase = createClient();
  const search = params.search?.trim() ?? "";
  const filters = params.filters ?? [];
  const payload = configs.map((c) => ({ columnId: c.columnId, fn: c.fn }));
  const { data, error } = await supabase.rpc("database_column_aggregates", {
    p_database_id: databaseId,
    p_configs: payload,
    p_search: search ? search : null,
    p_filters: filters.length > 0 ? filters : null,
  });
  if (error) throw error;
  for (const row of (data as
    | { column_id: string; value: unknown }[]
    | null) ?? []) {
    result.set(row.column_id, jsonToCell(row.value));
  }
  return result;
}

/** Limpa espelhos (colunas + vínculos) que apontavam para um database excluído. */
export async function cleanupRelationsForDatabase(
  databaseId: string,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("relation_cleanup_for_database", {
    p_database_id: databaseId,
  });
  if (error) throw error;
}

/** Cria uma linha no **fim** do database (posição vinda do servidor). */
export async function createRowAtEnd(
  databaseId: string,
  values: Record<string, CellValue>,
): Promise<DbRow> {
  const position = await nextRowPosition(databaseId);
  return createRow(databaseId, values, position);
}

/** Atualiza a `position` de uma única linha (reordenação com dados parciais). */
export async function updateRowPosition(
  rowId: string,
  position: number,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("database_rows")
    .update({ position })
    .eq("id", rowId);
  if (error) throw error;
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


