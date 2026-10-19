import { useCallback, useLayoutEffect, useRef, useState } from "react";

/**
 * Detecta se um popover cabe abaixo/à direita do seu ponto de ancoragem; caso
 * contrário, o "flipa" (estilo Notion) para cima e/ou para a esquerda. Mede o
 * tamanho real do popover após montar (e a cada mudança de conteúdo/tamanho da
 * janela) e devolve as classes de posicionamento e o ref que deve ser aplicado
 * ao elemento do popover.
 *
 * O popover deve ter `position: absolute` e vir ancorado por padrão em `top-full`
 * e `left-0`; o hook alterna para `bottom-full` e `right-0` quando falta espaço.
 */
export function useFlipPopover<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null);
  const [flipY, setFlipY] = useState(false);
  const [flipX, setFlipX] = useState(false);

  useLayoutEffect(() => {
    if (!element) return;

    const measure = () => {
      const rect = element.getBoundingClientRect();
      // Espaco disponivel tomando o popover ja renderizado como referencia.
      const spaceBelow = window.innerHeight - rect.top;
      const spaceRight = window.innerWidth - rect.left;
      const hasScrollbarX = window.innerWidth - document.documentElement.clientWidth;
      // 8px de respiro para nao colar nas bordas.
      setFlipY((prev) => {
        const next = rect.height + 8 > spaceBelow;
        return prev === next ? prev : next;
      });
      setFlipX((prev) => {
        const next = rect.width + 8 > spaceRight - hasScrollbarX;
        return prev === next ? prev : next;
      });
    };

    measure();
    // Reavalia quando o proprio popover muda de tamanho (ex.: lista carregada).
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [element]);

  return {
    /**
     * Callback ref: dispara a medição sempre que o popover monta (o popover é
     * renderizado condicionalmente, então precisa reavaliar ao abrir).
     */
    ref: useCallback((node: T | null) => setElement(node), []),
    /** Classe de posicionamento vertical (abre para baixo ou flipa para cima). */
    yClass: flipY ? "bottom-full mb-1" : "top-full mt-1",
    /** Classe de posicionamento horizontal (alinhado à esquerda ou flipa à direita). */
    xClass: flipX ? "right-0" : "left-0",
    /** Classe combinada pronta para uso no `className` do popover. */
    className: `${flipY ? "bottom-full mb-1" : "top-full mt-1"} ${
      flipX ? "right-0" : "left-0"
    }`,
  };
}

/**
 * Posiciona um submenu popover **ao lado** (à direita) do seu gatilho, no estilo
 * Notion dos submenus do cabeçalho de propriedade. Se não houver espaço à direita
 * (coluna próxima à borda direita da tela), o submenu "flipa" para a esquerda.
 *
 * O submenu deve ter `position: absolute`; o hook devolve a classe
 * `left-full ml-1 top-0` (à direita) ou `right-full mr-1 top-0` (à esquerda) e o
 * ref que deve ser aplicado ao elemento.
 */
export function useFlipSide<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [flipLeft, setFlipLeft] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const measure = () => {
      const parent = element.parentElement;
      if (!parent) return;
      // Posição da âncora (container `relative` do gatilho) na viewport, mais a
      // largura de layout do submenu é estável mesmo antes do posicionamento.
      const anchorRect = parent.getBoundingClientRect();
      const spaceRight = window.innerWidth - anchorRect.right;
      const width = element.offsetWidth;
      // 8px de respiro para não colar na borda direita.
      setFlipLeft((prev) => {
        const next = width + 8 > spaceRight;
        return prev === next ? prev : next;
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, []);

  return {
    ref,
    className: flipLeft ? "right-full mr-1 top-0" : "left-full ml-1 top-0",
  };
}
