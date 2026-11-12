"use strict";

/**
 * Processo principal do app desktop (Electron).
 *
 * Responsabilidades:
 *  1. Subir o servidor Next em modo "standalone" (`.next/standalone/server.js`)
 *     numa porta fixa de loopback, reutilizando o Node embutido no Electron
 *     (`process.execPath` + `ELECTRON_RUN_AS_NODE=1`), sem exigir Node instalado.
 *  2. Esperar o servidor responder e então carregar a janela.
 *  3. Garantir que o processo do servidor seja encerrado ao fechar o app.
 *  4. Bloquear navegação externa (abre no navegador padrão do sistema).
 */

const { app, BrowserWindow, shell, dialog } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

// Porta fixa de loopback. Precisa coincidir exatamente com a Redirect URL
// allowlistada no Supabase (`http://localhost:<PORT>/auth/callback`).
// O servidor Next (standalone) canonicaliza o host nas redirects do middleware
// para `localhost`, então usamos `localhost` de ponta a ponta para manter a
// origem/OAuth consistentes. O bind TCP continua em 127.0.0.1.
const HOST = "127.0.0.1";
const PUBLIC_HOST = "localhost";
const PORT = 4173;
// Em desenvolvimento (`npm run desktop:dev`) apontamos para o `next dev`,
// que roda em `localhost:3000` — não subimos o servidor standalone nem
// exigimos `build-env.json`.
const DEV_URL = process.env.DESKTOP_DEV_URL ?? null;
const APP_URL = DEV_URL ?? `http://${PUBLIC_HOST}:${PORT}`;
// No desktop não mostramos a landing pública (`/`): abrimos direto o app
// (`/app`), que redireciona para `/login` quando não há sessão.
const START_PATH = "/app";

/** @type {import('node:child_process').ChildProcess | null} */
let serverProcess = null;
/** @type {BrowserWindow | null} */
let mainWindow = null;
let isQuitting = false;

/**
 * Resolve o caminho do `server.js` do build standalone.
 *  - Empacotado: `resources/standalone/server.js` (via extraResources).
 *  - Desenvolvimento: `.next/standalone/server.js` na raiz do projeto.
 */
function resolveServerPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "standalone", "server.js");
  }
  return path.join(__dirname, "..", ".next", "standalone", "server.js");
}

/**
 * Lê as variáveis de ambiente do build do desktop.
 * Fonte única: `desktop/build-env.json`, gerado pelo script de build a partir
 * do `.env` (nunca versionado). Empacotado em `resources/desktop-env.json`.
 */
function resolveEnv() {
  const envPath = app.isPackaged
    ? path.join(process.resourcesPath, "desktop-env.json")
    : path.join(__dirname, "build-env.json");

  /** @type {Record<string, string>} */
  let fileEnv = {};
  if (fs.existsSync(envPath)) {
    try {
      fileEnv = JSON.parse(fs.readFileSync(envPath, "utf8"));
    } catch (error) {
      throw new Error(`Falha ao ler ${envPath}: ${error.message}`);
    }
  }

  const keys = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SITE_URL",
  ];

  /** @type {Record<string, string>} */
  const resolved = {};
  const missing = [];
  for (const key of keys) {
    const value = fileEnv[key] ?? process.env[key];
    if (!value) {
      missing.push(key);
    } else {
      resolved[key] = value;
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Variáveis de ambiente ausentes: ${missing.join(", ")}. ` +
        "Copie `.env.example` para `.env` e rode o build do desktop.",
    );
  }
  return resolved;
}

/**
 * Sobe o servidor standalone e resolve quando ele já aceita conexões.
 * @returns {Promise<void>}
 */
function startServer() {
  const serverPath = resolveServerPath();
  if (!fs.existsSync(serverPath)) {
    return Promise.reject(
      new Error(
        `Servidor não encontrado em ${serverPath}. ` +
          "Rode `npm run desktop:build` (ou `npm run build`) antes.",
      ),
    );
  }

  const env = resolveEnv();

  serverProcess = spawn(process.execPath, [serverPath], {
    cwd: path.dirname(serverPath),
    env: {
      ...process.env,
      ...env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(PORT),
      HOSTNAME: HOST,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  serverProcess.stdout?.on("data", (data) => {
    process.stdout.write(`[next] ${data}`);
  });
  serverProcess.stderr?.on("data", (data) => {
    process.stderr.write(`[next] ${data}`);
  });
  serverProcess.on("exit", (code) => {
    serverProcess = null;
    // Se o servidor cair inesperadamente (e não for um encerramento normal),
    // avisa o usuário em vez de deixar a janela em branco.
    if (!isQuitting && code !== 0) {
      dialog.showErrorBox(
        "Nottase",
        `O servidor interno foi encerrado inesperadamente (código ${code}). ` +
          "Feche e abra o aplicativo novamente.",
      );
      app.quit();
    }
  });

  return waitForServer();
}

/**
 * Faz polling no servidor até obter uma resposta HTTP.
 * @returns {Promise<void>}
 */
function waitForServer() {
  const deadline = Date.now() + 30_000;

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(`http://${HOST}:${PORT}/login`, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (serverProcess === null) {
          reject(new Error("O servidor interno foi encerrado antes de iniciar."));
          return;
        }
        if (Date.now() > deadline) {
          reject(new Error("Tempo esgotado ao iniciar o servidor interno."));
          return;
        }
        setTimeout(attempt, 300);
      });
      req.setTimeout(2000, () => req.destroy());
    };
    attempt();
  });
}

/**
 * Decide se uma URL pertence ao app embutido (navegação in-window) ou deve
 * abrir no navegador externo. O fluxo do Google OAuth ocorre na própria janela,
 * pois o callback precisa retornar para o loopback do app.
 * @param {string} url
 */
function isInternalUrl(url) {
  try {
    const parsed = new URL(url);
    const { origin, protocol, hostname, port } = parsed;
    if (protocol === "about:" || protocol === "blob:") {
      return true;
    }
    // O app embutido, aceitando tanto `localhost` quanto `127.0.0.1` na porta
    // fixa (o servidor Next canonicaliza para `localhost`).
    if (
      (hostname === "localhost" || hostname === "127.0.0.1") &&
      port === String(PORT)
    ) {
      return true;
    }
    if (DEV_URL && origin === DEV_URL) {
      return true;
    }
    // Domínios do login Google/Supabase usados no fluxo OAuth.
    const oauthHosts = ["accounts.google.com", "supabase.co"];
    return oauthHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

/**
 * Indica se a URL é a raiz do app embutido (`/`), ou seja, a landing pública
 * que não deve ser exibida no desktop.
 * @param {string} url
 */
function isLandingRoot(url) {
  try {
    const parsed = new URL(url);
    const isAppHost =
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") &&
      parsed.port === String(PORT);
    const isDevHost = DEV_URL ? parsed.origin === DEV_URL : false;
    return (isAppHost || isDevHost) && parsed.pathname === "/";
  } catch {
    return false;
  }
}

/**
 * Resolve o caminho do ícone da janela.
 *  - Empacotado: `resources/standalone/public/icone.png` (o `public/` é copiado
 *    para dentro do standalone).
 *  - Desenvolvimento: `<root>/public/icone.png`.
 * @returns {string | undefined} Caminho do ícone, se existir.
 */
function resolveIconPath() {
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, "standalone", "public", "icone.png")]
    : [path.join(__dirname, "..", "public", "icone.png")];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function createWindow() {
  const icon = resolveIconPath();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0a0a0a",
    autoHideMenuBar: true,
    icon,
    // Barra de título oculta: o conteúdo (a sidebar) se estende até o topo, por
    // baixo dos controles nativos de janela. `titleBarOverlay` mantém os botões
    // nativos (minimizar/maximizar/fechar) no canto superior direito, com as
    // cores do tema escuro do app. A região arrastável é definida no CSS
    // (`-webkit-app-region: drag`) pela própria interface.
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#111112",
      symbolColor: "#F2F2F3",
      height: 40,
    },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Navegação in-window apenas para URLs internas/OAuth; o resto vai para o
  // navegador padrão do sistema. A landing pública (`/`) é sempre desviada
  // para o app (`/app`) no desktop.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isLandingRoot(url)) {
      void mainWindow?.loadURL(`${APP_URL}${START_PATH}`);
      return { action: "deny" };
    }
    if (isInternalUrl(url)) {
      return { action: "allow" };
    }
    void shell.openExternal(url);
    return { action: "deny" };
  });

  // Redireciona a landing para o app em navegações normais (ex.: pós-logout).
  const redirectLanding = (event, url) => {
    if (isLandingRoot(url)) {
      event.preventDefault();
      void mainWindow?.loadURL(`${APP_URL}${START_PATH}`);
      return true;
    }
    return false;
  };

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (redirectLanding(event, url)) return;
    if (!isInternalUrl(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  // Redirects de servidor (ex.: 303 do signout -> `/`) não passam por
  // `will-navigate`; tratamos em `will-redirect`.
  mainWindow.webContents.on("will-redirect", (event, url) => {
    redirectLanding(event, url);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow.loadURL(`${APP_URL}${START_PATH}`);
}

function stopServer() {
  if (serverProcess !== null) {
    // `kill()` encerra o processo filho. Em Windows, o servidor Next spawna
    // pouco; um SIGTERM resolve. `before-quit` espera o evento 'exit'.
    serverProcess.kill();
  }
}

app.on("before-quit", () => {
  isQuitting = true;
  stopServer();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.whenReady().then(async () => {
  // Windows: garante que a janela/taskbar use o ícone e a identidade do app.
  if (process.platform === "win32") {
    app.setAppUserModelId("com.nottase.desktop");
  }

  try {
    // Modo dev: o `next dev` já está rodando (localhost:3000); não subimos o
    // servidor standalone.
    if (!DEV_URL) {
      await startServer();
    }
    await createWindow();
  } catch (error) {
    dialog.showErrorBox("Nottase", error.message);
    app.quit();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});
