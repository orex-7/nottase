import Link from "next/link";
import { CalendarDays } from "lucide-react";

/** Rodapé mínimo da landing. */
export function LandingFooter() {
  return (
    <footer className="bg-background">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <CalendarDays className="h-3.5 w-3.5 text-primary" />
          </span>
          <span className="text-sm font-medium">Calendário Anual</span>
        </div>

        <nav className="flex items-center gap-4 text-xs text-muted-foreground">
          <a href="#recursos" className="transition-colors hover:text-foreground">
            Recursos
          </a>
          <a href="#privacidade" className="transition-colors hover:text-foreground">
            Privacidade
          </a>
          <Link href="/login" className="transition-colors hover:text-foreground">
            Entrar
          </Link>
        </nav>

        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Calendário Anual
        </p>
      </div>
    </footer>
  );
}
