---
name: start
description: Use this when the user wants to review or understand their organisation’s OpenAI or Anthropic API usage and costs from connected accounts, or to set up, open, restart, or stop the Moss AI Spend Tracker dashboard. Opens the local dashboard, which retrieves usage and cost data for finance reporting; does not retrieve data into chat. Does not change provider settings or enforce spending limits. Do not use for ChatGPT or Claude subscription billing, or general model pricing questions.
---

Run the bundled dashboard on the user's computer. Installation already includes
`server.mjs`, `index.html`, `lib/`, and assets; do not clone another copy.

## Check for updates before opening

On the first start/open/restart request in each chat, check this plugin's configured
marketplace for updates before selecting the app to run. Do not repeat the check
in the same chat unless the user asks to update. A stop-only request skips it.
Respect an explicit request to skip updates. Check only the configured source and
ref; do not switch branches, unpin a release, or overwrite a local development copy.

- **Codex:** refresh with
  `codex plugin marketplace upgrade moss-ai-token-cost-tracker`, then inspect
  `codex plugin list --available --marketplace moss-ai-token-cost-tracker --json`.
  Compare the available plugin version with the installed `plugin.json` version.
  If a newer version exists, use the client's supported update mechanism. The
  CLI provides `codex plugin add moss-tracker@moss-ai-token-cost-tracker`; verify
  its result and installed manifest rather than assuming an already-installed
  plugin was updated. If this client only applies updates through Plugins, report
  the available version and the required action. Do not uninstall the plugin as
  an update workaround or modify the installed cache by hand.
- **Claude Code:** refresh with
  `/plugin marketplace update moss-ai-token-cost-tracker`, then apply available
  updates with `/plugin update moss-tracker@moss-ai-token-cost-tracker`. Use these
  as Claude Code commands, not shell commands. Verify the resulting version.
- A marketplace refresh alone does not prove the installed plugin was updated.
  After a verified update, resolve the new installed plugin root and read its
  `skills/start/SKILL.md` before continuing. Retain the same persistent state
  directory, and mark the update check complete to avoid recursive update checks.
  If the client requires a new chat or app restart to load the update, explain
  that requirement rather than claiming the current chat has loaded the new skill.
- If the check fails because the network, permissions, or update mechanism is
  unavailable, do not retry repeatedly or block opening an otherwise working
  dashboard. Continue with the installed version and mention briefly that the
  update check or application could not complete. Never claim an update succeeded
  without verification. Do not fetch keys, provider usage, or dashboard contents
  to check for updates.

If a newer version was installed and can be used in this chat, restart a verified
running Moss instance once using the restart procedure below, keeping its state
directory and preferred port. Otherwise reuse the running instance as usual.

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
4. **Reuse before launching.** A request to start or open the dashboard does not
   mean restart it. Check the managed terminal session from an earlier launch.
   If it is still running, open its existing URL and do not launch another process.
   In a new chat, determine the same persistent state directory described below
   (the helper exports `resolveStateDirectory()`), read only its `.server.pid`,
   and use the operating system's process/listener tools to verify that PID belongs
   to Moss and find its actual listening port. Open that existing URL if healthy.
   If the PID file is missing or stale, inspect listeners on the requested port
   (default 4173) and the fallback range through port + 9 for a running Moss server.
   Verify the process's command and app path; a busy port alone does not identify
   Moss. Do not inspect dashboard pages, provider data, or `.env` for this check.
   If a confirmed Moss instance is running, reuse it even if it was launched from
   an older plugin cache or a manual installation. Do not start a second instance
   with a different state directory merely because the current PID file is absent.

   Only if no running Moss instance is found, run the helper below, replacing
   `<plugin-root>` with the resolved absolute path. Keep it in a managed,
   long-running terminal session and retain its URL and server PID for later
   requests. Do not wait for the server process to exit before replying.

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
   a clickable link. The default is `http://localhost:4173`. The server can try
   subsequent ports, but allow this only when the preferred port belongs to a
   different application. If another Moss process occupies it, reuse that process
   instead. Do not change `PORT` or repeatedly relaunch to bypass an existing Moss
   instance. If sandbox permissions prevent process inspection or stopping an
   instance, resolve the permission failure or explain it; do not create another
   instance on a higher port. If browser opening is unavailable, provide the link
   for the user to open. For a reused instance, verify its process and listener
   are still alive before reporting the existing URL.
6. Explain that they can enter provider Admin API keys in the local dashboard, or
   choose **Preview with sample data** without keys. Leave key entry to the user.
   Do not inspect dashboard contents or retrieve spend data merely to verify launch.

## Stop, restart, and update

- Restart only when the user explicitly requests it, or after applying an app
  update. Stop the verified existing Moss instance first and wait for its process
  to exit and listening port to be released. Then run the helper with the same
  state directory and preferred port. The server's PID-file cleanup is a fallback;
  do not assume it succeeded. If stopping fails, diagnose that failure instead of
  launching another copy. Never switch state directories to work around it.
- To stop, interrupt the managed terminal session you started, or send SIGTERM
  only to its known server PID. If ownership is unclear, verify the process's
  command and server path first. Never use `pkill`, name-pattern matching, or stop
  an unrelated process occupying the preferred port.
- Diagnose failures using the exit status and non-secret error output. Explain
  missing runtime or permission requirements without exposing credentials.
- For an explicit update request, run the update check above even if this chat
  already checked. Report an update failure clearly. For a local development
  marketplace, use the client's refresh/reinstall flow without changing source
  files. Do not run `git pull` in an installed plugin cache.

## Credentials and scope

Never read, print, copy, or send `.env`, `.env.bak`, or API keys into chat, terminal
output, or external services. Do not solicit keys in chat or pass them in shell
commands. The backend reads saved keys itself and calls the providers directly.
This plugin launches the local UI; it does not expose an MCP tool or fetch company
usage or spend into the conversation. Do not reset onboarding or remove saved
credentials unless the user requests that action.
