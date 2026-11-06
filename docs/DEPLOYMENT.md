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

The application listens on container port 3000. The default health endpoint is /api/health. The Compose file mounts ./data to /app/data, which contains the SQLite database and uploaded photos.

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

In public mode, visited-place stories and their photos are visible to visitors. In private mode, travel pages and media require an authenticated member session. A private-mode switch cannot revoke content already copied, downloaded, cached, or indexed by visitors.

## GitHub Actions and GHCR

The Docker workflow runs on pushes to main and manual dispatch. It performs lint, TypeScript checks, production build, blank-install smoke tests, backup/restore tests, and a Linux amd64 container smoke test before pushing the image to:

~~~text
ghcr.io/<owner>/<repository>:latest
~~~

The workflow uses GitHub's GITHUB_TOKEN; no Docker Hub password is required. GHCR package visibility may need to be changed to Public in GitHub Packages settings if an unauthenticated deployment platform must pull the image.

Prefer deploying a fixed SHA tag when reproducibility matters.

## Manual application updates

The repository builds and publishes images; it does **not** automatically deploy to StackNest. After the image build succeeds, manually update the existing application in StackNest or use `stacknest-deploy app deploy` with the existing image address, application-scoped Token file, and current generation. Keep any configured registry proxy prefix. Do not silently switch a configured `:latest` address to another tag or digest.

Before an upgrade, download a current backup from `/admin/restore`. Keep `/app/data` mounted, and never recreate the data volume during an image update. The image applies pending Prisma migrations at startup. A successful container rollback alone does not roll back a database migration.

Wait for the exact deployment generation to become `ready`, then check `/api/health` and the public or members-only pages. Only report success after both task completion and application verification. See [Backup and restore](PRIVATE-BACKUP-RESTORE.md) for recovery.

## Backup and restore

Keep backups outside the source repository. A backup should contain the SQLite database and all required image directories. See [Backup and restore](PRIVATE-BACKUP-RESTORE.md) for the supported ZIP workflow and recovery constraints.

Do not copy or replace a live SQLite database while the application is running. Use the application's backup workflow or a consistent SQLite backup process.
