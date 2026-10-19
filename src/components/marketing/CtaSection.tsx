import { CalendarDays } from "lucide-react";

import { LoginButton } from "@/components/auth/LoginButton";

/** Faixa final com a chamada para ação. */
export function CtaSection() {
  return (
    <section className="border-b">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="relative overflow-hidden rounded-2xl border bg-card px-6 py-12 text-center sm:px-12">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 left-1/2 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
          />
          <div className="relative flex flex-col items-center gap-5">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <CalendarDays className="h-6 w-6 text-primary" />
            </span>
            <h2 className="max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Comece a organizar o seu ano agora
            </h2>
            <p className="max-w-xl text-base text-muted-foreground">
              Entre com o Google e tenha seus 12 meses, projetos e páginas prontos
              em segundos.
            </p>
            <div className="w-full max-w-xs">
              <LoginButton redirectTo="/app" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
