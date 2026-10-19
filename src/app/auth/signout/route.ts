import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/** Encerra a sessão e volta para a landing pública. */
export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  const supabase = createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(`${origin}/`, { status: 303 });
}
