# Open-source Release Checklist

This checklist is for the repository maintainer before changing the GitHub repository to Public or publishing a release.

## License and ownership

- [x] Choose MIT for original project code and documentation; add the complete root LICENSE file.
- [x] Align package.json, package-lock.json and cli/package.json license metadata with MIT; include the MIT text in cli/LICENSE for npm distribution.
- [ ] Confirm that fonts, map data, icons, images and other bundled assets may be redistributed under their own terms.
- [ ] Confirm that all source code and dependencies have compatible licenses.
- [ ] Add the full Apache 2.0 license text and applicable NOTICE material for the bundled ECharts file.
- [ ] Verify the offline map geometry source and redistribution license.
- [ ] Keep third-party assets outside the project's MIT grant unless their owners explicitly permit MIT relicensing.

## Private data and repository history

**Known release note (reviewed 2026-11-04):** Git history includes a commit (6758d2c) that removed legacy files from the current tree, but the deleted blobs remain reachable from history/tags. The maintainer has confirmed that the historical travel records do not need to be withheld for privacy reasons. The history still contains third-party photos and incomplete attribution records, so privacy approval does not establish copyright or redistribution rights. See [Third-party assets and license notes](THIRD-PARTY-NOTICES.md).

- [ ] Review historical image assets and their attribution records. The legacy manifest identifies some Wikimedia Commons files as CC BY-SA 3.0 / 4.0, while many entries do not record a complete author/license. Preserve the original license and attribution, or remove assets from history if redistribution rights cannot be established.
- [ ] Verify the provenance and license of public/maps/map-geo-data.js; its header refers to SOURCES.txt, which is not present in the current checkout.
- [ ] Keep the existing Git history only if all historical third-party assets and notices may lawfully remain available. Otherwise, back up the repository and plan a history rewrite or a clean public snapshot before release.
- [ ] Review the current Git index and working tree for .env, database files, uploads, backups, logs, credentials and private deployment configuration.
- [ ] Inspect **all Git history and tags**, not only the current checkout, for personal travel records, photos, old seed files, domains, tokens and credentials.
- [ ] Review GitHub Releases and previously published container images for old private assets.
- [ ] If secrets were ever committed, revoke/rotate them. Removing a file in a later commit is not enough.
- [x] Confirm with the maintainer that historical travel records do not need to be withheld for privacy reasons.
- [ ] Run a dedicated history secret scan (for example, Gitleaks or TruffleHog) across all branches and tags; the current development environment did not have Gitleaks installed.
- [ ] Review issue templates, screenshots, CI logs and documentation for identifying or private information.

## Repository presentation

- [ ] Confirm the repository name, description, topics and default branch.
- [ ] Add screenshots from a clean synthetic installation.
- [ ] Verify Chinese and English README links.
- [ ] Choose a versioning and release-note policy.
- [ ] Decide whether the current CLI npm scope (@zby909/travelctl) should remain or be renamed before any npm publication.
- [ ] Review existing tags (v0.1.0 and v0.1.1) and GitHub Releases if history is rewritten.
- [ ] Enable private vulnerability reporting if available.
- [ ] Decide whether to enable Discussions and issue templates.

## CI and distribution

- [ ] Run lint, typecheck, production build and all relevant integration tests.
- [ ] Verify the Docker workflow on the public repository.
- [ ] Confirm GHCR package visibility and test pulling the published image without credentials if public pulls are intended.
- [ ] Verify a tagged Windows travelctl.exe release and its SHA-256.
- [ ] Confirm the release contains no real user data or secrets.

## Product and privacy review

- [ ] Confirm that public mode is clearly documented as public, including travel diary text and photos.
- [ ] Confirm that private mode protects all travel pages and media routes.
- [ ] Verify the blank installation contains no personal travel records or photos.
- [ ] Review backup/restore instructions and retention expectations.
- [ ] Confirm the two-member account limit and role descriptions are documented.
