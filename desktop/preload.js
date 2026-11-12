"use strict";

/**
 * Preload mínimo. O app hoje não precisa de APIs privilegiadas no renderer
 * (o acesso ao Supabase é feito direto pelo cliente web). Mantemos o contexto
 * isolado e expomos apenas um marcador para eventual detecção de ambiente.
 */

const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  isDesktop: true,
});
