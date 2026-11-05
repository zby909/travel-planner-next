# AI / CLI Guide

The project provides travelctl and the travel-import Agent Skill so a compatible local AI agent can help maintain travel records on the user's own deployed site.

The CLI does not connect to a model API and does not store credentials in the Skill. The website issues scoped API Tokens from Admin → AI 授权 (/admin/tokens).

## Install travelctl

### Windows standalone executable

Download travelctl.exe from the project's GitHub Releases and keep it in a permanent folder. Add that folder to PATH if desired. The executable bundles Node.js; end users do not need Node.js or npm.

### Node.js mode

Node.js 22+ users can build and install the local CLI package:

~~~powershell
npm run cli:build
npm install -g .\cli
travelctl --help
~~~

## First authorization

1. Sign in to the website and open /admin/tokens.
2. Create a token with only the scopes needed for the task. The token is displayed once.
3. In the user's own interactive terminal, run:

~~~powershell
travelctl auth login
travelctl auth status
~~~

The CLI asks for the website base URL and then requests the token through hidden terminal input. It validates the token before saving it.

**Never ask the user to paste the token into chat, an AI prompt, a command argument, a Skill file, or source code.** Do not read the local credential file or print it in logs.

- Windows encrypts the token with the current Windows user's DPAPI. Configuration is stored at %APPDATA%/travelctl/config.json.
- Linux/macOS use a local configuration file with owner-only permissions where supported: $XDG_CONFIG_HOME/travelctl/config.json or ~/.config/travelctl/config.json.
- Run travelctl auth logout to remove local authorization.

## Common commands

~~~powershell
travelctl auth login
travelctl auth status
travelctl auth logout

travelctl visits list
travelctl destinations list
travelctl timeline list

travelctl visits prepare .\visits.json
travelctl destinations prepare .\future.json
travelctl visits update prepare .\visit-updates.json
travelctl destinations update prepare .\destination-updates.json
travelctl timeline prepare .\timeline-changes.json

travelctl media upload .\photo.jpg
travelctl import commit <draft-id> --confirm
travelctl import cancel <draft-id>
~~~

## Example: import visited places

~~~json
{
  "items": [{
    "name": "东京",
    "region": "日本 · 东京",
    "when": "2025-05",
    "group": "mine",
    "country": "日本",
    "latitude": 35.6762,
    "longitude": 139.6503,
    "note": "第一次旅行"
  }]
}
~~~

Use the most precise date that is actually known: 2025 for year-only data, or 2025-05 when the month is known. Do not invent coordinates; omit them if they cannot be verified. group is mine, her, or both.

## Example: import a future destination

~~~json
{
  "items": [{
    "title": "京都",
    "subtitle": "日本 · 关西",
    "months": "10–11月",
    "days": "5天",
    "vibe": "秋季红叶",
    "reason": "和 TA 一起看红叶",
    "route": ["京都", "宇治"],
    "spots": ["伏见稻荷大社"],
    "budget": {
      "food": 1000,
      "accommodation": 1800,
      "transport": 2900,
      "other": 800
    }
  }]
}
~~~

Budget values in this import format are CNY totals for two people, not per-person amounts. Missing estimates should remain missing.

## Photos

~~~powershell
travelctl media upload .\my-trip.jpg
~~~

The upload returns an imageId. JPEG, PNG and WebP are supported; the maximum input size is 8 MiB. The server re-encodes images as WebP and strips EXIF/GPS metadata. Uploads remain staged until a confirmed import references them. Do not upload third-party photos without permission.

## Preview-before-commit workflow

All create and update operations create a preview draft:

1. Read current records with list before proposing changes.
2. Run a prepare command.
3. Review current values, proposed changes and warnings.
4. Summarize the changes and obtain the user's explicit confirmation.
5. Only then run travelctl import commit DRAFT_ID --confirm.
6. If the user declines, run travelctl import cancel DRAFT_ID.

The CLI never writes directly to SQLite. Never bypass the API or attempt to exceed the Token's scopes.

## Agent Skill

The Skill is located at [skills/travel-import/SKILL.md](../skills/travel-import/SKILL.md). It contains the full workflow for Codex, Claude Code and other compatible local agents. The agent must resolve the actual CLI path, use the user's own terminal for first-time authorization, and never request the token in chat.

The Windows release workflow is triggered by a v* tag. It builds the executable, tests it against a local API mock, and attaches it to the GitHub Release.
