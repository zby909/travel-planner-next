# travelctl

Node.js 22+ CLI for a self-hosted Next.js Travel Planner. Not yet published on npm.

During development:

```bash
npm install -g ./cli
travelctl auth login --server https://your-travel-site.example
travelctl visits list
travelctl destinations list
travelctl media upload ./photo.jpg
travelctl visits prepare ./visits.json
travelctl import commit <draft-id> --confirm
travelctl destinations prepare ./future.json
```

Token is obtained from **Management → AI 授权**. The token is stored in the user's app configuration directory and never echoed into commands or logs. Do not paste secrets into AI conversations.

Import requires an explicit two-step preview and commit, with `--confirm` reserved for after user authorization.
