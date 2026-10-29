---
name: travel-import
description: Import travel footprints and future destination ideas into a self-hosted Travel Planner using travelctl.
---

# Travel Planner Import Skill

Use the locally installed `travelctl` command. Never request the user's API Token in chat; have the user run `travelctl auth login --server https://their-travel-site` locally. Never print or open the saved credentials file.

## Workflow

1. Check `travelctl auth status`. If not configured, ask the user to open the site's **AI 授权** page and complete interactive CLI login.
2. For past trips, run `travelctl visits list` before preparing new places. For plans, run `travelctl destinations list` to avoid duplicates.
3. Preserve date precision: only a known year means `when: "2025"`; a known month means `when: "2025-05"`. Never invent dates, companions, locations or coordinates. **Future intentions must never be imported as past visits.**
4. If the user supplied a **local** photo file, run `travelctl media upload path/to/photo.jpg`; copy only the returned `imageId` into the JSON. Images are re-encoded to WebP and stripped of EXIF. Do not auto-download images or reuse someone else's work without permission. Images become public when attached to a published visit/destination.
5. Write a JSON file to a safe working path. For past trips: `{"items":[{"name":"东京","region":"日本","when":"2025-05","group":"mine","country":"日本","latitude":35.68,"longitude":139.69,"imageId":"<uploaded-id>"}]}`. Geocoordinates must come from verified location data; omit if unknown. `group` is a temporary legacy compatibility field (`mine`, `her`, `both`).
6. For future ideas: `{"items":[{"title":"京都","subtitle":"日本·关西","months":"10-11月","days":"5天","route":["京都","宇治"],"spots":["伏见稻荷大社"],"reason":"红叶季","imageId":"<uploaded-id>"}]}`. Optional budget uses `budget:{flight,hotel,group,food,tickets,transport,other}` in CNY total, not per person. Unknown budget must be omitted, not invented.
7. Run `travelctl visits prepare file.json` or `travelctl destinations prepare file.json`. Examine the returned draft ID, items and all warnings. Present a clear summary to the user and **obtain explicit confirmation**.
8. Only after explicit confirmation run `travelctl import commit DRAFT_ID --confirm`. If canceled, run `travelctl import cancel DRAFT_ID`.
9. Never bypass preview, alter another person's existing records, or silently commit a batch. Never send tokens, raw credentials or private photos into model context without user permission.

This version supports single-image cover per record, no video uploads, no arbitrary remote image fetching, and imports **new** records only. Existing duplicates are skipped.
