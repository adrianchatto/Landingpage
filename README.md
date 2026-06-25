# Landingpage

Editable homelab landing page inspired by Homepage, seeded from the Ridgeway `services.yaml` config.

## What it does

- Imports the current Homepage service groups as editable pages.
- Lets you add, edit, and delete services from the interface.
- Lets you create new pages for tool collections such as Microsoft, infrastructure, media, or client work.
- Uses dark mode by default, with a light/dark toggle in the sidebar.
- Searches globally when a query is entered, including service metadata such as category, aliases, keywords, notes, page names, and hostnames.
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

The compose file mounts `./data` into the container so services added from the UI persist on the host.
