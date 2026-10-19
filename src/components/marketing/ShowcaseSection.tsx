import { CheckCircle2, LayoutDashboard, PenSquare } from "lucide-react";

import { cn } from "@/lib/utils";

/** Mock do quadro kanban (drag-and-drop entre colunas). */
function KanbanMock() {
  const columns = [
    { title: "A fazer", color: "#94a3b8", cards: ["Planejar sprint", "Revisar metas"] },
    { title: "Em progresso", color: "#3b82f6", cards: ["Landing page"] },
    { title: "Concluído", color: "#22c55e", cards: ["Login Google", "Backup"] },
  ];
  return (
    <div className="rounded-xl border bg-muted/30 p-3 shadow-xl sm:p-4">
      <div className="grid grid-cols-3 gap-2">
        {columns.map((col) => (
          <div key={col.title} className="rounded-lg border bg-card p-2">
            <div className="mb-2 flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: col.color }}
              />
              <span className="truncate text-[11px] font-medium">{col.title}</span>
            </div>
            <div className="space-y-1.5">
              {col.cards.map((card) => (
                <div
                  key={card}
                  className="truncate rounded border bg-background px-2 py-1.5 text-[10px] text-muted-foreground"
                >
                  {card}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Mock do editor de páginas (estilo Notion). */
function EditorMock() {
  return (
    <div className="rounded-xl border bg-muted/30 p-3 shadow-xl sm:p-4">
      <div className="rounded-lg border bg-card p-4">
        <div className="mb-3 h-5 w-1/2 rounded bg-muted" />
        <div className="space-y-2">
          <div className="h-2.5 w-full rounded bg-muted/70" />
          <div className="h-2.5 w-11/12 rounded bg-muted/70" />
          <div className="h-2.5 w-3/4 rounded bg-muted/70" />
        </div>
        <div className="mt-4 space-y-1.5">
          {["Definir prioridades", "Escrever o plano"].map((task, i) => (
            <div key={task} className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <CheckCircle2
                className={cn("h-3.5 w-3.5", i === 0 ? "text-primary" : "text-muted-foreground")}
              />
              <span className={i === 0 ? "line-through opacity-60" : ""}>{task}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 h-16 rounded bg-gradient-to-br from-primary/20 to-primary/5" />
      </div>
    </div>
  );
}

const BLOCKS = [
  {
    id: "calendario",
    icon: LayoutDashboard,
    title: "Calendário, semana e ano",
    description:
      "Alterne entre a visão de 12 meses e a semana hora a hora. Crie e edite eventos com duplo clique, escolha cores e marque dias inteiros ou horários.",
    mock: <KanbanMock />,
  },
  {
    id: "workspace",
    icon: LayoutDashboard,
    title: "Um workspace no estilo Notion",
    description:
      "Organize databases em projetos e veja os mesmos dados como tabela ou kanban. Arraste cards entre colunas e a nova ordem é salva automaticamente.",
    mock: <EditorMock />,
  },
];

const FEATURED = {
  id: "workspace",
  icon: PenSquare,
  title: "Páginas ricas para cada item",
  description:
    "Cada item tem uma página com formatação rica, listas de tarefas, tabelas e imagens — com salvamento automático enquanto você escreve.",
};

/** Demonstração visual das telas do produto (mocks em HTML/CSS). */
export function ShowcaseSection() {
  return (
    <section id="como-funciona" className="scroll-mt-20 border-b">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Veja como fica na prática
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            Uma interface limpa, tema escuro confortável e tudo a poucos cliques.
          </p>
        </div>

        <div className="mt-14 space-y-16">
          {BLOCKS.map((block, index) => {
            const Icon = block.icon;
            const reversed = index % 2 === 1;
            return (
              <div
                key={block.id}
                className="grid items-center gap-8 lg:grid-cols-2"
              >
                <div className={cn(reversed && "lg:order-2")}>
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </span>
                  <h3 className="mt-4 text-xl font-semibold">{block.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {block.description}
                  </p>
                </div>
                <div className={cn(reversed && "lg:order-1")}>{block.mock}</div>
              </div>
            );
          })}

          {/* Bloco final: páginas ricas */}
          <div className="grid items-center gap-8 lg:grid-cols-2">
            <div className="lg:order-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <FEATURED.icon className="h-5 w-5 text-primary" />
              </span>
              <h3 className="mt-4 text-xl font-semibold">{FEATURED.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {FEATURED.description}
              </p>
            </div>
            <div className="lg:order-1">
              <EditorMock />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
