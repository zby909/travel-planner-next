---
name: travel-import
description: Manage travel visits, future destinations, timeline entries and optional cover photos in the user's self-hosted Travel Planner through the local travelctl CLI.
---

# Travel Planner Skill

The `travelctl` CLI connects this agent to the **user's own** Travel Planner website. The Skill itself must never contain or store credentials.

## First-use onboarding

1. Resolve the CLI executable before doing any data work:
   - First check whether `travelctl --help` works in the agent's local terminal. On Windows, `Get-Command travelctl -ErrorAction SilentlyContinue` or `where.exe travelctl` can confirm whether it is on PATH.
   - If the command is not found, **ask the user for the full path to their downloaded official `travelctl.exe`** (for example, `C:\\Users\\<user>\\Downloads\\travelctl.exe`). Do not guess a path or scan the whole disk. Verify that the exact file exists and run its `--help` command. Keep that path for this session and invoke it with PowerShell's call operator, e.g. `& "C:\\path\\to\\travelctl.exe" auth status`; use the same full-path prefix for every subsequent command. Adding its folder to PATH is optional, not a prerequisite.
   - The official standalone EXE should be downloaded from the user's **管理后台 → AI 授权** page or the project's official GitHub Releases. It bundles Node.js; Windows users do not need Node.js or npm. In a development environment with Node.js 22+, the compiled CLI can alternatively run as `node path/to/travelctl.mjs`.
2. Run `travelctl auth status` (or the equivalent command using the resolved full EXE path). If authenticated, proceed without prompting. If the Token is expired/revoked or the server is unreachable, explain the reason.
3. If not configured, ask the user to open their own website's **管理后台 → AI 授权** page and create a scoped API Token. Explain that the website address is the base URL of their own deployed Travel Planner instance. The user must complete first-time authorization in **their own interactive local terminal**, not in chat and not through a non-interactive agent shell:
   ```powershell
   travelctl auth login
   ```
   If the EXE is not on PATH, show the same command with its full path:
   ```powershell
   & "C:\\path\\to\\travelctl.exe" auth login
   ```
   The CLI interactively asks for the website URL and then the API Token using hidden input. The user enters both directly in that terminal; the agent must not ask for the Token in chat or try to capture it. If the user has already provided the non-secret website URL in chat, the command may use `travelctl auth login --server https://their-real-domain` (or the full EXE path equivalent), which skips the URL prompt but still requests the Token invisibly.
4. The CLI validates the Token against `/api/v1/me` before saving it. Windows encrypts the Token using the current Windows user's DPAPI; the config file at `%APPDATA%\\travelctl\\config.json` contains ciphertext. Linux/macOS currently use a local config file with owner-only permissions where supported, at `$XDG_CONFIG_HOME/travelctl/config.json` or `~/.config/travelctl/config.json`. Never read, print, share or commit the local config. `travelctl auth logout` removes local authorization.
5. Ask the user to return after successful login, then run `travelctl auth status` again using the resolved executable. The user may share their site URL in chat (it is not a secret), but **NEVER ask them to paste their API Token into chat, a Skill, source code or a command-line argument**. Do not read the local credentials file with an agent tool or expose Tokens in tool logs.
6. From then on, use the saved configuration automatically without requesting the EXE path again in the current session, or the URL/Token again after successful login. On a future session, if `travelctl` is still not on PATH and the executable path is not available in context, ask for its full path again.

## General workflow

1. Before changing past trips, run `travelctl visits list`; before changing future plans, run `travelctl destinations list`; before chronology work, run `travelctl timeline list`. Treat live API results as the source of truth. Do not assume remembered conversation data is already in the database.
2. Preserve date precision: known year only → `when: "2025"`; known month → `when: "2025-05"`. Never invent exact dates, companions, locations or coordinates. **Future intentions are never past visits.**
3. For a local photo the user wants attached, run `travelctl media upload path/to/photo.jpg` and use the returned `imageId`. Images are re-encoded as WebP and stripped of EXIF. Do not fetch third-party images without authorization. Staged images remain private until a confirmed import references them.
4. Use JSON with an `items` array. Past visit example:
   ```json
   {"items":[{"name":"东京","region":"日本","when":"2025-05","group":"mine","country":"日本","latitude":35.68,"longitude":139.69,"imageId":"<uploaded-id>"}]}
   ```
   Coordinates must come from verified geographical data; omit if unknown. `group` is one of `mine`, `her`, `both`.
5. Future destination example:
   ```json
   {"items":[{"title":"京都","subtitle":"日本·关西","months":"10-11月","days":"5天","route":["京都","宇治"],"spots":["伏见稻荷大社"],"reason":"红叶季","imageId":"<uploaded-id>"}]}
   ```
   Optional `budget:{flight,hotel,group,food,tickets,transport,other}` is the CNY total, not per person. Missing budgets stay missing.
6. Create new records with `travelctl visits prepare file.json` or `travelctl destinations prepare file.json`. Review the returned preview and warnings, summarize additions, and obtain explicit user confirmation.
7. Only after confirmation run `travelctl import commit DRAFT_ID --confirm`. Otherwise run `travelctl import cancel DRAFT_ID`. Never silently commit.

## Updating existing visits

Use `travelctl visits update prepare visit-updates.json`. Each item must include its existing `id` plus only fields to change. Supported fields: `name`, `region`, `when`, `group`, `country`, `province`, `city`, `latitude`, `longitude`, `note`, `imageId`, `sortOrder`.

- Use `imageId: null` to clear its cover and `when: ""` to clear its date label.
- Latitude and longitude must be supplied together; use both null to clear coordinates.
- Name/region changes are checked for duplicate records.
- Editing a visit does not silently edit its linked timeline event. Review the timeline separately if the date, title or group should also change.

## Updating future destinations

Use `travelctl destinations update prepare destination-updates.json`. Each item must include its existing `id`. Supported fields include title/subtitle, months/days, vibe/reason, groupText/flightNote/flightSource, route/spots, partial CNY budget breakdown, min/max budget, flight pricing, guide days and cover image.

- `flightPricing` is a complete object with route, normalMin/normalMax, holidayMin/holidayMax, normalSample and holidaySample. Use `flightPricing: null` to remove it.
- `guideDays`, when supplied, replaces the existing guide-day list.
- Use `imageId: null` to clear the cover.
- When budget amounts or bounds change, the updated breakdown total must remain within the budget range.
- The server checks the current values, duplicate title conflicts and staged-image ownership before creating a preview.

## Timeline operations

Use `travelctl timeline list` to read event IDs, dates, titles, notes and linked visit IDs.

Use `travelctl timeline prepare timeline-changes.json` to create or update events:
- New event: omit `id`, and provide `year`, `date` (YYYY or YYYY.MM), `group`, `title`, and one or more `placeIds`.
- Existing event: provide its existing `id` and only the fields to change. If `placeIds` is supplied, it replaces the current links.
- `year` and `date` must be provided together and agree. `group` is one of `mine`, `her`, `both`.
- Timeline event date/group/title/note are independent from linked visit fields. Editing one does not silently alter the other.
- Deletion is not supported.

## Safety and current limits

- All create/update/timeline writes create a preview draft. The preview includes current values, proposed changes and warnings. Obtain explicit user confirmation before `travelctl import commit DRAFT_ID --confirm`; if not approved, cancel it.
- New visits with a known `when` automatically create one linked timeline entry in the same transaction. A visit without a reliable date does not create one. Existing duplicate visits do not gain a new event.
- Exact duplicate *new* visits (same name + region) and destinations (same title) are warned about and skipped. Updates target explicit IDs and reject conflicting duplicate names.
- Never bypass the API by editing SQLite directly. Tokens only authorize their selected scopes; do not attempt to circumvent them.
- One image per record is supported. No video upload or automatic remote image fetching.
