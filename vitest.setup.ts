import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom não implementa ResizeObserver (usado por popovers e pelo virtualizador
// da tabela). Stub mínimo para os componentes não quebrarem nos testes.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
}

// jsdom não implementa `scrollIntoView` (usado pela paleta de busca global para
// manter o resultado destacado visível durante a navegação por teclado). Stub
// mínimo para os componentes não quebrarem nos testes.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {};
}

// Desmonta os componentes renderizados após cada teste (o Testing Library não
// faz auto-cleanup quando `globals` está desativado).
afterEach(() => {
  cleanup();
});
