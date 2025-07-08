# HumanDBs

This is the development repository for HumanDBs. The application description will be added later.
Currently, this document focuses on development-related information.

## Development Environment

As defined in [./package.json](./package.json), there are two workspaces: `apps/frontend` and `apps/backend`.

Using Docker, you can enter the development environment with the following commands:

```bash
docker network create humandbs-dev-network
docker compose -f compose.dev.yml up -d --build
docker compose -f compose.dev.yml exec backend bash
docker compose -f compose.dev.yml exec frontend bash
```

Since the host's root directory is mounted directly into the container (refer to [docker-compose.dev.yml](./docker-compose.dev.yml)), any changes made on the host side are immediately reflected inside the container.

### Bun (npm) package

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

### ESLint

Shared ESLint configuration is defined in `./packages/eslint-config`.
Each workspace (e.g., `apps/backend`) can create its own `eslint.config.js`, importing the shared configuration as needed.

### Environment variables

1. `cd` into `apps/frontend`

2. Copy `.env.example` to new `.env` file:

```bash
cp .env.example .env
```

3. Fill in your own GitHub credentials (and any other secrets).
4. Run `docker compose -f compose.dev.yml up -d --build`
   That would build and run docker containers.
5. Enter the container's sh:

```bash
docker exec -it <container_id> sh
```

6. In the container's sh, run `bun run front:dev` from the root.

> For running the `docker compose` , entering the `frontent`'s container's `sh` and `cd`-ing into `apps/frontend` folder, use shourtcut command

```bash
bun run front:sh
```

Then run the frontend with `bun run dev`
