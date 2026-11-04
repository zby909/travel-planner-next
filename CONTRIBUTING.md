# Contributing

Thanks for considering a contribution.

The project is under active development. Before starting a large change, open an issue or discussion so the scope and direction can be agreed on.

## Development setup

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for prerequisites, local setup, architecture and test commands.

At minimum, run:

~~~powershell
npm ci
npx prisma generate
npm run lint
npm run typecheck
npm run build
~~~

For changes to authentication, permissions, media, travel plans, expenses, diaries or migrations, run the relevant integration tests as well.

## Pull requests

- Keep changes focused and explain the user-facing behavior.
- Add or update tests for behavior changes.
- Add Prisma migrations for schema changes; do not rewrite migrations that may already have been applied.
- Keep server-side validation and permission checks. Browser validation alone is not sufficient.
- Add short Chinese comments above new functions and methods.
- Keep changed source files below 1,000 lines; split large components by responsibility.
- Update the README or relevant docs when setup, deployment, privacy or CLI behavior changes.

## Protect private data

Use synthetic fixtures only. Do not include real travel records, personal photos, names, account credentials, API tokens, private URLs, database files, backup archives, or local environment files in commits, screenshots, tests or issue reports.

If a test needs images, generate synthetic images during the test and use a disposable upload directory.
