import { CalendarDays } from "lucide-react";

/**
 * Mock estático (HTML/CSS) da grade de 12 meses do app.
 * Não usa screenshots — é montado com divs e os tokens de cor do tema,
 * ficando leve e consistente com o visual real do produto.
 */
const MONTHS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

const DOTS = ["#3b82f6", "#22c55e", "#f59e0b", "#ec4899", "#8b5cf6"];

function MiniMonth({ index }: { index: number }) {
  // Gera algumas "marcações" de eventos, determinísticas por mês.
  const dots = [DOTS[index % DOTS.length], DOTS[(index + 2) % DOTS.length]];
  return (
    <div className="rounded-md border bg-card p-2">
      <div className="mb-1 text-[10px] font-medium text-muted-foreground">
        {MONTHS[index]}
      </div>
      <div className="grid grid-cols-7 gap-[2px]">
        {Array.from({ length: 28 }).map((_, day) => {
          const hasEvent = day === (index * 3) % 28 || day === (index * 3 + 5) % 28;
          const isToday = index === 0 && day === 8;
          return (
            <span
              key={day}
              className="relative aspect-square rounded-[3px] bg-muted/60"
            >
              {hasEvent ? (
                <span
                  className="absolute inset-x-[2px] bottom-[2px] h-[3px] rounded-full"
                  style={{ backgroundColor: dots[day % 2] }}
                />
              ) : null}
              {isToday ? (
                <span className="absolute inset-0 rounded-[3px] ring-1 ring-primary" />
              ) : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Prévia visual (mockup) do calendário anual de 12 meses. */
export function AppPreview() {
  return (
    <div className="rounded-xl border bg-muted/30 p-3 shadow-2xl sm:p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
            <CalendarDays className="h-3.5 w-3.5 text-primary" />
          </span>
          <span className="text-xs font-semibold">2026</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="rounded border px-2 py-0.5 text-[10px] text-muted-foreground">
            Semana
          </span>
          <span className="rounded bg-primary px-2 py-0.5 text-[10px] text-primary-foreground">
            Mês
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {MONTHS.map((_, i) => (
          <MiniMonth key={i} index={i} />
        ))}
      </div>
    </div>
  );
}
