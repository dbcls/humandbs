import axios from "axios";
import * as cheerio from "cheerio";
import * as path from "path";

// Constants
const BASE_URL = "https://humandbs.dbcls.jp";
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_DELAY_MS = 2000;

const FILE_EXTENSIONS = [
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".zip",
  ".tar",
  ".gz",
  ".rar",
  ".7z",
  ".txt",
  ".csv",
  ".json",
  ".xml",
];

const IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
  ".tiff",
];

const SKIP_PATHS = ["sitemap", "search", "logout", "login"];
const SKIP_TITLES = ["Japanese", "English"];

export interface PageInfo {
  title: string;
  url: string;
  documentId: string;
  language: string;
}

export interface AttachmentInfo {
  filename: string;
  url: string;
  documentId: string;
  pageTitle: string;
  pageUrl: string;
  language: string;
  type: "file" | "image";
}

/**
 * Convert text to URL-friendly slug
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/[\s_-]+/g, "-") // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens
}

/**
 * Extract document ID from URL and title
 */
export function extractDocumentId(url: string, title: string): string {
  const urlObj = new URL(url);
  const pathname = urlObj.pathname;

  // Special case for home pages - check first
  if (
    pathname === "/" ||
    pathname === "/en/" ||
    pathname === "/ja/" ||
    pathname === "/en" ||
    pathname === "/ja"
  ) {
    return "home";
  }

  // Remove language prefix if present
  const cleanPath = pathname.replace(/^\/(en|ja)\//, "/");

  // Extract meaningful path segments
  const segments = cleanPath.split("/").filter(Boolean);

  if (segments.length > 0) {
    // Use the last segment if it's meaningful, otherwise construct from title
    const lastSegment = segments[segments.length - 1];
    if (lastSegment && lastSegment !== "index") {
      return lastSegment;
    }
  }

  // Fallback to slugified title
  return slugify(title);
}

/**
 * Determine language from URL
 */
export function getLanguageFromUrl(url: string): string {
  const urlObj = new URL(url);
  return urlObj.pathname.startsWith("/en/") ? "en" : "ja";
}

/**
 * Check if a link points to a downloadable file
 */
export function isDownloadableFile(href: string | undefined): href is string {
  if (!href) return false;

  // Check if it's a /files/ link
  if (href.includes("/files/")) return true;

  const lowerHref = href.toLowerCase();
  return FILE_EXTENSIONS.some((ext) => lowerHref.endsWith(ext));
}

/**
 * Check if a source points to an image file
 */
export function isImageFile(src: string | undefined): src is string {
  if (!src) return false;

  const lowerSrc = src.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lowerSrc.includes(ext));
}

/**
 * Fetch and parse sitemap pages from both English and Japanese versions
 */
export async function fetchSitemapPages(): Promise<PageInfo[]> {
  console.log(`Fetching sitemap from ${BASE_URL}/en/sitemap...`);

  try {
    // Fetch both English and Japanese sitemaps
    const [enResponse, jaResponse] = await Promise.all([
      axios.get(`${BASE_URL}/en/sitemap`),
      axios.get(`${BASE_URL}/sitemap`),
    ]);

    const pages: PageInfo[] = [];

    // Process English sitemap
    const $en = cheerio.load(enResponse.data);
    $en("a").each((_, element) => {
      const href = $en(element).attr("href");
      const title = $en(element).text().trim();

      if (href && title && href.startsWith("/")) {
        const fullUrl = `${BASE_URL}${href}`;
        const language = getLanguageFromUrl(fullUrl);
        const documentId = extractDocumentId(fullUrl, title);

        // Skip certain pages
        if (
          !SKIP_PATHS.some((path) => href.includes(path)) &&
          !SKIP_TITLES.includes(title)
        ) {
          pages.push({
            title,
            url: fullUrl,
            documentId,
            language,
          });
        }
      }
    });

    // Process Japanese sitemap
    const $ja = cheerio.load(jaResponse.data);
    $ja("a").each((_, element) => {
      const href = $ja(element).attr("href");
      const title = $ja(element).text().trim();

      if (href && title && href.startsWith("/")) {
        const fullUrl = `${BASE_URL}${href}`;
        const language = getLanguageFromUrl(fullUrl);
        const documentId = extractDocumentId(fullUrl, title);

        // Skip certain pages and avoid duplicates
        if (
          !SKIP_PATHS.some((path) => href.includes(path)) &&
          !SKIP_TITLES.includes(title) &&
          !pages.some((p) => p.url === fullUrl) &&
          !pages.some(
            (p) => p.documentId === documentId && p.language === language
          )
        ) {
          pages.push({
            title,
            url: fullUrl,
            documentId,
            language,
          });
        }
      }
    });

    // Remove duplicates based on URL
    const uniquePages = pages.filter(
      (page, index, self) => index === self.findIndex((p) => p.url === page.url)
    );

    console.log(`Found ${uniquePages.length} unique pages`);
    return uniquePages;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch sitemap: ${errorMessage}`);
  }
}

/**
 * Extract attachments from a single page
 */
export async function extractAttachmentsFromPage(
  page: PageInfo
): Promise<AttachmentInfo[]> {
  try {
    const response = await axios.get<string>(page.url);
    const $ = cheerio.load(response.data);
    const attachments: AttachmentInfo[] = [];

    // Extract downloadable files
    $("div.item-page a").each((_, element) => {
      const href = $(element).attr("href");

      if (href && isDownloadableFile(href)) {
        // Only include relative URLs (starting with /) and skip external URLs
        if (!href.startsWith("/")) {
          return; // Skip absolute URLs
        }

        const filename = path.basename(href);

        attachments.push({
          filename,
          url: href, // Use original relative URL as-is
          documentId: page.documentId,
          pageTitle: page.title,
          pageUrl: page.url,
          language: page.language,
          type: "file",
        });
      }
    });

    // Extract images
    $("div.item-page img").each((_, element) => {
      const src = $(element).attr("src");

      if (src && isImageFile(src)) {
        // Only include relative URLs (starting with /) and skip external URLs
        if (!src.startsWith("/")) {
          return; // Skip absolute URLs
        }

        const filename = path.basename(src);

        attachments.push({
          filename,
          url: src, // Use original relative URL as-is
          documentId: page.documentId,
          pageTitle: page.title,
          pageUrl: page.url,
          language: page.language,
          type: "image",
        });
      }
    });

    return attachments;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `Failed to process ${page.title} (${page.language}): ${errorMessage}`
    );
    return [];
  }
}

/**
 * Process multiple pages concurrently with rate limiting
 */
export async function processPagesConcurrently<T, U>(
  items: T[],
  processFn: (item: T) => Promise<U>,
  concurrency = DEFAULT_CONCURRENCY,
  delay = DEFAULT_DELAY_MS
): Promise<U[]> {
  console.log(`Starting processing with concurrency: ${concurrency}`);
  const results: U[] = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);

    console.log(
      `\n--- Processing batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(items.length / concurrency)} ---`
    );

    const batchPromises = batch.map(processFn);
    const batchResults = await Promise.allSettled(batchPromises);

    // Collect results from this batch
    batchResults.forEach((result) => {
      if (result.status === "fulfilled") {
        results.push(result.value);
      }
    });

    // Small delay between batches to be respectful to the server
    if (i + concurrency < items.length && delay > 0) {
      console.log(`Waiting ${delay / 1000} seconds before next batch...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return results;
}

/**
 * Process pages concurrently and extract attachments with flattening
 */
export async function processAttachmentsConcurrently(
  pages: PageInfo[],
  concurrency = DEFAULT_CONCURRENCY,
  delay = DEFAULT_DELAY_MS
): Promise<AttachmentInfo[]> {
  console.log(
    `Starting attachment processing with concurrency: ${concurrency}`
  );
  const allAttachments: AttachmentInfo[] = [];

  for (let i = 0; i < pages.length; i += concurrency) {
    const batch = pages.slice(i, i + concurrency);

    console.log(
      `\n--- Processing batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(pages.length / concurrency)} ---`
    );

    const batchPromises = batch.map(extractAttachmentsFromPage);
    const batchResults = await Promise.allSettled(batchPromises);

    // Collect and flatten results from this batch
    batchResults.forEach((result) => {
      if (result.status === "fulfilled") {
        allAttachments.push(...result.value);
      }
    });

    // Small delay between batches to be respectful to the server
    if (i + concurrency < pages.length && delay > 0) {
      console.log(`Waiting ${delay / 1000} seconds before next batch...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return allAttachments;
}

/**
 * Generate CSV content from attachment data
 */
export function generateAttachmentsCSV(attachments: AttachmentInfo[]): string {
  const headers = [
    "Document ID",
    "Page Title",
    "Page URL",
    "Language",
    "Attachment Type",
    "Filename",
    "Attachment URL",
  ];

  const csvRows = [headers.join(",")];

  attachments.forEach((attachment) => {
    const row = [
      `"${attachment.documentId}"`,
      `"${attachment.pageTitle.replace(/"/g, '""')}"`,
      `"${attachment.pageUrl}"`,
      `"${attachment.language}"`,
      `"${attachment.type}"`,
      `"${attachment.filename}"`,
      `"${attachment.url}"`,
    ];
    csvRows.push(row.join(","));
  });

  return csvRows.join("\n");
}

/**
 * Extract filename from URL path
 */
export function getFileNameFromUrl(url: string): string {
  // Extract the last segment of the URL path and remove any trailing slashes
  const urlObj = new URL(url);
  const pathname = urlObj.pathname;

  // Special case for home pages - check first
  if (
    pathname === "/" ||
    pathname === "/en/" ||
    pathname === "/ja/" ||
    pathname === "/en" ||
    pathname === "/ja"
  ) {
    return "home";
  }

  const segments = pathname.split("/").filter((segment) => segment.length > 0);
  const lastSegment = segments[segments.length - 1] || "index";
  return lastSegment;
}

/**
 * Display summary statistics for attachments
 */
export function displayAttachmentsSummary(
  attachments: AttachmentInfo[],
  totalPages: number
): void {
  // Remove duplicates based on URL (same file might be linked from multiple pages)
  const uniqueAttachments = attachments.filter(
    (attachment, index, self) =>
      index === self.findIndex((a) => a.url === attachment.url)
  );

  console.log(`\n📊 Results Summary:`);
  console.log(`Total pages processed: ${totalPages}`);
  console.log(`Total attachments found: ${attachments.length}`);
  console.log(`Unique attachments: ${uniqueAttachments.length}`);

  const fileCount = uniqueAttachments.filter((a) => a.type === "file").length;
  const imageCount = uniqueAttachments.filter((a) => a.type === "image").length;
  console.log(`  - Files: ${fileCount}`);
  console.log(`  - Images: ${imageCount}`);

  // Group by language
  const byLanguage = attachments.reduce(
    (acc, attachment) => {
      if (!acc[attachment.language]) acc[attachment.language] = 0;
      acc[attachment.language]++;
      return acc;
    },
    {} as Record<string, number>
  );

  console.log(`By language:`);
  Object.entries(byLanguage).forEach(([lang, count]) => {
    console.log(`  - ${lang.toUpperCase()}: ${count}`);
  });
}
