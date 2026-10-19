import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Callback do OAuth (Google). O Supabase redireciona para cá com ?code=...
 * Aqui trocamos o code pela sessão (grava cookies) e enviamos o usuário
 * de volta para o app (ou para a página de origem).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirectTo = searchParams.get("redirectTo") ?? "/app";

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${redirectTo}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
