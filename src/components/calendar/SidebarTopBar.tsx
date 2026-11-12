"use client";

import Image from "next/image";

import { UserMenu } from "@/components/calendar/UserMenu";

/**
 * Imagem da marca (wordmark "Nottase"). Substitua `public/logo.png` pela sua
 * imagem. O tamanho intrínseco (2172×724 ≈ 3:1) é usado só para o Next calcular
 * a proporção.
 */
const LOGO_SRC = "/logo.png";
const LOGO_WIDTH = 2172;
const LOGO_HEIGHT = 724;

interface SidebarTopBarProps {
  userName: string;
  userEmail: string;
  /** Foto do usuário (provedor OAuth); `null` = usar o ícone padrão. */
  userAvatar: string | null;
}

/**
 * Linha do topo da sidebar no desktop: o logo do app à esquerda e o botão de
 * perfil à direita. Fica acima do alternador Calendário/Workspace.
 */
export function SidebarTopBar({
  userName,
  userEmail,
  userAvatar,
}: SidebarTopBarProps) {
  return (
    <div className="app-drag flex flex-none items-center justify-between gap-2">
      <Image
        src={LOGO_SRC}
        alt="Nottase"
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        sizes="96px"
        priority
        className="h-7 w-auto flex-none object-contain brightness-0 dark:brightness-100"
      />
      <div className="app-no-drag">
        <UserMenu
          userName={userName}
          userEmail={userEmail}
          userAvatar={userAvatar}
        />
      </div>
    </div>
  );
}
