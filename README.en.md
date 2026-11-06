# A Travel Journal for Two

A self-hosted travel archive for two people to plan future trips, map places they have visited, track simple trip expenses, and keep travel diaries with photos.

[简体中文](README.md) · [Deployment](docs/DEPLOYMENT.md) · [Development](docs/DEVELOPMENT.md) · [AI / CLI](docs/AI-CLI.md)

> This project is under active development. Features and data models may change.

## Features

- A shared travel space with two separate member accounts.
- A cinematic home page, destination wishlist, visited-place map, and timeline.
- Trip plans with dates, budgets, and links to independently hosted HTML guides.
- Lightweight trip costs with add/edit/delete and recalculated totals for food, accommodation, transport, and other.
- Reversible destination/place archiving with consistent page, story, and media visibility.
- Reference-aware media cleanup that preserves shared photos and archived records.
- Administrator-only ZIP export and verified restore on a blank instance, including older schema upgrades.
- Date-based travel diaries with optional visited-place links and multiple photos.
- Photo processing that converts uploads to WebP and strips EXIF/GPS metadata.
- Public or members-only site visibility.
- AI-assisted data import through a scoped API token, travelctl, and an Agent Skill.
- Docker deployment with persistent SQLite data and photo storage.

Each deployment has its own database and uploads directory, so different couples or two-person travel groups can run separate instances. This is a lightweight record keeper, not a booking or accounting platform. Deployments remain manually triggered; building/publishing an image does not automatically update the running application.

Archiving a destination removes its public detail page and wishlist card without deleting trip plans. Archiving a visited place also hides its linked timeline events and diaries from the public archive; restoring it brings them back. Members retain access in the admin area. Backups include archived records. Restored inactive historical accounts do not consume the two active-member slots.

## Quick start

Requirements: Node.js 22+.

~~~powershell
npm ci
Copy-Item .env.example .env
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

Fresh installations default to public display. The administrator can switch the site to members-only mode. In public mode, travel diaries and their associated photos are visible to visitors; the admin area always requires login. Future trip plans, budgets, and external guide links remain in the authenticated admin area.

Do not upload photos or diary content that should remain private while the site is public. Switching to private mode cannot revoke copies that visitors have already downloaded or cached.

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
