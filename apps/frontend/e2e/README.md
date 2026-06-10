# e2e tests for frontend

Completely separate from the monorepo, and added to root dockerignore to keep images smaller.

To install dependencies:

```bash
bun install
```

# Running

Run all tests:

```bash
bun run test
```

# Running tests

Before running tests, create `.env` file with this content.

```
E2E_USERNAME=ts-humandbs-dev
E2E_PASSWORD=<dev password>
```
