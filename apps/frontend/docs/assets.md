# Assets (public-files)

The assets manager lets admins upload files that are then publicly served at
`/<dir>/<file>`, where `<dir>` is `public-files` by default (configurable, see below).
Examples below use the default `public-files`.

## The problem

Uploads happen at runtime, after the container starts. Originally they were stored
inside `dist/` (the build output). `bun run build` wipes `dist/` on every deploy, so
all uploaded files disappeared.

## The solution

Store uploads **outside** `dist/`, in a folder backed by a Docker volume.

- **dev:** files go in `apps/frontend/public/public-files/` (served by Vite, kept via
  the repo bind mount).
- **prod:** files go in `apps/frontend/data/public-files/`, which is mounted to a
  Docker volume. The container is thrown away on each deploy; the volume is not, so
  uploads survive.

The volume is only deleted by `docker compose down -v` (the `-v` flag). Normal
deploys, rebuilds, and `down`/`up` keep it.

## How the path is decided

The path is computed from two env vars (see `src/lib/assetDir.ts`):

```
<BASE>/<DIR>   e.g.  ./data/public-files
```

- `HUMANDBS_FRONTEND_PUBLIC_FILES_BASE` = **where** files are stored.
  Default `./public` in dev, `./data` in prod.
- `HUMANDBS_FRONTEND_PUBLIC_FILES_DIR` = the folder name, also the **public URL**
  prefix (`/public-files/`). Default `public-files`.

`assetDir.ts` is the single source of truth: uploads, public serving, and CMS
data-transfer all read the path from there, so they can never point at different
folders.

## Config (prod, `compose.yml`)

```yaml
environment:
  - HUMANDBS_FRONTEND_PUBLIC_FILES_DIR=${HUMANDBS_FRONTEND_PUBLIC_FILES_DIR:-public-files}
  - HUMANDBS_FRONTEND_PUBLIC_FILES_BASE=${HUMANDBS_FRONTEND_PUBLIC_FILES_BASE:-./data}
volumes:
  - public-files-data:/app/apps/frontend/data   # mount path must match BASE
```

`_BASE` is not set in `.env`; the `:-./data` fallback supplies the default.

**Important:** if you change `_BASE`, also change the volume mount path to match,
or uploads stop persisting.

## Files

- `src/lib/assetDir.ts` — resolves the path.
- `src/serverFunctions/assets.ts` — upload / list / delete / rename.
- `server.ts` — serves `/public-files/*` in prod.
