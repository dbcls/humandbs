# Database Scripts

This directory contains scripts for managing database operations, including seeding, resetting, and initializing the NBDC Human Database.

## Scripts Overview

### `seed-documents.ts`

Comprehensive document seeding script that processes structured markdown files and manages associated assets.

**Usage:**

```bash
bun run seed:documents
# or run directly with:
bun seed-documents.ts
```

**Features:**

- **Document creation** - Creates document records from content configuration
- **Multi-locale support** (English/Japanese)
- **Asset management** for images and documents
- **Document versioning** with translation support
- **Security level handling** (Type I/Type II)
- **Automatic image URL rewriting** to local asset paths
- **MIME type detection** for various file formats
- **Content validation** - Only seeds document IDs from CONTENT_IDS configuration

**Expected Directory Structure:**

```
../seed-data/documents/
├── en/                     # English content
│   └── document-name/
│       ├── content.md      # Markdown content with frontmatter
│       ├── image1.png      # Associated images
│       └── file.xlsx       # Associated documents
└── ja/                     # Japanese content
    └── document-name/
        ├── content.md
        └── assets...
```

### `reset-db.ts`

Database reset utility that clears all data and reinitializes the schema.

**Usage:**

```bash
bun run db:reset
# or run directly with:
bun reset-db.ts
```

**Safety Features:**

- **Production protection** - Automatically prevents execution in production
- **Complete data removal** - Drops and recreates all tables
- **Schema reinitialization** - Applies latest database schema

⚠️ **Warning:** This script will permanently delete all data. Use with extreme caution.

## Database Configuration

### Required Environment Variables

```bash
POSTGRES_USER=your_db_user
POSTGRES_PASSWORD=your_db_password
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=your_database_name
NODE_ENV=development
```

### Optional Seeding Variables

```bash
SEED_AUTHOR_ID=system-seed
SEED_AUTHOR_EMAIL=seed@example.com
SEED_AUTHOR_NAME="System Seed"
```

## Workflow

### Initial Setup

```bash
# 1. Set up environment variables
cp .env.example .env
# Edit .env with your database credentials

# 2. Reset database (development only)
bun run db:reset

# 3. Seed documents and assets (creates documents + content)
bun run seed:documents
```

### Regular Updates

```bash
# Update documents and content (safe to run repeatedly)
bun run seed:documents
```

## Asset Management

### Supported File Types

The seeding scripts handle various asset types:

- **Images:** PNG, JPG, JPEG, GIF, SVG, WebP
- **Documents:** PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX
- **Archives:** ZIP, TAR, GZ, RAR, 7Z
- **Data files:** TXT, CSV, JSON, XML

### Asset Processing

1. **Detection** - Extracts asset references from markdown content
2. **Download/Copy** - Moves assets from seed directories to public folder
3. **URL Rewriting** - Updates markdown to use public asset URLs
4. **Database Storage** - Creates asset records with proper metadata

### Asset Storage

- **Source:** `../seed-data/documents/{locale}/{document}/`
- **Destination:** `../../public/assets/`
- **Database:** Records stored in `asset` table

## Document Structure

### Frontmatter Support

Documents can include YAML frontmatter for metadata:

```yaml
---
title: Document Title
version: 1.0
updated_at: 2024-01-01
---
```

### Content Processing

- **Markdown parsing** with frontmatter extraction
- **Image reference rewriting** to public URLs
- **Callout block processing** for special formatting
- **Multi-language support** with locale-specific content

## Security Considerations

### Production Safety

- Database reset is **blocked** in production environment
- All scripts check `NODE_ENV` before executing destructive operations
- Seed scripts are idempotent and safe to run multiple times

### Data Integrity

- **Transaction support** - Operations are wrapped in database transactions
- **Validation** - Content and assets are validated before processing
- **Error handling** - Failed operations don't corrupt existing data

## Troubleshooting

### Common Issues

**Database Connection Errors:**

```bash
# Check environment variables
env | grep POSTGRES

# Test database connection
psql -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DB
```

**Permission Errors:**

- Ensure database user has CREATE/DROP privileges
- Check file system permissions for asset directories
- Verify write access to public/assets directory

**Seeding Failures:**

```bash
# Check document structure
ls -la ../seed-data/documents/

# Validate markdown files
# Look for proper frontmatter and content structure

# Check asset files exist
# Ensure referenced images/files are present
```

### Error Recovery

**Partial Seed Failure:**

1. Check error logs for specific failures
2. Fix problematic documents or assets
3. Re-run seeding (safe to repeat)

**Corrupted Database:**

1. Run database reset (development only)
2. Re-run full seeding process
3. Verify data integrity

### Logging

All scripts provide detailed console output:

- **Progress indicators** for long-running operations
- **Error messages** with specific failure details
- **Success confirmations** with counts and summaries

## Best Practices

1. **Backup before reset** - Always backup production data
2. **Test locally first** - Validate changes in development
3. **Check dependencies** - Ensure all required files exist
4. **Monitor logs** - Watch for errors during seeding
5. **Validate results** - Verify data was imported correctly
