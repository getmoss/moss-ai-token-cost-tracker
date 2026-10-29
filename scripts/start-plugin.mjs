// Launch from an installed plugin cache without saving credentials in that cache.
import { mkdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

export function resolveStateDirectory(env = process.env, platform = process.platform, home = homedir()) {
  if (env.MOSS_STATE_DIR) return resolve(env.MOSS_STATE_DIR);
  // Preserve the state directory used by existing Claude Code installations.
  if (env.CLAUDE_PLUGIN_DATA) return resolve(env.CLAUDE_PLUGIN_DATA);
  if (platform === "darwin") {
    return join(home, "Library", "Application Support", "moss-ai-token-cost-tracker");
  }
  if (platform === "win32") {
    return win32.join(env.LOCALAPPDATA || win32.join(home, "AppData", "Local"), "moss-ai-token-cost-tracker");
  }
  return join(env.XDG_DATA_HOME || join(home, ".local", "share"), "moss-ai-token-cost-tracker");
}

function main() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 24 || (major === 24 && minor < 21)) {
    console.error("Moss requires Node.js 24.21.0 or newer. Install or select a supported Node.js version and try again.");
    process.exitCode = 1;
    return;
  }
  const stateDir = resolveStateDirectory();
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const child = spawn(process.execPath, [fileURLToPath(new URL("../server.mjs", import.meta.url))], {
    stdio: "inherit",
    env: { ...process.env, MOSS_STATE_DIR: stateDir },
  });
  const terminate = () => child.kill("SIGTERM");
  const interrupt = () => child.kill("SIGINT");
  process.on("SIGTERM", terminate);
  process.on("SIGINT", interrupt);
  child.once("error", () => {
    console.error("Could not start the Moss dashboard server.");
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    process.removeListener("SIGTERM", terminate);
    process.removeListener("SIGINT", interrupt);
    process.exitCode = code ?? (signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1);
  });
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
