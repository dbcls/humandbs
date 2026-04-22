# Database Scripts

Scripts for seeding, resetting, and initializing the database.

## Scripts

### `seed-documents.ts`

Creates document records from structured markdown files.

```bash
bun run db:seed-documents
```

- Reads from `../seed-data/documents/{locale}/{document}/`
- Supports EN/JP locales, document versioning, and Type I/II security levels
- Only seeds document IDs listed in `CONTENT_IDS` config

**Expected directory structure:**

```
../seed-data/documents/
├── en/
│   └── document-name/
│       ├── content.md
│       └── files...
└── ja/
    └── document-name/
        ├── content.md
        └── files...
```

### `seed-files.ts`

Copies non-`content.md` files from each document's seed folder to `public/<HUMANDBS_FRONTEND_PUBLIC_FILES_DIR>/<documentId>/` (defaults to `public/public-files/<documentId>/`).

```bash
bun run db:seed-files
```

- No DB writes — filesystem only
- Skips files already copied (deduplicates across locales per document)

### `seed-navigation.ts`

Resets and reseeds the site navigation config to the current default.

```bash
bun run db:seed-navigation
```

- Deletes current navigation config rows and revisions
- Seeds active config as `global` (matches the runtime repository key)
- Inserts a fresh revision `1` snapshot

### `seed-news.ts`

Seeds news pages exported from the old Joomla site.

```bash
bun run db:seed-news
bun run db:seed-news -- --overwrite
```

Each JSON entry becomes a `newsItem` with a single `newsTranslation`.

### `seed-content.ts`

Seeds misc pages (policies, old guidelines, etc.) exported from the old Joomla site into `content_item` / `content_translation` tables.

```bash
bun run db:seed-content
bun run db:seed-content -- --overwrite
```

- Pages sharing the same `path` become one `contentItem` with ja/en translations
- Skips existing items by `contentId`; use `--overwrite` to update in place
- Exports `seedContent(pages, overwrite?, db?)` for use in tests

### `reset-db.ts`

Drops all tables entirely.

```bash
bun reset-db.ts       # prompts for confirmation
bun reset-db.ts -y    # skip prompt
```

- Blocked in production
- Drops all tables with CASCADE; run migrations (`bun run db:push`) before seeding again

### `clear-db.ts`

Removes all data while preserving table structure.

```bash
bun run db:clear
bun run db:clear -- --tables=news_item
bun run db:clear -- --tables=news_item,news_translation
```

- Truncates all tables (or specific ones via `--tables=`)
- Resets identity columns; temporarily disables FK constraints during clearing
- Blocked in production

## Testing

```bash
bun test ./src/scripts/database/tests
```

Tests run against a `humandbs_test` database in the existing dev Postgres container. The test setup creates the database, applies the current schema via `drizzle-kit push`, and drops it after all tests complete. `clearTables()` truncates data between tests.

The dev Postgres container must be running and `HUMANDBS_POSTGRES_*` env vars must be set.

## Environment Variables

```bash
HUMANDBS_POSTGRES_USER=
HUMANDBS_POSTGRES_PASSWORD=
HUMANDBS_POSTGRES_HOST=localhost
HUMANDBS_POSTGRES_PORT=5432
HUMANDBS_POSTGRES_DB=
NODE_ENV=development

# Optional: subdirectory name under public/ where files are served from (default: public-files)
# Must match HUMANDBS_FRONTEND_PUBLIC_FILES_DIR set for the frontend server
HUMANDBS_FRONTEND_PUBLIC_FILES_DIR=public-files

# Optional seeding author
SEED_AUTHOR_ID=system-seed
SEED_AUTHOR_EMAIL=seed@example.com
SEED_AUTHOR_NAME="System Seed"
```

## Common Workflows

```bash
# Full reset and reseed
bun run db:fresh  # db:reset && db:push && db:seed-documents

# Quick data refresh
bun run db:clear && bun run db:seed-documents

# Reset navigation only
bun run db:seed-navigation

# Schema updates only
bun run db:push
```
