import { CalendarDays } from "lucide-react";

import { LoginButton } from "@/components/auth/LoginButton";

export const metadata = {
  title: "Entrar · Calendário Anual",
};

const ERROR_MESSAGES: Record<string, string> = {
  auth: "Não foi possível concluir a autenticação. Tente novamente.",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: { redirectTo?: string; error?: string };
}) {
  const redirectTo =
    searchParams.redirectTo && searchParams.redirectTo.startsWith("/")
      ? searchParams.redirectTo
      : "/";
  const errorMessage = searchParams.error
    ? ERROR_MESSAGES[searchParams.error] ?? "Ocorreu um erro ao entrar."
    : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-lg">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <CalendarDays className="h-6 w-6 text-primary" />
          </span>
          <h1 className="text-xl font-semibold">Calendário Anual</h1>
          <p className="text-sm text-muted-foreground">
            Entre com sua conta Google para acessar seus eventos.
          </p>
        </div>

        {errorMessage ? (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-center text-xs text-destructive">
            {errorMessage}
          </div>
        ) : null}

        <LoginButton redirectTo={redirectTo} />

        <p className="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground">
          Seus eventos são privados e visíveis apenas para você.
        </p>
      </div>
    </main>
  );
}
