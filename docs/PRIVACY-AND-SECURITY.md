# Privacy and Security

## Data ownership and isolation

Each deployment is an independent travel space with its own SQLite database and upload directory. The repository and generic Docker image should contain application code and generic assets only, not a deployer's travel records or photographs.

Runtime data is stored under data/ locally or /app/data in Docker:

- travel.db: travel content, member accounts, settings, audit records and media metadata.
- uploads/: processed WebP images.
- Backup and restore staging files: temporary files managed by the application.

Do not commit runtime databases, uploads, local environment files, CLI credentials, or private backups.

## Site visibility

Fresh installations default to **PUBLIC** display:

- The home page, destination pages, visited archive, travel diary archive, and linked public photos can be browsed without login.
- The admin area always requires a valid member session.
- Future trip plans, planned budgets and external guide links remain in the authenticated admin area.

The administrator can switch to **PRIVATE** mode. Private mode requires an authenticated member session for travel pages and media. Health checks and properly scoped CLI API tokens continue to work independently of public page visibility.

A visibility switch is not a way to revoke content already copied, downloaded, cached, or indexed by visitors.

## Member accounts and permissions

A site supports up to two member accounts:

- ADMIN: site settings, account management, backup/restore and travel content.
- EDITOR: shared travel content management, without administrator-only operations.

There is no public registration endpoint. Each member has a separate password and session. Passwords are stored as salted scrypt hashes; session tokens are stored as SHA-256 hashes. Login attempts are throttled and privileged changes are audited.

## Photo processing

Direct uploads and CLI uploads accept static JPEG, PNG and WebP images. The server validates the actual image format, limits pixel count, rotates according to orientation, resizes and converts to WebP, and removes EXIF/GPS metadata.

Travel diary photos use managed media records and the same site-visibility gate as other uploaded images. Do not upload photos of other people without appropriate permission.

## API tokens

CLI API Tokens are scoped, revocable, bound to the creating member, and stored in the database as hashes. A newly created token is displayed once. Do not paste it into chat, an AI prompt, a command-line argument, source code, screenshots, or issue reports.

## Deployment

- Use HTTPS in production.
- Keep BOOTSTRAP_ADMIN_PASSWORD out of source control and remove it from deployment settings after initial setup.
- Keep SQLite and uploads in a persistent data volume.
- Back up the database and all required image directories together.
- Restrict access to backup ZIP files; backups may contain password hashes, account data, private diaries and photographs.
- Never place SQLite databases or uploaded files under public/.

## Reporting a vulnerability

Please follow [SECURITY.md](../SECURITY.md). Avoid publishing exploit details or private travel data in public issues.
