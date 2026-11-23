# Deployment Guide

## Docker Compose

Requirements: Docker Engine and Docker Compose.

1. Copy .env.example to .env.
2. Set a unique BOOTSTRAP_ADMIN_PASSWORD (12–128 characters) in the local .env file. Do not commit it.
3. Start the service:

~~~powershell
docker compose up -d --build
docker compose logs -f
~~~

The application listens on container port 3000. The default health endpoint is /api/health. The Compose file mounts ./data to /app/data, which contains SQLite and uploaded photos. Photo uploads use a single request per image with a browser progress bar; no resumable upload state is stored.

The container runs as UID 1001. Ensure the mounted data directory is writable by that user.

## First administrator

On the first start, the container runs pending Prisma migrations. If no account exists and BOOTSTRAP_ADMIN_PASSWORD is configured, it creates the first administrator. Existing accounts and passwords are not overwritten on restart.

After first login:

1. Open /admin/account and set a new password.
2. Remove BOOTSTRAP_ADMIN_PASSWORD from the deployment environment.
3. Restart the container.
4. Create the second member account in /admin/users.

Do not put credentials in a Docker image, GitHub repository, command argument, or issue report.

## StackNest and other container platforms

Use these settings:

| Setting | Value |
| --- | --- |
| Image architecture | Linux amd64 |
| Container port | 3000 |
| Persistent mount target | /app/data |
| Health check | /api/health |
| Container user | UID 1001 |

Configure the bootstrap variables in the platform's secret/environment-variable UI. Use HTTPS through a trusted reverse proxy.

If the reverse proxy rewrites the Host header, configure APP_ORIGIN to the exact public origin (for example, https://travel.example.com). Do not use wildcards or allow a null origin.

## Public and private display

New installations default to public display. The administrator can switch to members-only mode under /admin/settings. The admin area always requires a member session.

In public mode, visited-place details, notes, and their photos are visible to visitors. In private mode, travel pages and media require an authenticated member session. A private-mode switch cannot revoke content already copied, downloaded, cached, or indexed by visitors.

## GitHub Actions and GHCR

The Docker workflow runs on pushes to main and manual dispatch. It performs lint, TypeScript checks, production build, historical visit-migration preservation tests, initial admin bootstrap tests, CLI/import E2E tests, browser auth/visit/album E2E tests, blank-install smoke tests, backup/restore tests, and a Linux amd64 container smoke test before pushing images from `main` to:

~~~text
ghcr.io/<owner>/<repository>:latest
~~~

The workflow uses GitHub's GITHUB_TOKEN; no Docker Hub password is required. GHCR package visibility may need to be changed to Public in GitHub Packages settings if an unauthenticated deployment platform must pull the image.

Prefer deploying a fixed SHA tag when reproducibility matters.

## Manual application updates

The repository builds and publishes images; it does **not** automatically deploy to StackNest. After the image build succeeds, manually update the existing application in StackNest or use `stacknest-deploy app deploy` with the existing image address, application-scoped Token file, and current generation. Keep any configured registry proxy prefix. Do not silently switch a configured `:latest` address to another tag or digest.

Before an upgrade, download a current backup from `/admin/restore`, including SQLite and the uploads directory. Keep the existing volume mounted at `/app/data` during the image update. The image applies pending Prisma migrations at startup. Migration `20261116090000_multiple_place_visits` moves date descriptions and companions to visit records while preserving existing journal and photo IDs. Databases that still need the earlier one-note migration get a pre-migration SQLite snapshot in `/app/data/pre-migration-backups/`. Rolling back across schema versions also requires the matching database and media backup.

Migration `20261117090000_photo_editorial_and_visit_safety` adds journal and album revisions, reversible visit deletion, photo dimensions, homepage selections and cover focus. Existing visits start with revision zero and remain active. Existing images retain their files and fall back to an uncropped preview when dimensions are unknown. Web backups support ZIPs up to 512 MiB with file-backed download and chunked restore.

Wait for the exact deployment generation to become `ready`, then check `/api/health` and the public or members-only pages. Only report success after both task completion and application verification. See [Backup and restore](PRIVATE-BACKUP-RESTORE.md) for recovery.

## Backup and restore

Keep backups outside the source repository. A backup should contain the SQLite database and all required image directories. See [Backup and restore](PRIVATE-BACKUP-RESTORE.md) for the supported ZIP workflow and recovery constraints.

Do not copy or replace a live SQLite database while the application is running. Use the application's backup workflow or a consistent SQLite backup process.
