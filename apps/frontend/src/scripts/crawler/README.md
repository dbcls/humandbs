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
bun crawl-page.ts -u "https://example.com/page" -o ./output
```

**Files-only mode (skip markdown processing):**

```bash
bun crawl-page.ts -u "https://example.com/page" -f -o ./output
```

#### Options

- `-u, --url <url>` - **Required.** URL of the page to parse
- `-o, --outdir <dir>` - Output directory (default: current directory)
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
├── page-name.md              # Converted markdown (full mode only)
└── page-name_files/          # Downloaded assets
    ├── image1.png
    ├── document.xlsx
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
  -o ./output

# Download only assets from guidelines page
bun crawl-page.ts \
  -u "https://humandbs.dbcls.jp/en/guidelines" \
  -f -o ./output
```

### Processing multiple pages

```bash
# Create a simple script to crawl multiple pages
for url in \
  "https://humandbs.dbcls.jp/en/about" \
  "https://humandbs.dbcls.jp/en/data-usage" \
  "https://humandbs.dbcls.jp/en/data-submission"
do
  bun crawl-page.ts -u "$url" -o ./output
done
```

## Integration with Seeding

The output from crawler scripts can be processed and integrated into the seed data:

1. **Review crawled content** in `output/` directory
2. **Copy relevant files** to `../seed-data/documents/`
3. **Organize by locale** (en/, ja/) and document structure
4. **Run seed scripts** to import into database

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
