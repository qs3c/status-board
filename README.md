# Status Board

A tiny local-first web app to record your daily status (Not well / Good / Very good)
with an optional note, shown as a GitHub-style blue heatmap. Data lives in a single
`status.json` file in a GitHub repo so it can sync across devices.

## Use it

Open `index.html` in a browser. It works offline; records are saved in the
browser. To sync across devices, configure GitHub in Settings.

## Set up sync

1. Create a repo to hold your data, public or private, for example `status-data`.
2. Create a GitHub fine-grained personal access token:
   - Repository access: only that one repo.
   - Permissions: Contents: Read and write.
3. In the app, open Settings and fill in:
   - GitHub token.
   - Owner, such as your username.
   - Repo, such as `status-data`.
   - Branch, usually `main`.
   - File path, usually `status.json`.
4. Click Save settings. The app creates or updates `status.json` on submit and
   merges changes from other devices per day. The newest edit of a day wins.

The token is stored only in this browser on this device. A new device needs it
re-entered.

## Optional hosting

Push these files to a repo and enable GitHub Pages, then open the Pages URL on
any device, including your phone.

## Develop

```bash
npm test
```

The test suite uses Node's built-in test runner and has no third-party
dependencies.
