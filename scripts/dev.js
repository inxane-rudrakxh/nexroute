import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"], {
  cwd: root,
  stdio: "inherit",
});
const children = [vite];
let stopping = false;

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(exitCode), 250).unref();
}

async function waitForVite() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (vite.exitCode !== null) throw new Error("Vite exited before it became ready.");
    try {
      const response = await fetch("http://127.0.0.1:5173");
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error("Vite did not become ready within 60 seconds.");
}

process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
vite.once("exit", (code) => {
  if (!stopping) stop(code ?? 1);
});

try {
  await waitForVite();
  const electron = spawn(process.execPath, ["node_modules/electron/cli.js", "."], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, NEXROUTE_DEV_URL: "http://127.0.0.1:5173/" },
  });
  children.push(electron);
  electron.once("exit", (code) => {
    if (!stopping) stop(code ?? 0);
  });
  electron.once("error", (error) => {
    console.error("Could not start the NexRoute desktop shell:", error);
    stop(1);
  });
} catch (error) {
  console.error(error.message);
  stop(1);
}
