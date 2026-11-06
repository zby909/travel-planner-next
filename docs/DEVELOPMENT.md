# Development Guide

## Requirements

- Node.js 22+
- npm (the repository uses package-lock.json)
- Google Chrome for the browser-based authentication E2E suite

## Local setup

From the repository root:

~~~powershell
npm ci
Copy-Item .env.example .env
npm run db:deploy
npm run user:create -- owner "管理员" ADMIN
npm run dev
~~~

The default SQLite URL in .env.example points to data/travel.db. Prisma resolves this path relative to prisma/schema.prisma. The upload directory defaults to data/uploads/; set UPLOAD_DIR only when a different persistent directory is required.

## Main source layout

~~~text
src/
  app/
    admin/       Authenticated editorial workspace and Server Actions
    api/         Authentication, media, health and scoped CLI APIs
    destinations/ Destination detail pages
    memories/    Public year-grouped aggregation of visited-place stories
    visited/     Visited-place map, gallery and timeline
  components/    Shared UI components
  lib/           Authentication, access control, formatting and storage helpers
prisma/
  schema.prisma
  migrations/
cli/              travelctl TypeScript source and packaging
skills/           Agent Skills
scripts/          Database, test and release helpers
docs/             User, deployment and contributor documentation
~~~

## Data model notes

- SQLite is the source of truth for travel content, accounts, settings, audit records and media metadata.
- Original image files are stored outside the public directory under the persistent upload directory.
- Public image access goes through /api/media/[id], which checks site visibility and a visible content reference. Members can preview archived media with private, non-cacheable responses.
- Destination/place archiving never deletes records. Any timeline linked to an archived place and any diary belonging to that place is hidden from public pages and anonymous media access until the place is restored.
- All cover/photo removal flows use `src/lib/media-lifecycle.ts` in the same database transaction as the reference change, then remove files after commit. Shared content, archived content and active drafts retain their referenced assets.
- `scripts/prune-staged-media.mjs` reclaims old unreferenced media and interrupted uploads at startup, and removes expired drafts/sessions.
- Visited places own their stories and photo albums. Trip plans do not control memory creation or deletion. Historical plan-linked memories are preserved, and unassigned stories can be linked to a place from the admin list.
- Expense amounts are stored in the currency's minor unit to avoid floating-point accumulation errors. Add/edit/delete share the same validation and totals are always derived, never entered separately.
- There is no internal `TravelPlanDay`, manually maintained `actualBudget`, payer or receipt subsystem. Upgrade migration `20261106100000_close_lightweight_records` preserves populated legacy values in the `AppSetting` key `legacy_lightweight_20261106` before removing unused columns/tables.
- Backup export takes a SQLite write lock while creating a `VACUUM INTO` snapshot and copying media, then releases it before ZIP compression. Restore validates file hashes and runs only trusted repository migrations against a staged copy before preview. See the [backup guide](PRIVATE-BACKUP-RESTORE.md).

## Database migrations

When changing the Prisma schema, create a new migration and regenerate Prisma Client:

~~~powershell
npx prisma migrate dev --name describe_the_change
npx prisma generate
~~~

Do not edit an already-applied migration. Before changing existing data, consider how the migration behaves on a populated SQLite database. The repository's automated tests use disposable databases; do not point them at a real data/travel.db.

## Quality checks

~~~powershell
npm run lint
npm run typecheck
npm run build
~~~

Additional integration tests:

| Command | Purpose |
| --- | --- |
| npm run test:auth:e2e | Browser login, two-member permissions, expense editing, archive/restore and related stories, shared cover/photo cleanup, public/private access |
| npm run test:import:e2e | Scoped tokens, preview/commit/cancel, CLI, reversible archive updates and reference-aware media cleanup |
| npm run test:production:smoke | Blank database initialization and persistence after restart |
| npm run test:backup:restore | Real export/restore roundtrip, old-schema migration preservation, manifest tampering, account isolation, copy replay and SQLite swap rollback |

test:auth:e2e requires Google Chrome. It uses data/auth-e2e.db, data/auth-e2e-uploads/ and a dedicated Next.js build directory, then cleans them up. The other integration tests also use disposable databases and temporary storage.

## Code conventions

- Add a short Chinese comment above new functions and methods.
- Prefer small, focused components and modules; keep changed source files below 1,000 lines.
- Validate all Server Action inputs on the server, even when the browser already validates them.
- Keep database writes behind authenticated Server Actions or explicitly scoped API tokens.
- Never add real travel records, credentials, personal photos or private deployment settings to fixtures or documentation.
