---
name: travel-import
description: Assist with importing travel visits and future destinations (with optional cover photos) into a self-hosted Travel Planner using the locally installed travelctl CLI.
---

# Travel Planner Import Skill

The `travelctl` CLI connects this agent to the **user's own** Travel Planner website. It stores the website address and API Token locally after initial login. The Skill itself must never contain or store the user's credentials.

## First-use onboarding (before accessing data)

1. Check if the local Windows executable is accessible with `travelctl --help` (or `travelctl.exe --help`). On first install, guide the user to their site's **Admin → AI 授权** page to download the official Windows executable and this Skill. The user should save `travelctl.exe` in a persistent folder and make that folder available on their PATH, then reopen the Agent's terminal. If the user prefers not to change PATH, ask for the full local path to the executable and consistently invoke that path instead. Never download or run an unknown executable without the user's approval. No npm installation or Node.js is required for the Windows EXE.
2. Run `travelctl auth status`. If authenticated, proceed without prompting for anything. An expired/revoked Token or unreachable server means that re-authentication may be necessary; tell the user why.
3. When configuration is absent, explain the one-time setup:
   - Open the user's own website's **管理后台 → AI 授权** page and create a scoped API Token.
   - **In their own local terminal**, run `travelctl auth login`. The CLI itself asks for the website address first, then prompts for the Token with hidden input. The user can alternatively run `travelctl auth login --server https://their-real-domain`, which skips the address prompt.
   - CLI checks the Token against the specified site's authenticated API endpoint **before** saving the site's origin and Token in its local configuration directory.
   - Windows: `%APPDATA%\\travelctl\\config.json`; Linux/macOS: `$XDG_CONFIG_HOME/travelctl/config.json` or `~/.config/travelctl/config.json`. This version uses a local file, **not an encrypted OS credential vault**; do not share, print, or commit it. Keep the local computer account protected. A new login replaces the previous single-site configuration.
4. Ask the user to return after successful login, then call `travelctl auth status` again. The user may share their site URL in chat if needed (it's not a secret), **but NEVER ask them to paste their API Token into chat, a skill, a source file, or a CLI command argument**. Do not read the local credentials file with an agent tool or expose Tokens in tool logs.
5. From then on, use `travelctl` commands automatically with the saved configuration, without requesting the URL or Token again.

## Import workflow

1. For past trips, run `travelctl visits list` before adding records. For future plans, use `travelctl destinations list` to avoid duplicates.
2. Preserve date precision: a known year means `when: "2025"`; a known month means `when: "2025-05"`. Do not invent exact dates, companions, locations or coordinates. **Future intentions are never past visits.**
3. For a **local** photo the user wants publicly attached, run `travelctl media upload path/to/photo.jpg`. Copy the returned `imageId` into the JSON. Images are re-encoded as WebP and stripped of EXIF. Do not fetch or upload third-party work without authorization. Staged images remain private until an import referencing them is confirmed.
4. Write a JSON file in the working directory. Past example: `{"items":[{"name":"东京","region":"日本","when":"2025-05","group":"mine","country":"日本","latitude":35.68,"longitude":139.69,"imageId":"<uploaded-id>"}]}`. Coordinates must come from verified geographical data; omit if unknown. `group` currently retains legacy choices `mine`, `her`, `both`.
5. Future example: `{"items":[{"title":"京都","subtitle":"日本·关西","months":"10-11月","days":"5天","route":["京都","宇治"],"spots":["伏见稻荷大社"],"reason":"红叶季","imageId":"<uploaded-id>"}]}`. Optional `budget:{flight,hotel,group,food,tickets,transport,other}` is the CNY *total*, not per person. Missing budgets stay missing.
6. Run `travelctl visits prepare file.json` or `travelctl destinations prepare file.json`. Review the draft ID, warnings and preview. Summarize intended additions for the user and **obtain explicit confirmation before the database write**.
7. Only after confirmation run `travelctl import commit DRAFT_ID --confirm`. Otherwise `travelctl import cancel DRAFT_ID`. Never silently commit.
8. Tokens authorize only their permitted scopes. Do not attempt to circumvent authorization or overwrite someone else's existing records.

This version supports one image per record, no video uploads, no automatic remote image fetching; duplicate existing records are skipped.
