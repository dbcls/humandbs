import { execSync } from "child_process";
import * as path from "path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { fetchSitemapPages, processPagesConcurrently, PageInfo } from "./utils";

interface ParsedArguments {
  "dry-run": boolean;
  concurrency: number;
  "files-only": boolean;
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
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `❌ Failed to crawl ${page.title} (${page.language}): ${errorMessage}`
    );
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

    await processPagesConcurrently(pages, crawlPage, argv.concurrency);

    console.log("\n🎉 Sitemap crawl completed!");
    console.log(`Total pages processed: ${pages.length}`);
    console.log(
      "Output saved to: ./output/documents/[language]/[document-id]/"
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error during sitemap crawl:", errorMessage);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error("Unhandled error:", errorMessage);
  process.exit(1);
});
