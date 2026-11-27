const { app, BrowserWindow, ipcMain, safeStorage, session, shell } = require("electron");
const { fileURLToPath, pathToFileURL } = require("node:url");
const path = require("node:path");
const { createPlanner } = require("./core.cjs");
const { createGeminiPlanner } = require("./gemini.cjs");
const { createGeminiKeyStore } = require("./secrets.cjs");

const isDevelopment = !app.isPackaged && Boolean(process.env.NEXROUTE_DEV_URL);
const devUrl = isDevelopment ? new URL(process.env.NEXROUTE_DEV_URL) : null;
const appHtmlPath = path.resolve(app.getAppPath(), "dist/index.html");
const hasSingleInstanceLock = app.requestSingleInstanceLock();
let mainWindow;
let planner;
let geminiKeyStore;

if (isDevelopment && (devUrl.origin !== "http://127.0.0.1:5173" || devUrl.pathname !== "/")) {
  throw new Error("NexRoute development renderer must use its local Vite origin.");
}

app.setName("NexRoute");
if (!hasSingleInstanceLock) app.quit();

if (process.platform === "win32") {
  app.setAppUserModelId("dev.nexroute.desktop");
}

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

function expectedAppUrl() {
  return isDevelopment ? devUrl.href : pathToFileURL(appHtmlPath).href;
}

function isTrustedUrl(value) {
  try {
    const candidate = new URL(value);
    if (isDevelopment) {
      return candidate.origin === devUrl.origin && candidate.pathname === "/";
    }
    return candidate.protocol === "file:" && path.resolve(fileURLToPath(candidate)) === appHtmlPath;
  } catch {
    return false;
  }
}

function assertTrustedSender(event) {
  if (
    !mainWindow ||
    event.sender !== mainWindow.webContents ||
    event.senderFrame !== mainWindow.webContents.mainFrame ||
    !isTrustedUrl(event.senderFrame.url)
  ) {
    throw new Error("Request rejected: untrusted application frame.");
  }
}

function registerHandlers() {
  ipcMain.handle("plans:list", (event) => {
    assertTrustedSender(event);
    return planner.getPlans();
  });
  ipcMain.handle("plans:create", (event, input) => {
    assertTrustedSender(event);
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("Project brief is invalid.");
    }
    return planner.createPlan(input.idea, input.daysAvailable);
  });
  ipcMain.handle("plans:delete", (event, planId) => {
    assertTrustedSender(event);
    return planner.deletePlan(planId);
  });
  ipcMain.handle("gemini:status", async (event) => {
    assertTrustedSender(event);
    return { configured: Boolean(await geminiKeyStore.get()) };
  });
  ipcMain.handle("gemini:key-save", (event, input) => {
    assertTrustedSender(event);
    if (!input || typeof input !== "object" || Array.isArray(input) || input.consent !== true) {
      throw new Error("Review and accept the Gemini free-tier data notice before saving a key.");
    }
    return geminiKeyStore.save(input.apiKey).then(() => ({ configured: true }));
  });
  ipcMain.handle("gemini:key-remove", async (event) => {
    assertTrustedSender(event);
    await geminiKeyStore.remove();
    return { configured: false };
  });
  ipcMain.handle("gemini:open-key-page", (event) => {
    assertTrustedSender(event);
    return shell.openExternal("https://aistudio.google.com/api-keys");
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 850,
    minHeight: 640,
    title: "NexRoute",
    backgroundColor: "#08090a",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedUrl(url)) event.preventDefault();
  });
  mainWindow.webContents.on("will-attach-webview", (event) => event.preventDefault());
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  const page = expectedAppUrl();
  if (isDevelopment) {
    mainWindow.loadURL(page);
  } else {
    mainWindow.loadFile(appHtmlPath);
  }
}

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  geminiKeyStore = createGeminiKeyStore({
    safeStorage,
    storePath: path.join(app.getPath("userData"), "gemini-api-key.json"),
  });
  planner = createPlanner({
    storePath: path.join(app.getPath("userData"), "plans.json"),
    aiGenerator: createGeminiPlanner({ getApiKey: () => geminiKeyStore.get() }),
  });
  registerHandlers();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
