"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronRight, LogOut, User } from "lucide-react";

import { cn } from "@/lib/utils";

interface UserMenuProps {
  userName: string;
  userEmail: string;
  /** Foto do usuário (provedor OAuth); `null` = usar o ícone padrão. */
  userAvatar: string | null;
  /** Classes extras no contêiner posicionado (ex.: `ml-2`). */
  className?: string;
}

/**
 * Botão de perfil do usuário: o avatar abre um menu com "Conta" (foto, nome e
 * e-mail) e "Sair" (encerra a sessão). Usado tanto no cabeçalho quanto no topo
 * da sidebar (no desktop, ao lado do logo).
 */
export function UserMenu({
  userName,
  userEmail,
  userAvatar,
  className,
}: UserMenuProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  // Fecha o menu ao clicar fora ou com Esc (Esc fecha primeiro o "Conta").
  useEffect(() => {
    if (!userMenuOpen) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest("[data-user-menu-trigger]") ||
        target?.closest("[data-user-menu]")
      ) {
        return;
      }
      setUserMenuOpen(false);
      setAccountOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (accountOpen) setAccountOpen(false);
      else setUserMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [userMenuOpen, accountOpen]);

  return (
    <div className={cn("relative flex items-center", className)}>
      <button
        type="button"
        data-user-menu-trigger
        onClick={() => {
          setUserMenuOpen((open) => !open);
          setAccountOpen(false);
        }}
        aria-haspopup="menu"
        aria-expanded={userMenuOpen}
        aria-label="Menu do usuário"
        title={userName}
        className="flex h-8 w-8 flex-none items-center justify-center overflow-hidden rounded-full border bg-primary/10 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {userAvatar ? (
          <Image
            src={userAvatar}
            alt=""
            width={32}
            height={32}
            unoptimized
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        ) : (
          <User className="h-4 w-4 text-primary" />
        )}
      </button>

      {userMenuOpen ? (
        <div
          data-user-menu
          role="menu"
          aria-label="Menu do usuário"
          className="absolute right-0 top-full z-50 mt-1 w-44 rounded-md border bg-popover p-1 shadow-md"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => setAccountOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={accountOpen}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <User className="h-4 w-4 flex-none" />
            Conta
            <ChevronRight className="ml-auto h-3.5 w-3.5 flex-none" />
          </button>

          <form action="/auth/signout" method="post">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <LogOut className="h-4 w-4 flex-none" />
              Sair
            </button>
          </form>

          {/* Popover "Conta": foto, nome e e-mail. Abre à esquerda do menu
              (o avatar fica na borda direita da tela). */}
          {accountOpen ? (
            <div
              data-user-menu
              role="dialog"
              aria-label="Conta"
              className="absolute right-full top-0 mr-1 w-64 rounded-md border bg-popover p-3 shadow-md"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 flex-none items-center justify-center overflow-hidden rounded-full bg-primary/10">
                  {userAvatar ? (
                    <Image
                      src={userAvatar}
                      alt=""
                      width={40}
                      height={40}
                      unoptimized
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <User className="h-5 w-5 text-primary" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {userName}
                  </p>
                  {userEmail ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {userEmail}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
