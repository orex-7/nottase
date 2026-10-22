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
    <main className="flex h-screen flex-col overflow-hidden bg-muted/30">
      <CalendarProvider
        userName={displayName}
        userEmail={user?.email ?? ""}
        userAvatar={avatarUrl}
      />
    </main>
  );
}
