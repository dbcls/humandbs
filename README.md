# HumanDBs

This is the development repository for HumanDBs. The application description will be added later.
Currently, this document focuses on development-related information.

## Network Architecture

```
[Internet]
    |
    v
+-------------------------------------------------------+
|  nginx (port 80)                                      |
|  ${HUMANDBS_NGINX_BIND_HOST}:${HUMANDBS_NGINX_PORT}   |
+-------------------------------------------------------+
    |
    +--- /api/* ------> backend:8080
    |                       |
    |                       +---> elasticsearch:9200
    |                       |
    |                       +---> Auth (OIDC IdP)
    |
    +--- /* ----------> frontend:3000
                            |
                            +---> backend:8080 (API calls)
                            |
                            +---> cms-db:5432 (PostgreSQL)
                            |
                            +---> Auth (OIDC IdP)
```

- **External access**: Only nginx is exposed
- **Internal communication**: All services communicate via Docker network using service names

## Development Environment

### Prerequisites

- Docker / Docker Compose
- (Optional) Podman / podman-compose

### Quick Start

```bash
# Create network (first time only)
docker network create humandbs-network

# Setup environment
cp env.dev .env

# Start containers
docker compose up -d --build

# Enter backend container
docker compose exec backend bash

# Enter frontend container
docker compose exec frontend bash
```

### With Podman

```bash
cp env.dev .env
podman-compose -f compose.yml -f compose.override.podman.yml up -d
```

### Environment Files

| File | Description |
|------|-------------|
| `env.dev` | Development (localhost, no password required) |
| `env.staging` | Staging (password required) |
| `env.production` | Production (password required) |

Copy one of these to `.env` before running `docker compose`.

## Bun (npm) package

`Bun` is used as the runtime.

There is a `package.json` at the root level as well as within each workspace.
Common dependencies across workspaces should be listed in the root `package.json`, while workspace-specific dependencies belong in the respective workspace's `package.json`.

---

**Note that `node_modules` is not shared between the container and the host.**
Therefore, if your editor (e.g., VSCode) requires `node_modules` on the host side, you will need to run:

```bash
bun install --frozen-lockfile
```

---

If you want to install a package, first run the following **inside the container**:

```bash
bun install <some-package>
```

(This will update `package.json` and `bun.lockb`.)

Then, on the host side, run:

```bash
bun install --frozen-lockfile
```

This ensures `node_modules` is updated properly on the host as well.

## ESLint

Shared ESLint configuration is defined in `./packages/eslint-config`.
Each workspace (e.g., `apps/backend`) can create its own `eslint.config.js`, importing the shared configuration as needed.
