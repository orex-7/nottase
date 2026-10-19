import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

import { AppPreview } from "@/components/marketing/AppPreview";
import { LoginButton } from "@/components/auth/LoginButton";
import { Button } from "@/components/ui/button";

/** Seção principal da landing: proposta de valor + CTA + prévia do produto. */
export function Hero() {
  return (
    <section className="relative overflow-hidden border-b">
      {/* brilho suave de fundo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
        <div className="flex flex-col items-start gap-6">
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Calendário + workspace em um só lugar
          </span>

          <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Seu ano inteiro,
            <span className="text-muted-foreground"> organizado em um só lugar</span>
          </h1>

          <p className="max-w-xl text-pretty text-base leading-relaxed text-muted-foreground">
            Veja os 12 meses de uma vez, planeje a semana hora a hora e organize
            projetos em tabelas e quadros kanban — com páginas no estilo Notion.
            Tudo privado: cada pessoa enxerga apenas os próprios dados.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <LoginButton redirectTo="/app" />
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
              <Link href="#recursos">
                Ver recursos
                <ArrowRight />
              </Link>
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Entre com sua conta Google · leva menos de um minuto
          </p>
        </div>

        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
          <AppPreview />
        </div>
      </div>
    </section>
  );
}
