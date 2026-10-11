import { CalendarProvider } from "@/components/calendar/CalendarProvider";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ??
    user?.email ??
    "Usuário";

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-muted/30">
      <CalendarProvider userName={displayName} userEmail={user?.email ?? ""} />
    </main>
  );
}

