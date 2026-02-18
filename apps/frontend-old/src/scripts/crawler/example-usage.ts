#!/usr/bin/env bun

/**
 * Example Usage Script for Attachment Aggregation
 *
 * This script demonstrates how to use the attachment aggregation functionality
 * and provides common usage patterns for analyzing website attachments.
 */

import * as fs from "fs";
import * as path from "path";

import {
  fetchSitemapPages,
  processAttachmentsConcurrently,
  generateAttachmentsCSV,
  displayAttachmentsSummary,
} from "./utils";

/**
 * Example 1: Basic attachment aggregation
 */
async function basicExample() {
  console.log("🔍 Example 1: Basic Attachment Aggregation");
  console.log("=".repeat(50));

  try {
    // Fetch all pages from sitemap
    const pages = await fetchSitemapPages();

    // Extract attachments from all pages (using concurrency of 2 for this example)
    const attachments = await processAttachmentsConcurrently(
      pages,
      2 // Lower concurrency for example
    );

    // Display summary
    displayAttachmentsSummary(attachments, pages.length);

    // Generate CSV
    const csvContent = generateAttachmentsCSV(attachments);
    const outputPath = path.resolve("example-attachments.csv");
    fs.writeFileSync(outputPath, csvContent, "utf-8");

    console.log(`\n📄 CSV saved to: ${outputPath}`);
    console.log("✅ Basic example completed!");
  } catch (error) {
    console.error("❌ Basic example failed:", error);
  }
}

/**
 * Example 2: Filter and analyze specific attachment types
 */
async function filterExample() {
  console.log("\n🔍 Example 2: Filter Specific File Types");
  console.log("=".repeat(50));

  try {
    const pages = await fetchSitemapPages();
    const allAttachments = await processAttachmentsConcurrently(pages, 3);

    // Filter PDF files only
    const pdfFiles = allAttachments.filter((attachment) =>
      attachment.filename.toLowerCase().endsWith(".pdf")
    );

    // Filter Excel files
    const excelFiles = allAttachments.filter((attachment) =>
      attachment.filename.toLowerCase().match(/\.(xlsx?|xls)$/i)
    );

    // Filter images
    const images = allAttachments.filter(
      (attachment) => attachment.type === "image"
    );

    console.log(`📊 Filtered Results:`);
    console.log(`PDF Files: ${pdfFiles.length}`);
    console.log(`Excel Files: ${excelFiles.length}`);
    console.log(`Images: ${images.length}`);

    // Save filtered results
    if (pdfFiles.length > 0) {
      const pdfCsv = generateAttachmentsCSV(pdfFiles);
      fs.writeFileSync("pdf-attachments.csv", pdfCsv, "utf-8");
      console.log("📄 PDF files saved to: pdf-attachments.csv");
    }

    if (excelFiles.length > 0) {
      const excelCsv = generateAttachmentsCSV(excelFiles);
      fs.writeFileSync("excel-attachments.csv", excelCsv, "utf-8");
      console.log("📊 Excel files saved to: excel-attachments.csv");
    }

    console.log("✅ Filter example completed!");
  } catch (error) {
    console.error("❌ Filter example failed:", error);
  }
}

/**
 * Example 3: Analyze attachments by language
 */
async function languageAnalysis() {
  console.log("\n🔍 Example 3: Language-based Analysis");
  console.log("=".repeat(50));

  try {
    const pages = await fetchSitemapPages();
    const allAttachments = await processAttachmentsConcurrently(pages, 3);

    // Group by language
    const englishAttachments = allAttachments.filter(
      (a) => a.language === "en"
    );
    const japaneseAttachments = allAttachments.filter(
      (a) => a.language === "ja"
    );

    console.log(`📊 Language Distribution:`);
    console.log(`English pages: ${englishAttachments.length} attachments`);
    console.log(`Japanese pages: ${japaneseAttachments.length} attachments`);

    // Find language-specific vs shared files
    const englishUrls = new Set(englishAttachments.map((a) => a.url));
    const japaneseUrls = new Set(japaneseAttachments.map((a) => a.url));

    const sharedFiles = [...englishUrls].filter((url) => japaneseUrls.has(url));
    const englishOnlyFiles = [...englishUrls].filter(
      (url) => !japaneseUrls.has(url)
    );
    const japaneseOnlyFiles = [...japaneseUrls].filter(
      (url) => !englishUrls.has(url)
    );

    console.log(`\n📋 File Sharing Analysis:`);
    console.log(`Shared between languages: ${sharedFiles.length} files`);
    console.log(`English-only files: ${englishOnlyFiles.length} files`);
    console.log(`Japanese-only files: ${japaneseOnlyFiles.length} files`);

    // Save language-specific CSVs
    const enCsv = generateAttachmentsCSV(englishAttachments);
    const jaCsv = generateAttachmentsCSV(japaneseAttachments);

    fs.writeFileSync("english-attachments.csv", enCsv, "utf-8");
    fs.writeFileSync("japanese-attachments.csv", jaCsv, "utf-8");

    console.log("📄 English attachments saved to: english-attachments.csv");
    console.log("📄 Japanese attachments saved to: japanese-attachments.csv");
    console.log("✅ Language analysis completed!");
  } catch (error) {
    console.error("❌ Language analysis failed:", error);
  }
}

/**
 * Example 4: Analyze file paths and directories
 */
async function pathAnalysis() {
  console.log("\n🔍 Example 4: File Path and Directory Analysis");
  console.log("=".repeat(50));

  try {
    const pages = await fetchSitemapPages();
    const allAttachments = await processAttachmentsConcurrently(pages, 3);

    // Note: External files are automatically filtered out
    console.log(`📊 File Path Analysis:`);
    console.log(`Total relative URLs found: ${allAttachments.length}`);

    // Analyze directory structure
    const directories = new Set();
    allAttachments.forEach((attachment) => {
      const dir = attachment.url.substring(0, attachment.url.lastIndexOf("/"));
      directories.add(dir);
    });

    console.log(`\n📁 Directory Structure:`);
    [...directories].sort().forEach((dir) => {
      const count = allAttachments.filter((f) => f.url.startsWith(dir)).length;
      console.log(`  - ${dir}: ${count} files`);
    });

    // Analyze by subdirectories
    const subdirCounts = {};
    allAttachments.forEach((attachment) => {
      const pathParts = attachment.url.split("/").filter(Boolean);
      if (pathParts.length >= 2) {
        const subdir = pathParts[1]; // e.g., "files", "images", etc.
        subdirCounts[subdir] = (subdirCounts[subdir] || 0) + 1;
      }
    });

    console.log(`\n📊 Files by main directory:`);
    Object.entries(subdirCounts).forEach(([dir, count]) => {
      console.log(`  - /${dir}/: ${count} files`);
    });

    console.log("✅ Path analysis completed!");
  } catch (error) {
    console.error("❌ Path analysis failed:", error);
  }
}

/**
 * Example 5: Generate summary report
 */
async function summaryReport() {
  console.log("\n🔍 Example 5: Comprehensive Summary Report");
  console.log("=".repeat(50));

  try {
    const pages = await fetchSitemapPages();
    const allAttachments = await processAttachmentsConcurrently(pages, 3);

    // Generate comprehensive report
    const report = {
      timestamp: new Date().toISOString(),
      totalPages: pages.length,
      totalAttachments: allAttachments.length,
      uniqueAttachments: [...new Set(allAttachments.map((a) => a.url))].length,
      byType: {
        files: allAttachments.filter((a) => a.type === "file").length,
        images: allAttachments.filter((a) => a.type === "image").length,
      },
      byLanguage: {
        english: allAttachments.filter((a) => a.language === "en").length,
        japanese: allAttachments.filter((a) => a.language === "ja").length,
      },
      fileExtensions: {} as Record<string, number>,
      directories: {} as Record<string, number>,
    };

    // Count file extensions
    allAttachments.forEach((attachment) => {
      const ext = path.extname(attachment.filename).toLowerCase();
      if (ext) {
        report.fileExtensions[ext] = (report.fileExtensions[ext] || 0) + 1;
      }
    });

    // Count by directory structure
    allAttachments.forEach((attachment) => {
      const dir = attachment.url.substring(0, attachment.url.lastIndexOf("/"));
      report.directories[dir] = (report.directories[dir] || 0) + 1;
    });

    // Save report as JSON
    const reportJson = JSON.stringify(report, null, 2);
    fs.writeFileSync("attachment-summary-report.json", reportJson, "utf-8");

    console.log("📊 Summary Report:");
    console.log(`  Total Pages: ${report.totalPages}`);
    console.log(`  Total Attachments: ${report.totalAttachments}`);
    console.log(`  Unique Files: ${report.uniqueAttachments}`);
    console.log(
      `  Files: ${report.byType.files}, Images: ${report.byType.images}`
    );
    console.log(
      `  English: ${report.byLanguage.english}, Japanese: ${report.byLanguage.japanese}`
    );

    console.log("\n📄 Full report saved to: attachment-summary-report.json");
    console.log("✅ Summary report completed!");
  } catch (error) {
    console.error("❌ Summary report failed:", error);
  }
}

/**
 * Main function to run all examples
 */
async function main() {
  console.log("🚀 Attachment Aggregation Examples");
  console.log("=".repeat(80));
  console.log(
    "This script demonstrates various ways to use attachment aggregation.\n"
  );

  // You can run individual examples or all of them
  // Comment out the ones you don't want to run:

  await basicExample();
  await filterExample();
  await languageAnalysis();
  await pathAnalysis();
  await summaryReport();

  console.log("\n🎉 All examples completed!");
  console.log("Check the generated CSV and JSON files for results.");

  // Clean up example files (optional)
  const filesToCleanup = [
    "example-attachments.csv",
    "pdf-attachments.csv",
    "excel-attachments.csv",
    "english-attachments.csv",
    "japanese-attachments.csv",
    "attachment-summary-report.json",
  ];

  console.log(`\n🧹 Generated files: ${filesToCleanup.join(", ")}`);
  console.log("You can delete these when you're done reviewing them.");
}

// Run the examples if this script is executed directly
if (import.meta.main) {
  main().catch((error) => {
    console.error("💥 Example script failed:", error);
    process.exit(1);
  });
}

export {
  basicExample,
  filterExample,
  languageAnalysis,
  pathAnalysis,
  summaryReport,
};
