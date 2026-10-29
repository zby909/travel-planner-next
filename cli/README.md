# travelctl

Standalone Windows executable (Node.js runtime bundled) for a self-hosted Next.js Travel Planner. npm is not required.

Download `travelctl.exe` directly from the [GitHub Releases](https://github.com/zby909/travel-planner-next/releases) page. Keep it in a permanent folder and add that folder to your PATH, or call the executable by its absolute path. You do **not** need npm or a separate Node.js install.

For source development only:

```bash
npm install -g ./cli
travelctl auth login
# The CLI prompts for your website URL and hides your API Token input.
# Or skip the URL prompt with:
travelctl auth login --server https://your-travel-site.example
travelctl auth status
travelctl visits list
travelctl destinations list
travelctl media upload ./photo.jpg
travelctl visits prepare ./visits.json
travelctl import commit <draft-id> --confirm
travelctl destinations prepare ./future.json
```

The Token is generated in **Management → AI 授权**. After CLI validation, the website origin and Token are saved in the current user's local profile:
- Windows: `%APPDATA%\travelctl\config.json`
- Linux/macOS: `$XDG_CONFIG_HOME/travelctl/config.json` or `~/.config/travelctl/config.json`

**Security:** This version stores a local credentials file, not an encrypted OS keychain. Protect your user account; never commit or share this file and never paste Tokens into AI chats, CLI arguments or Skill files. Once logged in, the Skill should check `travelctl auth status` and avoid asking for the URL or Token again unless expired/revoked or switching sites.

Import requires an explicit two-step preview and commit, with `--confirm` reserved for after user authorization.
