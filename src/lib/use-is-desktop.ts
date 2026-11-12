"use client";

import { useEffect, useState } from "react";

/**
 * Indica se o app está rodando dentro do shell desktop (Electron).
 *
 * O `preload.js` do desktop expõe `window.desktop.isDesktop = true`. No
 * navegador essa flag não existe, então retorna `false`. A detecção é feita no
 * cliente (após a montagem) para não causar divergência de hidratação — no
 * primeiro render o valor é sempre `false` (seguro para SSR e navegador), e
 * vira `true` no desktop logo depois de montar.
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const flag = (window as unknown as { desktop?: { isDesktop?: boolean } })
      .desktop?.isDesktop;
    if (flag) setIsDesktop(true);
  }, []);

  return isDesktop;
}
