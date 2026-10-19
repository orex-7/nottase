import {
  CalendarDays,
  CalendarRange,
  Columns3,
  LayoutDashboard,
  Palette,
  PenSquare,
  Search,
  ShieldCheck,
} from "lucide-react";

const FEATURES = [
  {
    icon: CalendarDays,
    title: "Visão anual de 12 meses",
    description:
      "A grade completa do ano em um só olhar, com o dia de hoje e o dia selecionado destacados.",
  },
  {
    icon: CalendarRange,
    title: "Semana e mês",
    description:
      "Alterne entre a grade mensal e a semana estilo agenda, com eventos hora a hora.",
  },
  {
    icon: Palette,
    title: "Eventos do seu jeito",
    description:
      "Dia inteiro ou com horário de início e fim, com cores personalizadas por evento.",
  },
  {
    icon: LayoutDashboard,
    title: "Workspace com projetos",
    description:
      "Agrupe databases em projetos com categorias coloridas e reordene arrastando.",
  },
  {
    icon: Columns3,
    title: "Tabela e Kanban",
    description:
      "Visualize os mesmos dados como planilha ou quadro kanban, com arrastar e soltar.",
  },
  {
    icon: PenSquare,
    title: "Editor de páginas",
    description:
      "Páginas no estilo Notion: formatação rica, listas de tarefas, tabelas e imagens.",
  },
  {
    icon: Search,
    title: "Busca e filtros",
    description:
      "Encontre itens rapidamente e organize por status, tags, datas e responsáveis.",
  },
  {
    icon: ShieldCheck,
    title: "Privado por padrão",
    description:
      "Segurança em nível de linha no banco: você só acessa os próprios dados.",
  },
];

/** Grade de recursos do produto. */
export function FeatureGrid() {
  return (
    <section id="recursos" className="scroll-mt-20 border-b">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Tudo o que você precisa para planejar o ano
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            Do calendário pessoal ao workspace de projetos — sem trocar de
            ferramenta.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="rounded-xl border bg-card p-5 transition-colors hover:border-primary/40"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </span>
                <h3 className="mt-4 text-sm font-semibold">{feature.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
