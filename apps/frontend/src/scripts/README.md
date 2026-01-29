# Scripts Directory

This directory contains all utility scripts for the NBDC Human Database project, organized by function and purpose.

## Directory Structure

```
scripts/
├── README.md              # This file
├── database/              # Database management scripts
│   ├── README.md
│   ├── reset-db.ts        # Database reset utility
│   └── seed-documents.ts  # Document and asset seeding
├── crawler/               # Web crawling and scraping
│   ├── README.md
│   ├── crawl-page.ts     # HTML to markdown converter
│   └── output/            # Generated crawler output (git-ignored)
│       ├── *.md          # Converted markdown files
│       └── *_files/      # Downloaded assets
└── seed-data/             # Structured data for seeding
    ├── README.md
    ├── .gitignore        # Only tracks .md files
    └── documents/        # Organized content by locale
        ├── en/           # English content
        └── ja/           # Japanese content
```

## Quick Start

### Database Operations

```bash
# Reset database (development only)
bun run db:reset

# Seed documents and assets
bun run seed:documents
```

### Web Crawling

```bash
# Single page conversion
bun crawler/crawl-page.ts -u "https://example.com" -o documents
# Saves to: crawler/output/documents/example/content.md

# Bulk sitemap crawling (recommended)
bun run crawl:sitemap --dry-run          # Preview what would be crawled
bun run crawl:sitemap                    # Crawl entire sitemap
bun run crawl:sitemap --files-only       # Download assets only

# Attachment aggregation (new!)
bun run aggregate-attachments --dry-run  # Preview what would be analyzed
bun run aggregate-attachments            # Generate CSV inventory
bun run aggregate-attachments --output audit.csv # Custom output filename

# Download assets only from single page
bun crawler/crawl-page.ts -u "https://example.com" -f -o documents
# Downloads to: crawler/output/documents/example/
```

## Components Overview

### 🗄️ Database Scripts (`database/`)

Manages database operations including seeding, resetting, and content management.

**Key Features:**

- Multi-locale document seeding
- Asset management and processing
- Database schema management
- Production safety controls

**Common Commands:**

- `bun run db:reset` - Reset database (dev only)
- `bun run seed:documents` - Seed documents, content and assets

### 🕷️ Crawler Scripts (`crawler/`)

Web scraping tools for extracting and converting content from websites.

**Key Features:**

- HTML to markdown conversion
- Automatic asset downloading
- Multiple operation modes
- Callout block processing
- Bulk sitemap crawling
- **Attachment inventory aggregation**
- Multi-language support (en/ja)
- Concurrent processing with rate limiting
- CSV export capabilities

**Common Commands:**

- Single page: `bun crawler/crawl-page.ts -u "URL" -o documents`
- Bulk crawl: `bun run crawl:sitemap --concurrency 3`
- Preview: `bun run crawl:sitemap --dry-run`
- Assets only: `bun crawler/crawl-page.ts -u "URL" -f -o documents`
- **Attachment inventory: `bun run aggregate-attachments --output attachments.csv`**

### 📁 Seed Data (`seed-data/`)

Structured content and assets for database seeding.

**Key Features:**

- Multi-language support (en/ja)
- Git-managed markdown content
- Organized asset structure
- Frontmatter metadata support

## Workflow

### 1. Content Analysis & Planning

```bash
# Option A: Start with attachment inventory (recommended)
bun run aggregate-attachments --dry-run  # Preview what will be analyzed
bun run aggregate-attachments --output site-inventory.csv
# Analyze CSV to understand site structure and plan migration

# Option B: Bulk crawl entire sitemap (after analysis)
bun run crawl:sitemap --dry-run          # Preview first
bun run crawl:sitemap                    # Crawl all pages
# Output: crawler/output/documents/en/*/content.md
#         crawler/output/documents/ja/*/content.md

# Option C: Single page crawl (targeted approach)
bun crawler/crawl-page.ts -u "https://source.com/page" -o temp/en
# Output: crawler/output/temp/en/page/content.md

# Option D: Manual creation
mkdir -p seed-data/documents/en/new-document
echo "---\ntitle: New Document\n---\n\n# Content" > seed-data/documents/en/new-document/content.md
```

### 2. Content Organization

```bash
# Review crawled output
ls crawler/output/

# For sitemap crawl - move entire language directories
mv crawler/output/documents/en/* seed-data/documents/en/
mv crawler/output/documents/ja/* seed-data/documents/ja/

# For single page - move individual directory
mv crawler/output/temp/en/page seed-data/documents/en/
# This moves the entire directory with content.md and assets
```

### 3. Database Integration

```bash
# Seed into database
bun run seed:documents

# Verify in application
bun run dev
```

## Environment Setup

### Required Variables

```bash
POSTGRES_USER=your_db_user
POSTGRES_PASSWORD=your_db_password
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=your_database_name
NODE_ENV=development
```

### Optional Variables

```bash
SEED_AUTHOR_ID=system-seed
SEED_AUTHOR_EMAIL=seed@example.com
SEED_AUTHOR_NAME="System Seed"
```

## File Management

### Git Tracking Strategy

- ✅ **Tracked:** Markdown content files, documentation, scripts
- ❌ **Ignored:** Binary assets, generated output, downloaded files

### Asset Handling

- **Source Location:** `seed-data/documents/{locale}/{document}/`
- **Processing Target:** `../../public/assets/`
- **Database Records:** Stored in `asset` table with metadata

## Best Practices

### Content Management

1. **Plan with attachment inventory** - Run aggregate-attachments first to understand site structure
2. **Use structured approach** - Follow established directory patterns
3. **Test locally first** - Validate content through seeding process
4. **Review before seeding** - Check crawled content quality
5. **Maintain consistency** - Keep parallel locale structures
6. **Analyze before migration** - Use CSV data to prioritize content

### Database Operations

1. **Backup first** - Always backup before destructive operations
2. **Check environment** - Verify NODE_ENV before database resets
3. **Monitor logs** - Watch for errors during seeding
4. **Test incrementally** - Seed documents individually when debugging

### Development Workflow

1. **Analyze attachments** → **Plan migration** → **Crawl content** → **Review output** → **Organize structure** → **Seed database**
2. Start with `bun run aggregate-attachments` to understand site structure
3. Use CSV data to prioritize which pages/files to migrate
4. Use files-only mode for quick asset collection
5. Leverage multi-language structure for internationalization
6. Keep assets organized with their related content

## Troubleshooting

### Common Issues

**Database Errors:**

- Check environment variables and database connectivity
- Verify user permissions and database existence
- Review error logs for specific failures

**Seeding Failures:**

- Validate markdown frontmatter syntax
- Check asset file existence and permissions
- Ensure proper directory structure

**Crawler Issues:**

- Verify network connectivity and URL accessibility
- Check for rate limiting or access restrictions
- Review target HTML structure changes
- Use attachment aggregation to verify which pages have downloadable content

**CSV Export Issues:**

- Check output file permissions and disk space
- Verify CSV opens correctly in spreadsheet applications
- Review attachment URLs for accessibility

### Getting Help

1. **Check relevant README** - Each directory has specific documentation
2. **Review error logs** - Scripts provide detailed output
3. **Validate environment** - Ensure all required variables are set
4. **Test incrementally** - Isolate problems by testing components separately

## Contributing

When adding new scripts or content:

1. **Follow directory structure** - Place scripts in appropriate subdirectories
2. **Update documentation** - Add README entries for new functionality
3. **Test thoroughly** - Verify scripts work in clean environment
4. **Consider git tracking** - Update .gitignore for new file types
5. **Document dependencies** - Note any new requirements or setup steps
