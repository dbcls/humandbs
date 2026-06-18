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
- Seeds all documents found under `seed-data/documents/{locale}/` — any directory containing a `content.md` becomes a document
- Does not modify site navigation; run `bun run db:seed-navigation` separately if nav should be rebuilt

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

Copies non-`content.md` files from each document's seed folder to `public/<HUMANDBS_FRONTEND_PUBLIC_FILES_DIR>/<contentId>/` (defaults to `public/public-files/<contentId>/`).

```bash
bun run db:seed-files
```

- No DB writes — filesystem only
- Supports nested document paths such as `guidelines/data-sharing-guidelines`
- Skips files already copied (deduplicates across locales per document)

### `seed-navigation.ts`

Resets and reseeds the site navigation config from the current documents in the database.

```bash
bun run db:seed-navigation
```

- Deletes current navigation config rows and revisions
- Rebuilds document-backed navbar/footer items from current document `contentId` structure
- Uses document UUIDs as canonical navigation item IDs for document entries
- Root segment grouping rule:
  - navbar: `a`, `a/b`, and `a/b/c` all belong to the `a` group
  - footer: same grouping rule
- Reuses static link items and default group labels where available
- Inserts a fresh revision `1` snapshot

### `seed-news.ts`

Seeds news pages exported from the old Joomla site.

```bash
bun run db:seed-news
bun run db:seed-news -- --overwrite
```

Each JSON entry becomes a `newsItem` with a single `newsTranslation`.

### `seed-guideline-versions.ts`

Seeds historical versions of the four guideline documents from `misc-pages.json`. Must run after `seed-documents.ts`.

```bash
bun run db:seed-guideline-versions
bun run db:seed-guideline-versions -- --overwrite
```

- Inserts historical versions (v1…vN) for `guidelines/data-sharing-guidelines`, `guidelines/security-guidelines-for-dbcenters`, `guidelines/security-guidelines-for-submitters`, and `guidelines/security-guidelines-for-users`
- Source slugs contain dirty data (mismatched version numbers, EN/JA split across different slug names); the mapping is hardcoded in the script
- Pre-existing versions already in the DB (e.g. seeded from disk by `seed-documents.ts`) are renumbered upward to sit above the historical versions — their content is not changed
- Skips existing rows by default; use `--overwrite` to update title/content in place

### `seed-content.ts`

Seeds misc pages (policies, old guidelines, etc.) exported from the old Joomla site into `content_item` / `content_translation` tables.

```bash
bun run db:seed-content
bun run db:seed-content -- --overwrite
```

- Pages sharing the same `path` become one `contentItem` with ja/en translations
- Skips existing items by `contentId`; use `--overwrite` to update in place
- Exports `seedContent(pages, overwrite?, db?)` for use in tests

### `migrate-content-items-to-documents.ts`

Migrates all `content_item` records into `document` / `document_version` tables. Run after `seed-content.ts`.

```bash
bun run src/scripts/database/migrate-content-items-to-documents.ts
bun run src/scripts/database/migrate-content-items-to-documents.ts --overwrite
```

- Each content item becomes a `document` with `hideFromNav: true` (excluded from the header/footer nav item picker)
- Each translation (published and draft) becomes a `document_version` at `versionNumber: 1`, preserving the original status
- `hideTOC` is carried over from the content item
- `publishedAt` is set from `contentItem.publishedAt` for published translations
- Guideline version archives (`data-sharing-guidelines-v1`, etc.) and revision changelogs (`guideline-revision*`) are skipped — handled by `seed-guideline-versions.ts`
- Skips items where a document with the same `contentId` already exists; use `--overwrite` to update in place

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

Tests run against an in-memory PGlite database. The test fixture creates a fresh PGlite-backed Drizzle instance per test file, bootstraps the current test schema, and `clearTables()` truncates data between tests.

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
bun run db:reset -y
bun run db:push
bun run db:seed-all

# Quick data refresh
bun run db:clear
bun run db:seed-documents
bun run db:seed-files
bun run db:seed-navigation

# Reset navigation only
bun run db:seed-navigation

# Documents only
bun run db:seed-documents

# Documents changed, then rebuild nav from them
bun run db:seed-documents
bun run db:seed-navigation

# Schema updates only
bun run db:push
```

`db:seed-all` currently runs in this order:

```bash
bun run db:seed-documents
bun run db:seed-guideline-versions
bun run db:seed-files
bun run db:seed-navigation
bun run db:seed-news
bun run db:seed-content
bun run db:seed-navigation-flowcharts
```
