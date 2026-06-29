# Environment variables

Set these in the root `.env` file. `compose.yml` reads it and passes the values to
the frontend container.

## Required

You must provide these — the app won't work without them.

| Variable | What it is |
| --- | --- |
| `HUMANDBS_ENV` | Environment name (e.g. `development`, `production`). Used in container/volume names. |
| `HUMANDBS_POSTGRES_USER` | CMS database user. |
| `HUMANDBS_POSTGRES_PASSWORD` | CMS database password. |
| `HUMANDBS_POSTGRES_DB` | CMS database name. |
| `HUMANDBS_AUTH_ISSUER_URL` | Login provider URL. |
| `HUMANDBS_AUTH_CLIENT_ID` | Login client id. |
| `HUMANDBS_AUTH_REDIRECT_URI` | Where the login provider sends users back. |
| `HUMANBDS_FRONTEND_DU_APPLICATION_URL` | External "data use" application link. |
| `HUMANDBS_FRONTEND_DS_NAVIGATION_URL` | External submission navigation link. |
| `HUMANDBS_FRONTEND_DS_SUBMISSION_URL` | External submission link. |

## Optional (have defaults)

Leave unset unless you need to change them.

| Variable | Default | What it is |
| --- | --- | --- |
| `HUMANDBS_FRONTEND_PUBLIC_FILES_DIR` | `public-files` | Uploaded-assets folder name / public URL prefix. |
| `HUMANDBS_FRONTEND_PUBLIC_FILES_BASE` | `./data` (prod) | Where uploaded assets are stored. See [assets.md](assets.md). |

## Set automatically by compose (don't touch)

These are fixed to container values in `compose.yml`, no need to set them yourself:
`HUMANDBS_POSTGRES_HOST/PORT`, `HUMANDBS_BACKEND_HOST/PORT/URL_PREFIX`,
`HUMANDBS_FRONTEND_HOST/PORT`, `NODE_ENV`.
