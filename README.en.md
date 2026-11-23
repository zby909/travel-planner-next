# A Travel Journal for Two

A self-hosted travel archive for two people. Each place has a chronological page of visits, with a date, companions, journal and photo album for each visit. Trip plans include HTML guide links and simple costs.

[简体中文](README.md) · [Deployment](docs/DEPLOYMENT.md) · [Development](docs/DEVELOPMENT.md) · [AI / CLI](docs/AI-CLI.md)

> This project is under active development. Features and data models may change.

## Features

- First-run web onboarding at `/setup` and one-time 24-hour partner invite links (`/invite/[token]`) — no CLI required to get started.
- Built-in offline map preset search (countries, provinces, cities, and coordinates) to light up the footprints map without looking up coordinates manually.
- A shared travel space with two separate member accounts.
- A cinematic home page, lightweight destination wishlist, visited-place map, and chronological timeline.
- Trip plans with dates, budgets, and external guide links (blogs, Notion, Xiaohongshu, or self-hosted guides).
- Lightweight trip costs with add/edit/delete and recalculated totals for food, accommodation, transport, and other.
- Reversible destination/place archiving with consistent page, timeline, note, and media visibility.
- Reference-aware media cleanup that preserves shared photos and archived records.
- Administrator-only ZIP export and verified restore on a blank instance, including older schema upgrades.
- Photos upload individually with progress and retry controls. The default limits of 120 photos and 24 MiB per place can be adjusted in site settings. Each input image can be up to 20 MiB.
- Albums preserve image proportions, support captions and reordering, and provide homepage selections and cover focal points.
- Journals keep optional tab-local drafts and check revisions when saving. Deleted visits can be restored from the trash.
- Completed trips can be recorded as place visits with dates and companions.
- Photo processing that converts uploads to WebP and strips EXIF/GPS metadata.
- Public or members-only site visibility.
- AI-assisted data import through a scoped API token, travelctl, and an Agent Skill.
- Docker deployment with persistent SQLite data and photo storage.

Each deployment has its own database and uploads directory, so different couples or two-person travel groups can run separate instances. This is a lightweight record keeper, not a booking or accounting platform. Deployments remain manually triggered; building/publishing an image does not automatically update the running application.

Archiving a destination removes its public detail page and wishlist card while retaining trip plans. Archiving a place hides its visits, albums and linked timeline events until restored. The admin area and backups retain archived records. The two-member limit counts active accounts.

## Quick start

Requirements: Node.js 22.13+.

~~~powershell
npm ci
Copy-Item .env.example .env
npm run db:generate
npm run db:deploy
npm run user:create -- owner "Administrator" ADMIN
npm run dev
~~~

Open http://localhost:3000. The user creation command prompts for a password twice without echoing it.

## Docker

Configure a strong, unique BOOTSTRAP_ADMIN_PASSWORD in a local, ignored .env file, then run:

~~~powershell
docker compose up -d --build
~~~

The container listens on port 3000 and stores persistent data in /app/data. Use HTTPS in production. See the [deployment guide](docs/DEPLOYMENT.md).

## Privacy

Fresh installations default to public display. The administrator can switch the site to members-only mode. In public mode, visited-place details, notes, and their photos are visible to visitors; the admin area always requires login. Future trip plans, budgets, and external guide links remain in the authenticated admin area.

Do not upload photos or place notes that should remain private while the site is public. Switching to private mode cannot revoke copies that visitors have already downloaded or cached.

## Documentation

- [Development guide](docs/DEVELOPMENT.md)
- [Deployment guide](docs/DEPLOYMENT.md)
- [AI / CLI guide](docs/AI-CLI.md)
- [Privacy and security](docs/PRIVACY-AND-SECURITY.md)
- [Backup and restore](docs/PRIVATE-BACKUP-RESTORE.md)
- [Contributing](CONTRIBUTING.md)
- [Security reporting](SECURITY.md)
- [Third-party assets and notices](docs/THIRD-PARTY-NOTICES.md)
- [Open-source release checklist](docs/OPEN-SOURCE-RELEASE-CHECKLIST.md)

## License

Original project code and documentation are licensed under the **MIT License**. See [LICENSE](LICENSE). You may use, copy, modify, merge, publish, distribute, sublicense, and sell copies of the software, provided that the copyright and permission notice are included in copies or substantial portions. The software is provided "as is", without warranty.

**License scope:** MIT applies to original project code and documentation. It does not replace the licenses of third-party dependencies, map data, photographs, fonts, or other assets. Legacy travel photos include Wikimedia Commons material; some historical attribution records identify CC BY-SA 3.0 / 4.0. Those assets are not relicensed under this project's MIT license. See [Third-party assets and notices](docs/THIRD-PARTY-NOTICES.md).

The maintainer has confirmed that historical travel records do not need to be withheld for privacy reasons. Before a public release, third-party image rights, map-data provenance, and historical secrets still need to be reviewed. See the [open-source release checklist](docs/OPEN-SOURCE-RELEASE-CHECKLIST.md).
