import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { resolveStateDirectory } from "../scripts/start-plugin.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

test("plugin state honors overrides and keeps platform defaults outside the install cache", () => {
  assert.equal(resolveStateDirectory({ MOSS_STATE_DIR: "/explicit", CLAUDE_PLUGIN_DATA: "/claude" }, "darwin", "/home/test"), "/explicit");
  assert.equal(resolveStateDirectory({ CLAUDE_PLUGIN_DATA: "/claude" }, "darwin", "/home/test"), "/claude");
  assert.equal(resolveStateDirectory({}, "darwin", "/home/test"), "/home/test/Library/Application Support/moss-ai-token-cost-tracker");
  assert.equal(resolveStateDirectory({ LOCALAPPDATA: "C:\\Users\\Test\\AppData\\Local" }, "win32", "C:\\Users\\Test"), "C:\\Users\\Test\\AppData\\Local\\moss-ai-token-cost-tracker");
  assert.equal(resolveStateDirectory({}, "win32", "C:\\Users\\Test"), "C:\\Users\\Test\\AppData\\Local\\moss-ai-token-cost-tracker");
  assert.equal(resolveStateDirectory({}, "linux", "/home/test"), "/home/test/.local/share/moss-ai-token-cost-tracker");
  assert.equal(resolveStateDirectory({ XDG_DATA_HOME: "/data" }, "linux", "/home/test"), "/data/moss-ai-token-cost-tracker");
});

async function freePort() {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

function launch(pluginRoot, stateDir, cwd, port) {
  const env = {
    ...process.env,
    MOSS_STATE_DIR: stateDir,
    ANTHROPIC_ADMIN_KEY: "",
    OPENAI_ADMIN_KEY: "",
    PORT: String(port),
  };
  delete env.ATS_MOCK_MODE;
  const child = spawn(process.execPath, [join(pluginRoot, "scripts/start-plugin.mjs")], {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stderr.on("data", (data) => { output += data; });
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Startup timeout: ${output}`)), 8000);
    child.stdout.on("data", (data) => {
      output += data;
      const match = output.match(/dashboard running at http:\/\/localhost:(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Server exited (${code}): ${output}`)); });
  });
  return { child, ready, exited: once(child, "exit") };
}

async function stop(instance) {
  if (instance.child.exitCode === null && instance.child.signalCode === null) {
    instance.child.kill("SIGTERM");
  }
  await instance.exited;
}

test("cached plugin starts from another cwd, restarts with saved state, and stops cleanly", { timeout: 20000 }, async () => {
  const scratch = mkdtempSync(join(tmpdir(), "moss-plugin-test-"));
  const stateDir = join(scratch, "persistent data");
  const cacheOne = join(scratch, "cache version 1");
  const cacheTwo = join(scratch, "cache version 2");
  const instances = [];
  try {
    for (const cache of [cacheOne, cacheTwo]) {
      mkdirSync(join(cache, "scripts"), { recursive: true });
      for (const file of ["server.mjs", "index.html", "lib", "assets"]) {
        cpSync(join(ROOT, file), join(cache, file), { recursive: true });
      }
      cpSync(join(ROOT, "scripts/start-plugin.mjs"), join(cache, "scripts/start-plugin.mjs"));
    }
    const first = launch(cacheOne, stateDir, scratch, await freePort());
    instances.push(first);
    const firstUrl = await first.ready;
    const setup = await fetch(`${firstUrl}/connect`);
    assert.equal(setup.status, 200);
    assert.match(await setup.text(), /Preview with sample data/);
    const oldPid = readFileSync(join(stateDir, ".server.pid"), "utf8");
    assert.equal(existsSync(join(cacheOne, ".server.pid")), false);
    // A harmless saved configuration proves the new cached version loads the
    // same persistent directory; no provider credentials or network calls needed.
    const config = "ATS_MOCK_MODE=1\n";
    writeFileSync(join(stateDir, ".env"), config);
    const second = launch(cacheTwo, stateDir, scratch, await freePort());
    instances.push(second);
    const secondUrl = await second.ready;
    await first.exited;
    assert.notEqual(readFileSync(join(stateDir, ".server.pid"), "utf8"), oldPid);
    assert.equal(readFileSync(join(stateDir, ".env"), "utf8"), config);
    const dashboard = await fetch(secondUrl);
    assert.equal(dashboard.status, 200);
    assert.match(await dashboard.text(), /window\.__ATS_MOCK_MODE__=true/);
    const stylesheet = await fetch(`${secondUrl}/assets/styles.css`);
    assert.equal(stylesheet.status, 200);
    assert.match(stylesheet.headers.get("content-type"), /text\/css/);
    assert.equal(existsSync(join(cacheTwo, ".env")), false);
    await stop(second);
    assert.equal(existsSync(join(stateDir, ".server.pid")), false);
    assert.equal(readFileSync(join(stateDir, ".env"), "utf8"), config);
  } finally {
    await Promise.all(instances.map(stop));
    rmSync(scratch, { recursive: true, force: true });
  }
});
