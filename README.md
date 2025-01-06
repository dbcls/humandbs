# app

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.1.37. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.

## Docker Environment

TODO: update this section

```bash
docker network create humandbs-dev-network
docker compose -f compose.dev.yml up -d --build
docker compose -f compose.dev.yml exec frontend bun run frontend:dev
docker compose -f compose.dev.yml exec frontend bun run backend:dev
```
