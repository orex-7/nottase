// @ts-check
"use strict";

/**
 * Orquestra o build do app desktop:
 *   1. Lê o `.env` (fonte única das variáveis) e valida as chaves obrigatórias.
 *   2. Gera `desktop/build-env.json` (empacotado como recurso do Electron).
 *   3. Roda `next build` com as `NEXT_PUBLIC_*` já definidas (inlinadas no build).
 *   4. Copia `public/` e `.next/static/` para dentro de `.next/standalone`
 *      (o output standalone não faz isso sozinho).
 *   5. Roda `electron-builder`.
 *
 * Falha explicitamente se faltar alguma variável, para não gerar um pacote
 * sem chaves do Supabase.
 */

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const ENV_FILE = path.join(ROOT, ".env");
const BUILD_ENV_FILE = path.join(__dirname, "build-env.json");
const STANDALONE_DIR = path.join(ROOT, ".next", "standalone");

const REQUIRED_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];

// Porta fixa de loopback. Deve casar com a Redirect URL allowlistada no
// Supabase (`http://localhost:4173/auth/callback`). O servidor Next standalone
// canonicaliza o host das redirects para `localhost`, então usamos `localhost`.
const DESKTOP_SITE_URL = "http://localhost:4173";

/**
 * Parser simples de `.env` (KEY=VALUE, ignorando comentários e linhas vazias).
 * Aceita valores entre aspas.
 * @param {string} contents
 * @returns {Record<string, string>}
 */
function parseEnv(contents) {
  /** @type {Record<string, string>} */
  const result = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function readDotEnv() {
  if (!fs.existsSync(ENV_FILE)) {
    fail(
      "Arquivo `.env` não encontrado. Copie `.env.example` para `.env` e " +
        "preencha NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  return parseEnv(fs.readFileSync(ENV_FILE, "utf8"));
}

/** @param {string} message */
function fail(message) {
  console.error(`\n[desktop:build] ERRO: ${message}\n`);
  process.exit(1);
}

/** @param {string} command @param {string[]} args @param {NodeJS.ProcessEnv} env */
function run(command, args, env) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env,
    shell: process.platform === "win32",
    cwd: ROOT,
  });
  if (result.status !== 0) {
    fail(`Comando falhou (${result.status}): ${command} ${args.join(" ")}`);
  }
}

/** @param {string} from @param {string} to */
function copyDir(from, to) {
  fs.cpSync(from, to, { recursive: true });
}

function main() {
  const dotenv = readDotEnv();

  /** @type {Record<string, string>} */
  const buildEnv = {};
  const missing = [];
  for (const key of REQUIRED_KEYS) {
    const value = dotenv[key] ?? process.env[key];
    if (!value) missing.push(key);
    else buildEnv[key] = value;
  }
  if (missing.length > 0) {
    fail(`Variáveis ausentes no .env: ${missing.join(", ")}`);
  }

  // A URL do site do desktop é fixa (loopback) para casar com o OAuth.
  buildEnv.NEXT_PUBLIC_SITE_URL = DESKTOP_SITE_URL;

  // 1. Persiste a env para o runtime do Electron (empacotada como recurso).
  fs.writeFileSync(BUILD_ENV_FILE, `${JSON.stringify(buildEnv, null, 2)}\n`);
  console.log(`[desktop:build] Env gravada em ${BUILD_ENV_FILE}`);

  /** @type {NodeJS.ProcessEnv} */
  const childEnv = { ...process.env, ...buildEnv };

  // 2. Build do Next (standalone) com as NEXT_PUBLIC_* inlinadas.
  console.log("[desktop:build] next build...");
  run("npx", ["next", "build"], childEnv);

  // 3. Copia assets estáticos para dentro do standalone.
  const standaloneExists = fs.existsSync(STANDALONE_DIR);
  if (!standaloneExists) {
    fail(
      "`.next/standalone` não foi gerado. Confirme `output: \"standalone\"` " +
        "em next.config.mjs.",
    );
  }

  console.log("[desktop:build] copiando public/ e .next/static/ para o standalone...");
  const publicSrc = path.join(ROOT, "public");
  if (fs.existsSync(publicSrc)) {
    copyDir(publicSrc, path.join(STANDALONE_DIR, "public"));
  }
  const staticSrc = path.join(ROOT, ".next", "static");
  if (fs.existsSync(staticSrc)) {
    copyDir(staticSrc, path.join(STANDALONE_DIR, ".next", "static"));
  }

  // 4. Empacota o instalador.
  console.log("[desktop:build] electron-builder...");
  run(
    "npx",
    ["electron-builder", "--config", "desktop/electron-builder.yml"],
    childEnv,
  );

  console.log("[desktop:build] Concluído. Instaladores em dist/.");
}

main();
