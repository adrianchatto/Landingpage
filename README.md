# Landingpage

Editable homelab landing page inspired by Homepage, seeded from the Ridgeway `services.yaml` config.

## What it does

- Uses a React frontend with a modern dark-first interface.
- Imports the current Homepage service groups as editable pages.
- Lets you add, edit, and delete services from the interface.
- Lets you create new pages for tool collections such as Microsoft, infrastructure, media, or client work.
- Uses dark mode by default, with a light/dark toggle in the sidebar.
- Searches globally when a query is entered, including service metadata such as category, aliases, keywords, notes, page names, and hostnames.
- Uses smart search so vague queries such as `what was that routing solution I built` can find likely matches such as CloudFlare Router.
- Can use OpenRouter AI to auto-fill service descriptions, icon names, widget types, and search metadata.
- Writes app changes back to `data/services.yaml`.
- Syncs service data with GitHub every 15 minutes by default.
- Keeps the original imported YAML files in `data/imports/`.
- Stores live app data in `data/catalog.json`.

Widget credentials from Homepage are not exposed in the browser catalog. Imported services keep only their public URL, description, icon, page group, and widget type.

The imported catalog has initial metadata seeded for each service. For example, searching `storage` returns the NAS services even when you are viewing another page.

## Git sync

Landingpage keeps two live data files:

- `data/catalog.json` powers the UI.
- `data/services.yaml` is the GitHub-editable services file.

When you add or edit a service in the UI, both files are updated. Every 15 minutes the app commits those files, pulls changes from GitHub, imports any GitHub edits to `data/services.yaml`, and pushes the result back up.

You can also press `Sync` in the sidebar to run the same process immediately.

Environment variables:

```bash
GIT_SYNC_ENABLED=true
GIT_SYNC_INTERVAL_MINUTES=15
GIT_SYNC_BRANCH=main
GIT_SYNC_NAME="Landingpage Sync"
GIT_SYNC_EMAIL="landingpage@local"
```

## AI autofill and smart search

Landingpage works without AI, using local smart-search synonyms for common homelab terms such as routing, storage, media, auth, monitoring, DNS, proxy, and tunnels.

Set these environment variables to enable OpenRouter-backed metadata suggestions and richer smart search:

```bash
OPENROUTER_API_KEY="..."
OPENROUTER_MODEL="openai/gpt-4o-mini"
```

The OpenRouter key is used only by the server. It is not sent to the browser or written into `services.yaml`.

If Git reports a conflict or authentication issue, the sidebar sync status changes to `Needs attention` and the API reports the error at `/api/sync/status`.

## Run locally

```bash
npm start
```

Then open [http://localhost:3000](http://localhost:3000).

Set a different port with:

```bash
PORT=8080 npm start
```

## Run with Docker

```bash
docker compose up -d --build
```

Current production deployment:

- Host: `172.22.20.5`
- Container: `landingpage`
- Image: `landingpage:latest`
- Host port: `3021`
- Container port: `3000`
- URL: `http://172.22.20.5:3021`
- Data volume: `landingpage-data:/app/data`
- Git sync in container: disabled by default

Run directly on the Docker host:

```bash
docker run -d \
  --name landingpage \
  --restart unless-stopped \
  -p 3021:3000 \
  -e TZ=Europe/London \
  -e HOST=0.0.0.0 \
  -e PORT=3000 \
  -e GIT_SYNC_ENABLED=false \
  -e GIT_SYNC_INTERVAL_MINUTES=15 \
  -e GIT_SYNC_BRANCH=main \
  -v landingpage-data:/app/data \
  landingpage:latest
```

Or use the included compose file:

```bash
docker compose up -d --build
```

The compose file uses a named volume, `landingpage-data`, so UI edits and synced service data persist across container upgrades.

The Docker container runs the app and persists `/app/data`, but it is not a Git checkout with write credentials. Leave `GIT_SYNC_ENABLED=false` for this normal container deployment. Enable Git sync only when the app is running from a real Git checkout with push credentials available.
