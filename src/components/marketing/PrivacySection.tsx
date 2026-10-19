import { Lock, ShieldCheck, UserCheck, Database } from "lucide-react";

const POINTS = [
  {
    icon: ShieldCheck,
    title: "Segurança em nível de linha",
    description:
      "As políticas de RLS no Postgres garantem isolamento por usuário — inclusive contra acesso direto à API.",
  },
  {
    icon: UserCheck,
    title: "Só o seu conteúdo",
    description:
      "Cada evento e database pertence a uma conta. Você vê e edita apenas o que é seu.",
  },
  {
    icon: Lock,
    title: "Login via Google",
    description:
      "Autenticação segura com sua conta Google, sem senhas adicionais para gerenciar.",
  },
  {
    icon: Database,
    title: "Dados seus, sempre",
    description:
      "Tudo persistido com segurança no Supabase e recuperável a qualquer momento.",
  },
];

/** Faixa de destaque sobre privacidade e segurança. */
export function PrivacySection() {
  return (
    <section id="privacidade" className="scroll-mt-20 border-b bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Privacidade
          </span>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            Seus dados são privados por padrão
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            A privacidade não é um recurso extra — é como o app foi construído.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {POINTS.map((point) => {
            const Icon = point.icon;
            return (
              <div key={point.title} className="rounded-xl border bg-card p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </span>
                <h3 className="mt-4 text-sm font-semibold">{point.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {point.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
