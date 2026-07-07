# Status Board — Design

A tiny local-first web app for recording a daily status (three levels) with an
optional note, visualized as a GitHub-style contribution heatmap. Data lives in
a single JSON file synced through a GitHub repository, so the same records are
available across devices.

- Date: 2026-07-07
- Location: `E:\fromGithub\mood-board` (standalone project, own git repo)
- Stack: plain HTML/CSS/JS, no build step

## Goals

- Record one status per day: `not_well`, `good`, or `very_good`, plus an optional note.
- Overwrite today's entry, and backfill/edit any past day by clicking its cell.
- Show a GitHub-style yearly heatmap: blue single-hue scale, light → dark for
  Not well → Very good; empty (no record) is a neutral gray cell.
- Work offline (local-first) and sync across devices using a GitHub repo as cloud
  storage for one file, `status.json`.
- Support both public and private repos, chosen by the user in settings.

## Non-goals (YAGNI)

- No accounts, backend server, or database.
- No multiple entries per day, no per-day history/audit trail.
- No collaboration between different users on one board.
- No framework, bundler, or package manager.

## Architecture

```
Browser (UI + localStorage cache)  ⇄  GitHub Contents API  ⇄  repo/status.json
```

- The browser is the whole app. `localStorage` holds a local cache so the app
  opens instantly and works offline (local-first).
- The source of truth is `status.json` in the user's GitHub repo. On open the app
  pulls it and merges with the local cache; on submit it writes the merged result back.
- Sync is per-day merge (see Sync logic), so two devices editing different days
  combine cleanly.

## UI

Single page, three parts:

1. Today card — heading with today's date, three status buttons
   (Not well / Good / Very good), an optional note textarea, a "Submit today"
   button, and a small sync-status line.
2. Board card — the yearly heatmap, one cell per day. Colors:
   - Not well = light blue (`#B5D4F4`)
   - Good = mid blue (`#378ADD`)
   - Very good = dark blue (`#0C447C`)
   - No record = neutral gray cell
   Clicking any cell opens that day for view / backfill / edit (covers the
   "edit past days" requirement). A legend shows the scale and the "no record" swatch.
3. Settings — entry to configure GitHub token, `owner/repo`, branch, and file path.

Layout matches the approved mockups (`mood_board_main_screen_mockup`,
`status_board_blue_mockup`).

## Data model / file format

The repo holds one file, `status.json`:

```json
{
  "version": 1,
  "entries": {
    "2026-07-07": {
      "level": "very_good",
      "note": "today was good",
      "updatedAt": "2026-07-07T12:34:56Z"
    }
  }
}
```

- Key is the local date `YYYY-MM-DD`; exactly one entry per day.
- `level` is one of `not_well | good | very_good`.
- `note` is optional plain text.
- `updatedAt` is an ISO-8601 UTC timestamp used to resolve merges.
- Editing a past day writes to that day's key.

## Sync logic (the critical part)

Read:
- On open, `GET /repos/{owner}/{repo}/contents/{path}?ref={branch}` to fetch
  `status.json`, keeping both its decoded content and its `sha`.
- Public repos can be read without a token (optional optimization). Writing always
  needs a token.

Merge (per day):
- Combine remote `entries` with local `entries` keyed by date.
- If both have the same day, keep the one with the newer `updatedAt`.
- Days present on only one side are kept as-is.
- The merged result is written to the local cache and used for the next write.

Write:
- On submit, apply the change locally (set `updatedAt = now`), merge, then
  `PUT /repos/{owner}/{repo}/contents/{path}` with the merged JSON (base64) and the
  most recent `sha`.

Conflict fallback:
- If `PUT` returns 409 (stale `sha` — another device wrote in between), re-fetch,
  re-merge, and retry the write. Cap at a few retries, then surface an error.

## Settings and token security

- Token, `owner/repo`, branch, and path are stored in `localStorage` only; nothing
  is sent anywhere except GitHub's API.
- Recommend a GitHub fine-grained PAT scoped to the single repo with
  `Contents: Read and write`, to minimize exposure.
- Settings UI states clearly that the token lives in this browser on this device,
  and a new device needs it re-entered.

## Project structure

```
mood-board/
  index.html        # page skeleton
  css/styles.css    # styles, color variables, light/dark
  js/app.js         # main flow, events, render coordination
  js/store.js       # local storage + data model + per-day merge
  js/github.js      # GitHub API read/write wrapper (encode/decode, sha, retry)
  js/heatmap.js     # board rendering
  README.md         # how to create the token and enable Pages
```

## Testing

- Extract the risky pure logic — the per-day merge in `store.js` and the
  base64 encode/decode in `github.js` — as pure functions and cover them with unit
  tests (a minimal browser test page or Node), focusing on per-day merge and the
  409 retry/merge path.
- UI is verified manually.

## Open decisions (resolved)

- Labels: Not well / Good / Very good.
- Color scale: blue single hue (light → dark).
- File name: `status.json`.
- Granularity: one entry per day, overwrite today, backfill/edit past days.
- Storage model: local-first, per-day merge, newest `updatedAt` wins.
- Repo visibility: user-configurable (public or private).
