import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Espelha os aliases do tsconfig.json: `@/*` -> `./src/*` e
    // `@shared/*` -> `./supabase/functions/_shared/*` (motor compartilhado
    // entre o app e a Edge Function).
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(
        new URL("./supabase/functions/_shared", import.meta.url),
      ),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    clearMocks: true,
  },
});
