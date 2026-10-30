# travelctl

Node.js CLI for a self-hosted Next.js Travel Planner. The command implementation has one TypeScript source at `src/travelctl.mts`; the same compiled JavaScript powers both the standalone executable and the npm package.

## Standalone executable

Download `travelctl.exe` from [GitHub Releases](https://github.com/zby909/travel-planner-next/releases). Keep it in a permanent folder and add that folder to PATH. The EXE bundles the Node.js runtime; end users do not need Node.js or npm.

## Node.js mode

Node.js 22+ users can run the generated `bin/travelctl.mjs` directly, or install the local package from this repository:

```powershell
npm run cli:build
npm install -g .\\cli
travelctl --help
```

## Commands

```powershell
travelctl auth login
travelctl auth status
travelctl auth logout

travelctl visits list
travelctl destinations list
travelctl timeline list

travelctl visits prepare .\\visits.json
travelctl destinations prepare .\\future.json
travelctl visits update prepare .\\visit-updates.json
travelctl destinations update prepare .\\destination-updates.json
travelctl timeline prepare .\\timeline-changes.json

travelctl import commit <draft-id> --confirm
travelctl import cancel <draft-id>
travelctl media upload .\\photo.jpg
```

The Token is generated in **管理后台 → AI 授权**. Enter it only into the CLI's hidden local terminal prompt; never paste it into an AI conversation, command-line argument, Skill file or source code.

- Windows stores the Token encrypted with the current Windows user's DPAPI. The configuration file is at `%APPDATA%\\travelctl\\config.json`; it contains the encrypted credential, not the plaintext Token.
- Linux/macOS currently use a local config file with owner-only permissions where supported: `$XDG_CONFIG_HOME/travelctl/config.json` or `~/.config/travelctl/config.json`.
- Previous plaintext Windows config files are migrated to DPAPI encryption the next time the CLI reads them.
- Use `travelctl auth logout` to remove the local authorization.

All create/update operations use the website's preview draft. The CLI never writes directly to SQLite. Review the current values, proposed changes and warnings, then obtain the user's explicit confirmation before `import commit --confirm`.
