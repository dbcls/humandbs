# Environment variables

Set these in the root `.env` file. `compose.yml` reads it and passes the values to
the frontend container.

## Required

You must provide these — the app won't work without them.

| Variable                               | What it is                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| `HUMANDBS_ENV`                         | Environment name (e.g. `development`, `production`). Used in container/volume names. |
| `HUMANDBS_POSTGRES_USER`               | CMS database user.                                                                   |
| `HUMANDBS_POSTGRES_PASSWORD`           | CMS database password.                                                               |
| `HUMANDBS_POSTGRES_DB`                 | CMS database name.                                                                   |
| `HUMANDBS_AUTH_ISSUER_URL`             | Login provider URL.                                                                  |
| `HUMANDBS_AUTH_CLIENT_ID`              | Login client id.                                                                     |
| `HUMANDBS_AUTH_REDIRECT_URI`           | Where the login provider sends users back.                                           |
| `HUMANDBS_FRONTEND_DU_APPLICATION_URL` | External "data use" application link.                                                |

## Optional (have defaults)

Leave unset unless you need to change them.

| Variable                              | Default         | What it is                                                    |
| ------------------------------------- | --------------- | ------------------------------------------------------------- |
| `HUMANDBS_FRONTEND_PUBLIC_FILES_DIR`  | `public-files`  | Uploaded-assets folder name / public URL prefix.              |
| `HUMANDBS_FRONTEND_PUBLIC_FILES_BASE` | `./data` (prod) | Where uploaded assets are stored. See [assets.md](assets.md). |

## Observability

The frontend writes structured JSON logs to stdout. These optional variables tune its local volume
controls; no remote telemetry endpoint is configured.

| Variable | Default | What it is |
| --- | --- | --- |
| `OTEL_SERVICE_NAME` | `humandbs-frontend` | Service identifier on every record. |
| `OTEL_SERVICE_VERSION` | package version or `unknown` | Release identifier on every record. |
| `OBSERVABILITY_LOG_LEVEL` | `info` | Minimum emitted level: `debug`, `info`, `warn`, `error`, or `fatal`. |
| `OBSERVABILITY_SAMPLE_RATE` | `1` in development, `0.1` in production | Deterministic rate for document views, successful backend calls, and repeated errors. |
| `OBSERVABILITY_CLIENT_ERROR_MAX_BYTES` | `4096` | Maximum accepted browser error-report payload size. |
| `OBSERVABILITY_CLIENT_ERROR_RATE_LIMIT` | `20` | Browser reports allowed per client window. |
| `OBSERVABILITY_CLIENT_ERROR_RATE_WINDOW_MS` | `60000` | Browser-report rate-limit window. |
| `OBSERVABILITY_ERROR_FINGERPRINT_CACHE_SIZE` | `1000` | Maximum in-memory first-error fingerprint entries. |
| `OBSERVABILITY_ERROR_FINGERPRINT_TTL_MS` | `3600000` | How long a fingerprint is retained to preserve its first occurrence. |

## Set automatically by compose (don't touch)

These are fixed to container values in `compose.yml`, no need to set them yourself:
`HUMANDBS_POSTGRES_HOST/PORT`, `HUMANDBS_BACKEND_HOST/PORT/URL_PREFIX`,
`HUMANDBS_FRONTEND_HOST/PORT`, `NODE_ENV`.
