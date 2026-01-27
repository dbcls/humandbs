# Crawler Scripts

This directory contains web crawling and scraping utilities for extracting content from websites and converting it to structured formats.

## Scripts

### `crawl-page.ts`

A versatile web scraping script that extracts content from HTML pages and converts it to markdown format while downloading associated assets.

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

## Output Directory

### `output/`

Contains all crawled content and downloaded assets. This directory is git-ignored to prevent committing large binary files and generated content.

#### Current Contents

- **Markdown files:** Converted HTML pages in markdown format
- **Asset directories:** `*_files/` folders containing downloaded images and documents
- **Structured content:** Ready for processing by seeding scripts

## Usage Examples

### Crawling NBDC pages

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

### Processing multiple pages

```bash
# Create a simple script to crawl multiple pages
for url in \
  "https://humandbs.dbcls.jp/en/about" \
  "https://humandbs.dbcls.jp/en/data-usage" \
  "https://humandbs.dbcls.jp/en/data-submission"
do
  bun crawl-page.ts -u "$url" -o seed-data/en
done
# Output: ./output/seed-data/en/about/content.md, etc.
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

## Technical Details

### Dependencies

- **axios** - HTTP client for downloading content
- **cheerio** - Server-side jQuery for HTML parsing
- **turndown** - HTML to markdown conversion
- **yargs** - Command-line argument parsing

### Error Handling

- Network timeouts and connection errors
- Missing or invalid URLs
- File download failures (preserves original links)
- Invalid HTML structure

### Performance Considerations

- Downloads are processed asynchronously
- Large files may take time to download
- Network rate limiting may affect crawling speed

## Best Practices

1. **Respect robots.txt** and site terms of service
2. **Use files-only mode** when you only need assets
3. **Check output quality** before using for seeding
4. **Handle rate limiting** with appropriate delays between requests
5. **Verify downloaded files** for completeness and integrity

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
