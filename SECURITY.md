# Security Policy

## Reporting a vulnerability

Please do not report security vulnerabilities through public issues or pull requests.

If GitHub Private Vulnerability Reporting is enabled for this repository, use the repository's **Security → Advisories → Report a vulnerability** flow. Otherwise, contact the repository maintainer privately and include only the minimum information needed to reproduce the issue.

Please do not attach real travel databases, private photographs, passwords, session cookies, or API Tokens to a report.

## Scope

Security-sensitive areas include:

- Member authentication, sessions and role checks
- Public/private site access and media delivery
- Server Actions and API route authorization
- Scoped CLI API Tokens and import confirmation
- Image processing and filesystem paths
- SQLite backup, restore and migration flows
- Docker deployment and bootstrap credentials

## Supported versions

During active development, security fixes are applied to the current development branch. There is no long-term-support release policy yet.
