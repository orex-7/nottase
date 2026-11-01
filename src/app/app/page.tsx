import { CalendarProvider } from "@/components/calendar/CalendarProvider";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Calendário · Calendário Anual",
};

export default async function AppPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ??
    user?.email ??
    "Usuário";

  // Foto do provedor (Google OAuth) — `avatar_url` (padrão do Supabase) ou
  // `picture` (OpenID). `null` = usar o ícone padrão.
  const avatarUrl =
    (user?.user_metadata?.avatar_url as string | undefined) ??
    (user?.user_metadata?.picture as string | undefined) ??
    null;

  return (
    // `100dvh` (viewport dinâmica) acompanha a barra do navegador do celular
    // (Safari/iOS), evitando que o rodapé fixo ("Nova linha") fique escondido
    // atrás dela. Declarado inline de propósito: se o navegador não suportar
    // `dvh`, a declaração é descartada e o `h-screen` (100vh) do className vale.
    <main
      className="flex h-screen flex-col overflow-hidden bg-background"
      style={{ height: "100dvh" }}
    >
      <CalendarProvider
        userName={displayName}
        userEmail={user?.email ?? ""}
        userAvatar={avatarUrl}
      />
    </main>
  );
}
