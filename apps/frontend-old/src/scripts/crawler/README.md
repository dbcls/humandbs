# Crawler Scripts

This directory contains web crawling and scraping utilities for extracting content from websites and converting it to structured formats.

## Scripts

### `crawl-page.ts`

A versatile web scraping script that extracts content from HTML pages and converts it to markdown format while downloading associated assets.

### `crawl-sitemap.ts`

A comprehensive sitemap crawler that extracts all page URLs from a website's sitemap and batch-crawls each page using the `crawl-page.ts` script.

### `aggregate-attachments.ts`

A specialized script that crawls all pages from the sitemap and aggregates information about all attachment files (documents and images) into a CSV report. Unlike the other crawlers, this script doesn't download content but creates a comprehensive inventory of all attachments across the site.

### `utils.ts`

Shared utility functions used by the crawler scripts, including sitemap parsing, attachment detection, and concurrent processing helpers.

#### Features

- **HTML to Markdown conversion** with proper formatting preservation
- **Asset downloading** (images, documents, files)
- **Local reference updates** to point to downloaded assets
- **Callout block processing** for special content formatting
- **Multiple operation modes** (full parsing vs files-only)

#### Usage

**Full parsing mode (default):**

```bash
bun crawl-page.ts -u "https://example.com/page"
# Saves to: ./output/page/content.md

bun crawl-page.ts -u "https://example.com/page" -o documents
# Saves to: ./output/documents/page/content.md
```

**Files-only mode (skip markdown processing):**

```bash
bun crawl-page.ts -u "https://example.com/page" -f -o documents
# Downloads assets to: ./output/documents/page/
```

#### Options

- `-u, --url <url>` - **Required.** URL of the page to parse
- `-o, --outdir <path>` - Relative path under ./output to save content (default: saves to ./output/[page-name]/)
- `-f, --files-only` - Download assets only, skip markdown conversion

#### Supported File Types

- **Images:** PNG, JPG, JPEG, GIF, SVG, WebP
- **Documents:** PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX
- **Archives:** ZIP, TAR, GZ, RAR, 7Z
- **Data files:** TXT, CSV, JSON, XML
- **Any file under `/files/` paths**

#### Output Structure

```
output/
└── [outdir]/                 # Optional subdirectory from -o
    └── page-name/            # Page-specific directory
        ├── content.md        # Converted markdown (full mode only)
        ├── image1.png        # Downloaded images
        ├── document.xlsx     # Downloaded files
        └── file.pdf
```

#### Features

- **Sitemap parsing** from both English and Japanese versions
- **Automatic language detection** based on URL structure
- **Document ID extraction** from URLs and page titles
- **Batch processing** with configurable concurrency
- **Dry-run mode** for preview before crawling
- **Files-only mode** support for asset downloading

#### Usage

**Dry run (preview what will be crawled):**

```bash
bun crawl-sitemap.ts --dry-run
# Shows all pages that would be crawled without actually downloading
```

**Full sitemap crawl:**

```bash
bun crawl-sitemap.ts
# Crawls all pages from sitemap with default settings
```

**Customized crawling:**

```bash
bun crawl-sitemap.ts --concurrency 5 --files-only
# Downloads only files with 5 concurrent requests
```

#### Options

- `-d, --dry-run` - Preview pages without crawling
- `-c, --concurrency <num>` - Number of concurrent pages to process (default: 3)
- `-f, --files-only` - Download assets only, skip markdown conversion

#### Output Structure for Sitemap Crawl

```
output/
└── documents/
    ├── en/                   # English pages
    │   ├── home/
    │   │   ├── content.md
    │   │   └── assets...
    │   ├── guidelines/
    │   │   ├── content.md
    │   │   └── assets...
    │   └── data-submission/
    │       ├── content.md
    │       └── assets...
    └── ja/                   # Japanese pages
        ├── home/
        ├── guidelines/
        └── data-submission/
```

#### Language and Document ID Mapping

The script automatically:

- Detects language from URL (`/en/` prefix = English, otherwise Japanese)
- Extracts document IDs from URL paths or page titles
- Creates organized directory structure by language

**Examples:**

- `https://humandbs.dbcls.jp/en/guidelines` → `documents/en/guidelines/`
- `https://humandbs.dbcls.jp/data-submission` → `documents/ja/data-submission/`

## Output Directory

### `output/`

Contains all crawled content and downloaded assets. This directory is git-ignored to prevent committing large binary files and generated content.

#### Current Contents

- **Markdown files:** Converted HTML pages in markdown format
- **Asset directories:** `*_files/` folders containing downloaded images and documents
- **Structured content:** Ready for processing by seeding scripts

#### Features

- **Sitemap processing** from both English and Japanese versions
- **Attachment detection** for files and images across all pages
- **Relative URL filtering** - only includes internal files (starting with `/`)
- **CSV output** with detailed attachment information
- **Concurrent processing** with configurable rate limiting
- **Dry-run mode** for preview before processing
- **Duplicate detection** and handling

#### Usage

**Dry run (preview what will be processed):**

```bash
bun aggregate-attachments.ts --dry-run
# Shows all pages that would be processed without actually analyzing them
```

**Generate attachment inventory:**

```bash
bun aggregate-attachments.ts
# Creates attachments.csv with all attachment information
```

**Customized processing:**

```bash
bun aggregate-attachments.ts --concurrency 5 --output my-attachments.csv
# Process with 5 concurrent requests and custom output filename
```

#### Options

- `-d, --dry-run` - Preview pages without processing
- `-c, --concurrency <num>` - Number of concurrent pages to process (default: 3)
- `-o, --output <file>` - Output CSV file path (default: attachments.csv)

#### CSV Output Format

The generated CSV contains the following columns:

- **Document ID** - Unique identifier extracted from page URL/title
- **Page Title** - Full title of the page containing the attachment
- **Page URL** - Complete URL of the source page
- **Language** - Page language (en/ja)
- **Attachment Type** - file or image
- **Filename** - Name of the attachment file
- **Attachment URL** - Relative URL path (e.g., `/files/document.pdf`)

**Note**: Only relative URLs starting with `/` are included. External links to other domains are automatically filtered out.

#### Use Cases

- **Content auditing** - Get complete inventory of internal site attachments
- **Migration planning** - Understand what files need to be migrated
- **File organization** - Analyze directory structure and file distribution
- **Content analysis** - Analyze file types and distribution across pages
- **Asset management** - Track all downloadable resources

## Usage Examples

### Crawling individual pages

```bash
# Crawl security guidelines page
bun crawl-page.ts \
  -u "https://humandbs.dbcls.jp/en/security-guidelines-for-users" \
  -o documents
# Output: ./output/documents/security-guidelines-for-users/content.md

# Download only assets from guidelines page
bun crawl-page.ts \
  -u "https://humandbs.dbcls.jp/en/guidelines" \
  -f -o documents
# Output: ./output/documents/guidelines/ (assets only)
```

### Crawling entire sitemap

```bash
# Preview all pages that would be crawled
bun crawl-sitemap.ts --dry-run

# Crawl all pages from sitemap (recommended)
bun crawl-sitemap.ts

# Faster crawling with more concurrency
bun crawl-sitemap.ts --concurrency 5

# Download only files from all pages
bun crawl-sitemap.ts --files-only
```

### Aggregating attachment information

```bash
# Preview all pages that would be analyzed
bun aggregate-attachments.ts --dry-run

# Generate complete attachment inventory
bun aggregate-attachments.ts

# Custom output file and concurrency
bun aggregate-attachments.ts --concurrency 5 --output site-attachments.csv

# Process and analyze the CSV
cat attachments.csv | grep "\.pdf" | wc -l  # Count PDF files
cat attachments.csv | grep "/files/" | wc -l  # Count files in main directory
```

### Package.json shortcuts

```bash
# Use npm/bun scripts for convenience
bun run crawl:sitemap --dry-run
bun run crawl:sitemap --concurrency 3
bun run crawl -u "https://site.com/page" -o documents
bun run aggregate-attachments --output audit.csv
```

## Integration with Seeding

The output from crawler scripts can be processed and integrated into the seed data:

1. **Review crawled content** in `output/` directory
2. **Copy relevant directories** to `../seed-data/documents/[locale]/`
3. **Rename to match document IDs** if needed
4. **Run seed scripts** to import into database

**Example workflow:**

```bash
# Crawl content
bun crawl-page.ts -u "https://site.com/about" -o temp/en

# Review and move to seed data
mv output/temp/en/about ../seed-data/documents/en/

# Seed into database
bun ../database/seed-documents.ts
```

### Content Analysis Workflow

```bash
# First, audit all attachments
bun aggregate-attachments.ts --output site-audit.csv

# Review the attachment inventory
# Identify important content to preserve

# Then crawl specific pages based on audit
bun crawl-page.ts -u "https://site.com/important-page" -o seed-data

# Or crawl everything if needed
bun crawl-sitemap.ts
```

## Technical Details

### Dependencies

- **axios** - HTTP client for downloading content
- **cheerio** - Server-side jQuery for HTML parsing
- **turndown** - HTML to markdown conversion
- **yargs** - Command-line argument parsing
- **path** - File path utilities
- **fs** - File system operations

### Error Handling

- Network timeouts and connection errors
- Missing or invalid URLs
- File download failures (preserves original links)
- Invalid HTML structure

### Performance Considerations

- Downloads are processed asynchronously
- Large files may take time to download
- Network timeouts and connection errors
- Sitemap crawler includes 2-second delays between batches
- Concurrent processing can be adjusted based on server capacity
- Attachment aggregation is faster as it only analyzes HTML, doesn't download files
- CSV generation is memory-efficient for large sites

## Best Practices

1. **Respect robots.txt** and site terms of service
2. **Use sitemap crawler for bulk operations** instead of manual loops
3. **Start with dry-run** to preview what will be crawled
4. **Adjust concurrency** based on target server capacity
5. **Use files-only mode** when you only need assets
6. **Check output quality** before using for seeding
7. **Handle rate limiting** with appropriate delays between requests
8. **Verify downloaded files** for completeness and integrity
9. **Run attachment aggregation first** to understand site structure
10. **Use CSV output for planning** and prioritizing content migration

## Troubleshooting

### Common Issues

**Network Errors:**

- Check internet connectivity
- Verify target URL is accessible
- Check for rate limiting or IP blocking

**Parsing Errors:**

- Verify HTML structure matches expected patterns
- Check for dynamic content that requires JavaScript
- Ensure target elements exist on the page

**File Download Issues:**

- Check file permissions in output directory
- Verify sufficient disk space
- Check for invalid characters in filenames

### Debugging

Enable detailed logging by examining console output. The script provides:

- Download progress for each asset
- Error messages for failed operations
- Summary of successful operations
