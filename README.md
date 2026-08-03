# Podcast Aggregator

Pulls recent episodes from a curated list of RSS feeds (NPR, NY Times, Maximum Fun, and others), scores them by keyword relevance against four categories — Science, Entertainment, Art, Politics — and writes a Markdown report grouped by category.

## Setup

```bash
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

On Windows, use `python`, not `python3` (the latter is often just a Store alias with no real interpreter behind it).

## Usage

```bash
python aggregate.py
```

Writes `output/podcast_report_<date>.md` covering episodes published in the last 7 days (the default in `config.json`).

Options:

- `--days N` — override the lookback window for this run only, e.g. `--days 1` for a daily digest or `--days 30` to catch up after a while. Does not modify `config.json`.
- `--html` — also write `output/podcast_report_<date>.html`.
- `--config PATH` — use a different config file (default `config.json`).
- `--output-dir PATH` — write reports somewhere other than `output/` (default `output`).
- `--player-data-dir PATH` — write `episodes.json` somewhere other than `docs/data/` (default `docs/data`).

Re-running on the same day overwrites that day's report rather than creating duplicates. Every run also writes `docs/data/episodes.json`, the machine-readable feed the player PWA (see below) reads — this file is tracked in git (unlike `output/`, which is gitignored) since it needs to be pushed for the phone app to see new episodes.

## Configuring shows and keywords

Edit `config.json`:

- `shows`: each entry needs `name`, `network`, `category` (one of Science/Entertainment/Art/Politics), and `feed_url` (the actual RSS/XML feed, not the show's webpage).
- `keywords`: a list of terms per category used for relevance scoring. Title matches count double a description match. Episodes that don't match any keyword still appear in the report (this ranks, it doesn't filter) — they're just sorted last within their category.
- `lookback_days`: the default window used when `--days` isn't passed.

### Candidate shows not yet included

These were found during research but not independently verified this session — confirm the feed still works before adding:

- **Search Engine** (PJ Vogt) — candidate URL: `https://rss.amperwave.net/v2/feed/audacynetwork/search-engine`

## Scheduling

No scheduler is built in, but the script is safe to run unattended: no interactive prompts, deterministic same-day output, and it always exits 0 (a report noting feed failures is still useful output under a cron/Task Scheduler job, rather than surfacing as a failed run).

Example Windows Task Scheduler action: run `<repo>\.venv\Scripts\python.exe` with argument `aggregate.py`, working directory set to the repo root.

## Error handling

If a feed is unreachable or malformed, that show is skipped and logged — the run continues and the report's "Feed Errors" section lists what failed and why.

## Player PWA

`/docs` is a small installable web app (no build step, no framework — plain HTML/CSS/JS) that reads `docs/data/episodes.json` and lets you download episodes to your phone, play them, and track progress. It's built for Android + Chrome specifically (relies on IndexedDB, the Cache API, and the Media Session API for lock-screen controls). The folder is named `docs/` rather than `player/` because GitHub Pages only allows serving from the repo root or a folder literally named `docs`.

### Publishing workflow

1. Run `python aggregate.py` locally as usual — this regenerates `docs/data/episodes.json` alongside the Markdown report.
2. Review the report, then commit and push, e.g.:
   ```bash
   git add docs/data/episodes.json
   git commit -m "Update episode list"
   git push
   ```
3. GitHub Pages (once enabled, see below) republishes automatically within about a minute of the push — no CI needed.
4. On your phone, open the installed player and tap **Refresh** to pull the new list.

### One-time GitHub Pages setup

1. Push this repo to GitHub if you haven't already.
2. In the repo's Settings → Pages, set **Source** to "Deploy from a branch", branch `main`, folder `/docs`.
3. Wait a minute for the first deploy, then visit the shown URL (`https://<username>.github.io/PodcastScanner/`) on your Android phone in Chrome.
4. Chrome should offer to "Add to Home Screen" / install the app — do that so it behaves like a real app (own icon, no browser chrome).

### How it works

- **Browse vs. Playlist tabs**: "Browse" shows the current `episodes.json` list (all recent episodes, with category/downloaded/unplayed filters). "Playlist" shows only what you've actually added or downloaded, sourced entirely from local IndexedDB — so an episode stays in your playlist even after it ages out of the aggregator's weekly lookback window and disappears from Browse.
- **Downloading**: tapping "Add" on an episode fetches its audio directly from the original podcast host (NPR, NYT, Maximum Fun's CDN, etc.) — GitHub never hosts audio, only the episode list.
- **Storage**: downloaded audio lives in the browser's Cache API; playback state (resume position, played/unplayed, a history log) lives in IndexedDB. Both are local to your phone's browser storage, not synced anywhere.
- **Auto-delete**: when an episode finishes playing, its downloaded audio is deleted immediately to free up space. It stays marked "Played" and remains in your history log.
- **Offline/background**: once downloaded, playback works offline and continues with lock-screen controls while the screen is locked, as long as the browser tab/app isn't fully closed.

### Known limitations to expect

- Chrome may still evict cached audio under storage pressure even though the app requests persistent storage — this is a browser-level heuristic, not something the app controls.
- Background audio stops if you swipe the app away from Recents (expected browser behavior, not a bug).
- Not designed for or tested on iOS Safari, which has much more restrictive PWA storage/background-audio support.
