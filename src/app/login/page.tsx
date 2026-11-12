import Image from "next/image";

import { LoginButton } from "@/components/auth/LoginButton";

export const metadata = {
  title: "Entrar · Nottase",
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
      : "/app";
  const errorMessage = searchParams.error
    ? ERROR_MESSAGES[searchParams.error] ?? "Ocorreu um erro ao entrar."
    : null;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      {/* Brilho decorativo de fundo (acento vermelho da identidade). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,hsl(var(--background))_75%)]"
      />

      <div className="relative w-full max-w-sm">
        <div className="rounded-2xl border bg-card/80 p-8 shadow-2xl backdrop-blur-sm">
          <div className="mb-8 flex flex-col items-center gap-3 text-center">
            <span className="flex h-14 w-14 items-center justify-center">
              <Image
                src="/icone.png"
                alt="Nottase"
                width={56}
                height={56}
                className="h-14 w-14 object-contain"
                priority
              />
            </span>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">
                Nottase
              </h1>
              <p className="text-sm text-muted-foreground">
                Entre com sua conta Google para acessar seus eventos.
              </p>
            </div>
          </div>

          {errorMessage ? (
            <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-center text-xs text-destructive">
              {errorMessage}
            </div>
          ) : null}

          <LoginButton redirectTo={redirectTo} />
        </div>
      </div>
    </main>
  );
}
