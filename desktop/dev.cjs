"use strict";

/**
 * Inicia o Electron em modo desenvolvimento, apontando para o `next dev`
 * (http://localhost:3000). Não sobe o servidor standalone.
 *
 * Uso:
 *   1. Terminal 1: `npm run dev`
 *   2. Terminal 2: `npm run desktop:dev`
 */

const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");
const devUrl = process.env.DESKTOP_DEV_URL ?? "http://localhost:3000";

const electronBin = require(path.join(root, "node_modules", "electron"));

const child = spawn(electronBin, [root], {
  stdio: "inherit",
  env: { ...process.env, DESKTOP_DEV_URL: devUrl },
});

child.on("exit", (code) => process.exit(code ?? 0));
