import * as fs from "fs";
import * as path from "path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import {
  fetchSitemapPages,
  processAttachmentsConcurrently,
  generateAttachmentsCSV,
  displayAttachmentsSummary,
  PageInfo,
} from "./utils";

interface ParsedArguments {
  "dry-run": boolean;
  concurrency: number;
  output: string;
}

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .option("dry-run", {
    alias: "d",
    description: "Show what would be aggregated without actually processing",
    type: "boolean",
    default: false,
  })
  .option("concurrency", {
    alias: "c",
    description: "Number of pages to process concurrently",
    type: "number",
    default: 3,
  })
  .option("output", {
    alias: "o",
    description: "Output CSV file path",
    type: "string",
    default: "attachments.csv",
  })
  .help()
  .parseSync() as ParsedArguments;

async function main(): Promise<void> {
  try {
    const pages = await fetchSitemapPages();

    if (argv["dry-run"]) {
      console.log(
        "\n🔍 DRY RUN - Pages that would be processed for attachments:"
      );
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
          console.log(`    Document ID: ${page.documentId}`);
          console.log("");
        });
      });

      console.log(`\nTotal: ${pages.length} pages`);
      console.log(`Output would be saved to: ${argv.output}`);
      console.log("Use without --dry-run to start processing.");
      return;
    }

    if (pages.length === 0) {
      console.log("No pages found to process.");
      return;
    }

    // Process all pages and extract attachments
    const allAttachments = await processAttachmentsConcurrently(
      pages,
      argv.concurrency
    );

    // Display summary statistics
    displayAttachmentsSummary(allAttachments, pages.length);

    // Generate CSV content
    const csvContent = generateAttachmentsCSV(allAttachments);

    // Ensure output directory exists
    const outputPath = path.resolve(argv.output);
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write CSV file
    fs.writeFileSync(outputPath, csvContent, "utf-8");

    console.log(`\n🎉 Attachment aggregation completed!`);
    console.log(`CSV saved to: ${outputPath}`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error during attachment aggregation:", errorMessage);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error("Unhandled error:", errorMessage);
  process.exit(1);
});
