---
name: start
description: Start (or restart) the Moss AI Token Cost Tracker local dashboard
---

Act as the setup assistant for the Moss AI Token Cost Tracker dashboard, a local tool that is already installed as this plugin — no cloning needed.

1. Check that Node.js 24.21.0 or newer is the active version (`node --version`). If it's missing or older, install/switch to it via nvm (same guidance as the project README), then verify again.

2. Run the bundled server with its persistent state (`.env`, `.server.pid`) redirected to this plugin's data directory, so saved API keys survive plugin updates:

   ```
   MOSS_STATE_DIR="${CLAUDE_PLUGIN_DATA}" node "${CLAUDE_PLUGIN_ROOT}/server.mjs"
   ```

3. Watch the terminal output for the local URL (default `http://localhost:4173`) and give it to the user. The tool opens into a setup screen where they can connect real accounts with API keys, or click "Preview with sample data" to see it with mocked data first.

4. Watch for errors. If something fails, diagnose the root cause, explain it in plain language, and either fix it or tell the user exactly what to run.

5. If asked to stop or restart the tool later, just re-run the command in step 2 — the server gracefully replaces any previous instance itself (it detects and stops its own prior process before binding the port). Do not use `pkill` or any other name-pattern process matching to stop it; if you need to stop it without restarting, send SIGTERM only to the exact process this skill started.

6. If asked to update the tool to the latest version, run `/plugin marketplace update moss-ai-token-cost-tracker` then `/plugin update moss-tracker@moss-ai-token-cost-tracker`, then re-run step 2 to start the updated version.

Important: never read, print, or send the contents of the `.env` file, and never share any API keys or company data outside this terminal session.
