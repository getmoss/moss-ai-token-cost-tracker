---
name: start
description: Use this when the user wants to review or understand their organisation’s OpenAI or Anthropic API usage and costs from connected accounts, or to set up, open, restart, or stop the Moss AI Spend Tracker dashboard. Opens the local dashboard, which retrieves usage and cost data for finance reporting; does not retrieve data into chat. Does not change provider settings or enforce spending limits. Do not use for ChatGPT or Claude subscription billing, or general model pricing questions.
---

Run the bundled dashboard on the user's computer. Installation already includes
`server.mjs`, `index.html`, `lib/`, and assets; do not clone another copy.

## Set up and open

1. Use a local execution environment with terminal access. A cloud or remote
   machine's localhost is not the user's computer. If the chat runs remotely,
   explain that the user needs a local desktop chat before continuing.
2. Locate this installed plugin's root: from the directory containing this file
   (`skills/start/`), go up two levels (`../..`). In Claude Code,
   `CLAUDE_PLUGIN_ROOT` also identifies it. Resolve the actual absolute location
   from the loaded skill; do not assume
   the current working directory is the plugin root, or that Claude variables
   exist in Codex.
3. Check `node --version`. The app requires Node.js 24.21.0 or newer and has no npm
   dependencies to install. Use an existing compatible runtime or version manager
   when available. If Node is missing, follow the platform's installation guidance
   in the bundled README; do not assume nvm is installed or use an outdated runtime.
4. Run the helper below, replacing `<plugin-root>` with the resolved absolute path.
   Keep it in a managed, long-running terminal session and retain that session for
   later stop requests. Do not wait for the server process to exit before replying.

   ```sh
   node "<plugin-root>/scripts/start-plugin.mjs"
   ```

   The helper creates a persistent data directory and launches the server with
   `MOSS_STATE_DIR` set. It honors an explicit `MOSS_STATE_DIR`, then
   `CLAUDE_PLUGIN_DATA` when available; otherwise it uses:

   - macOS: `~/Library/Application Support/moss-ai-token-cost-tracker`
   - Windows: `%LOCALAPPDATA%\moss-ai-token-cost-tracker` (or the user's
     `AppData\Local` folder if that variable is absent)
   - Linux: `$XDG_DATA_HOME/moss-ai-token-cost-tracker`, defaulting to
     `~/.local/share/moss-ai-token-cost-tracker`

   Use the same directory on subsequent launches. Do not store state in the
   installed plugin cache. Existing manual-clone credentials are not migrated;
   the user can connect accounts through the local setup screen.
5. Wait for the server's `AI token spend dashboard running at ...` message.
   Open that exact URL with an available local browser-opening tool, and provide
   a clickable link. The default is `http://localhost:4173`, but the server tries
   subsequent ports if needed. If browser opening is unavailable, provide the link
   for the user to open. Never claim startup succeeded before seeing the URL.
6. Explain that they can enter provider Admin API keys in the local dashboard, or
   choose **Preview with sample data** without keys. Leave key entry to the user.
   Do not inspect dashboard contents or retrieve spend data merely to verify launch.

## Stop, restart, and update

- To restart, run the same helper with the same state directory. The server
  replaces its previous instance using its own PID file.
- To stop, interrupt the managed terminal session you started, or send SIGTERM
  only to its known server PID. If ownership is unclear, verify the process's
  command and server path first. Never use `pkill`, name-pattern matching, or stop
  an unrelated process occupying the preferred port.
- Diagnose failures using the exit status and non-secret error output. Explain
  missing runtime or permission requirements without exposing credentials.
- Update only when requested. In Claude Code use
  `/plugin marketplace update moss-ai-token-cost-tracker`, then
  `/plugin update moss-tracker@moss-ai-token-cost-tracker`. In Codex refresh this
  marketplace with `codex plugin marketplace upgrade moss-ai-token-cost-tracker`
  and use the desktop plugin manager to apply the update. For a locally edited
  marketplace, refresh/reinstall the plugin from that source. Restart the desktop
  app or start a new chat if necessary to load the changed skill, then relaunch.
  Do not run `git pull` in an installed plugin cache.

## Credentials and scope

Never read, print, copy, or send `.env`, `.env.bak`, or API keys into chat, terminal
output, or external services. Do not solicit keys in chat or pass them in shell
commands. The backend reads saved keys itself and calls the providers directly.
This plugin launches the local UI; it does not expose an MCP tool or fetch company
usage or spend into the conversation. Do not reset onboarding or remove saved
credentials unless the user requests that action.
