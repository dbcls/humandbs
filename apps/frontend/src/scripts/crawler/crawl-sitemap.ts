import axios from "axios";
import * as cheerio from "cheerio";
import { execSync } from "child_process";
import * as path from "path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

interface ParsedArguments {
  "dry-run": boolean;
  concurrency: number;
  "files-only": boolean;
}

interface PageInfo {
  title: string;
  url: string;
  documentId: string;
  language: string;
}

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .option("dry-run", {
    alias: "d",
    description: "Show what would be crawled without actually crawling",
    type: "boolean",
    default: false,
  })
  .option("concurrency", {
    alias: "c",
    description: "Number of pages to crawl concurrently",
    type: "number",
    default: 3,
  })
  .option("files-only", {
    alias: "f",
    description: "Download files only, skip markdown parsing",
    type: "boolean",
    default: false,
  })
  .help()
  .parseSync() as ParsedArguments;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/[\s_-]+/g, "-") // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens
}

function extractDocumentId(url: string, title: string): string {
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

function getLanguageFromUrl(url: string): string {
  const urlObj = new URL(url);
  return urlObj.pathname.startsWith("/en/") ? "en" : "ja";
}

async function fetchSitemapPages(): Promise<PageInfo[]> {
  console.log("Fetching sitemap from https://humandbs.dbcls.jp/en/sitemap...");

  try {
    // Fetch both English and Japanese sitemaps
    const [enResponse, jaResponse] = await Promise.all([
      axios.get("https://humandbs.dbcls.jp/en/sitemap"),
      axios.get("https://humandbs.dbcls.jp/sitemap"),
    ]);

    const pages: PageInfo[] = [];

    // Process English sitemap
    const $en = cheerio.load(enResponse.data);
    $en("a").each((_, element) => {
      const href = $en(element).attr("href");
      const title = $en(element).text().trim();

      if (href && title && href.startsWith("/")) {
        const fullUrl = `https://humandbs.dbcls.jp${href}`;
        const language = getLanguageFromUrl(fullUrl);
        const documentId = extractDocumentId(fullUrl, title);

        // Skip certain pages
        if (
          !href.includes("sitemap") &&
          !href.includes("search") &&
          !href.includes("logout") &&
          !href.includes("login") &&
          title !== "Japanese" &&
          title !== "English"
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
        const fullUrl = `https://humandbs.dbcls.jp${href}`;
        const language = getLanguageFromUrl(fullUrl);
        const documentId = extractDocumentId(fullUrl, title);

        // Skip certain pages and avoid duplicates
        if (
          !href.includes("sitemap") &&
          !href.includes("search") &&
          !href.includes("logout") &&
          !href.includes("login") &&
          title !== "Japanese" &&
          title !== "English" &&
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

    console.log(`Found ${uniquePages.length} unique pages to crawl`);
    return uniquePages;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch sitemap: ${errorMessage}`);
  }
}

async function crawlPage(page: PageInfo): Promise<void> {
  const outputDir = `documents/${page.language}`;
  const crawlerScript = path.resolve(__dirname, "crawl-page.ts");

  console.log(
    `Crawling: ${page.title} (${page.language}) -> ${outputDir}/${page.documentId}`
  );

  try {
    const args = [crawlerScript, "-u", page.url, "-o", outputDir];

    if (argv["files-only"]) {
      args.push("--files-only");
    }

    const command = `bun ${args.join(" ")}`;
    execSync(command, {
      stdio: "pipe",
      cwd: path.resolve(__dirname),
      encoding: "utf-8",
    });

    console.log(`✅ Completed: ${page.title} (${page.language})`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `❌ Failed to crawl ${page.title} (${page.language}): ${errorMessage}`
    );
  }
}

async function crawlConcurrently(
  pages: PageInfo[],
  concurrency: number
): Promise<void> {
  console.log(`Starting crawl with concurrency: ${concurrency}`);

  for (let i = 0; i < pages.length; i += concurrency) {
    const batch = pages.slice(i, i + concurrency);
    const batchPromises = batch.map((page) => crawlPage(page));

    console.log(
      `\n--- Processing batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(pages.length / concurrency)} ---`
    );
    console.log(
      `Pages in this batch: ${batch.map((p) => `${p.title} (${p.language})`).join(", ")}`
    );

    await Promise.allSettled(batchPromises);

    // Small delay between batches to be respectful to the server
    if (i + concurrency < pages.length) {
      console.log("Waiting 2 seconds before next batch...");
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

async function main(): Promise<void> {
  try {
    const pages = await fetchSitemapPages();

    if (argv["dry-run"]) {
      console.log("\n🔍 DRY RUN - Pages that would be crawled:");
      console.log("=".repeat(80));

      // Group by language for better display
      const pagesByLanguage = pages.reduce(
        (acc, page) => {
          if (!acc[page.language]) acc[page.language] = [];
          acc[page.language].push(page);
          return acc;
        },
        {} as Record<string, PageInfo[]>
      );

      Object.entries(pagesByLanguage).forEach(([language, langPages]) => {
        console.log(
          `\n📄 ${language.toUpperCase()} Pages (${langPages.length}):`
        );
        langPages.forEach((page) => {
          console.log(`  • ${page.title}`);
          console.log(`    URL: ${page.url}`);
          console.log(
            `    Output: documents/${page.language}/${page.documentId}`
          );
          console.log("");
        });
      });

      console.log(`\nTotal: ${pages.length} pages`);
      console.log("Use without --dry-run to start crawling.");
      return;
    }

    if (pages.length === 0) {
      console.log("No pages found to crawl.");
      return;
    }

    await crawlConcurrently(pages, argv.concurrency);

    console.log("\n🎉 Sitemap crawl completed!");
    console.log(`Total pages processed: ${pages.length}`);
    console.log(
      "Output saved to: ./output/documents/[language]/[document-id]/"
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error during sitemap crawl:", errorMessage);
    process.exit(1);
  }
}

main().catch((error) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error("Unhandled error:", errorMessage);
  process.exit(1);
});
