import { redirect } from "next/navigation";

import { CtaSection } from "@/components/marketing/CtaSection";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { Hero } from "@/components/marketing/Hero";
import { LandingFooter } from "@/components/marketing/LandingFooter";
import { LandingNav } from "@/components/marketing/LandingNav";
import { PrivacySection } from "@/components/marketing/PrivacySection";
import { ShowcaseSection } from "@/components/marketing/ShowcaseSection";

export const metadata = {
  title: "Calendário Anual · Seu ano inteiro, organizado",
  description:
    "Calendário anual de 12 meses com visões de semana e mês, workspace estilo Notion (projetos, tabelas e kanban) e editor de páginas. Seus dados são privados.",
};

/**
 * Landing pública (apresentação/venda). É a rota raiz e não exige login.
 * O app autenticado vive em "/app" (protegido pelo middleware).
 *
 * Se o provedor de OAuth devolver o `?code=` na raiz (por exemplo quando a
 * "Site URL" do Supabase está desatualizada), encaminhamos para o callback
 * correto em vez de mostrar a landing e perder o login.
 */
export default function LandingPage({
  searchParams,
}: {
  searchParams: { code?: string; error?: string; error_description?: string };
}) {
  if (searchParams.code) {
    const params = new URLSearchParams();
    params.set("code", searchParams.code);
    redirect(`/auth/callback?${params.toString()}`);
  }

  return (
    <div className="h-screen overflow-y-auto scroll-smooth bg-background">
      <LandingNav />
      <main>
        <Hero />
        <FeatureGrid />
        <ShowcaseSection />
        <PrivacySection />
        <CtaSection />
      </main>
      <LandingFooter />
    </div>
  );
}

