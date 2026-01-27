import axios from "axios";
import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";
import TurndownService from "turndown";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

interface ParsedArguments {
  url: string;
  outdir: string;
  "files-only": boolean;
}

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .option("url", {
    alias: "u",
    description: "URL of the page to parse",
    type: "string",
    demandOption: true,
  })
  .option("outdir", {
    alias: "o",
    description: "Relative path under ./output to save content",
    type: "string",
    default: "",
  })
  .option("files-only", {
    alias: "f",
    description: "Download files only, skip markdown parsing and saving",
    type: "boolean",
    default: false,
  })
  .help()
  .parseSync() as ParsedArguments;

function getFileNameFromUrl(url: string): string {
  // Extract the last segment of the URL path and remove any trailing slashes
  const urlObj = new URL(url);
  const segments = urlObj.pathname
    .split("/")
    .filter((segment) => segment.length > 0);
  const lastSegment = segments[segments.length - 1] || "index";
  return lastSegment;
}

// Helper function to determine if a link is a downloadable file
function isDownloadableFile(href: string | undefined): href is string {
  if (!href) return false;

  // Check if it's a /files/ link
  if (href.includes("/files/")) return true;

  // Check for common file extensions
  const fileExtensions = [
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

  const lowerHref = href.toLowerCase();
  return fileExtensions.some((ext) => lowerHref.endsWith(ext));
}

async function fetchAndParse(): Promise<void> {
  try {
    const url = argv.url;
    const response = await axios.get<string>(url);

    const $ = cheerio.load(response.data);
    const content = $("div.item-page").html();

    if (!content) {
      throw new Error("No .item-page content found!");
    }

    // Generate base filename from URL
    const baseFileName = getFileNameFromUrl(url);

    // Build output directory structure: ./output/[outdir]/baseFileName/
    const outputBaseDir = path.resolve(__dirname, "output");
    const documentDir = argv.outdir
      ? path.join(outputBaseDir, argv.outdir, baseFileName)
      : path.join(outputBaseDir, baseFileName);

    // Create the document directory
    if (!fs.existsSync(documentDir)) {
      fs.mkdirSync(documentDir, { recursive: true });
    }

    const mdFileName = "content.md";
    const filesDirName = baseFileName;

    if (argv["files-only"]) {
      // Files-only mode: just download files without parsing markdown
      await downloadFiles(content, $, documentDir);
      console.log(`Files downloaded to ${documentDir}`);
    } else {
      // Normal mode: parse markdown and download files
      const markdown = await convertToMarkdown(
        content,
        $,
        documentDir,
        filesDirName
      );

      const mdFilePath = path.join(documentDir, mdFileName);
      fs.writeFileSync(mdFilePath, markdown, "utf-8");

      console.log(`Content parsed and saved as ${mdFilePath}`);
      console.log(`Files saved in ${documentDir}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error fetching or parsing content:", errorMessage);
  }
}

// Function to download files only (without markdown processing)
async function downloadFiles(
  html: string,
  $: cheerio.CheerioAPI,
  filesDir: string
): Promise<void> {
  // Download images
  const imagePromises = $("div.item-page img")
    .map(async (_, el) => {
      const src = $(el).attr("src");

      if (src) {
        const imageUrl = new URL(src, "https://humandbs.dbcls.jp");
        const imageName = path.basename(imageUrl.pathname);
        const imagePath = path.join(filesDir, imageName);

        // Check if file already exists
        if (fs.existsSync(imagePath)) {
          console.log(`Skipped image (already exists): ${imageName}`);
          return;
        }

        try {
          const imageResponse = await axios.get(imageUrl.href, {
            responseType: "arraybuffer",
          });
          fs.writeFileSync(imagePath, imageResponse.data);
          console.log(`Downloaded image: ${imageName}`);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.error(
            `Failed to download image from ${imageUrl.href}:`,
            errorMessage
          );
        }
      }
    })
    .get();

  // Download linked files
  const filePromises = $("div.item-page a")
    .map(async (_, el) => {
      const href = $(el).attr("href");

      if (href && isDownloadableFile(href)) {
        try {
          const fileUrl = new URL(href, "https://humandbs.dbcls.jp");
          const fileName = path.basename(fileUrl.pathname);
          const filePath = path.join(filesDir, fileName);

          // Check if file already exists
          if (fs.existsSync(filePath)) {
            console.log(`Skipped file (already exists): ${fileName}`);
            return;
          }

          const fileResponse = await axios.get(fileUrl.href, {
            responseType: "arraybuffer",
          });
          fs.writeFileSync(filePath, fileResponse.data);
          console.log(`Downloaded file: ${fileName}`);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.error(`Failed to download file from ${href}:`, errorMessage);
        }
      }
    })
    .get();

  // Wait for all downloads to finish
  await Promise.all([...imagePromises, ...filePromises]);
}

async function convertToMarkdown(
  html: string,
  $: cheerio.CheerioAPI,
  filesDir: string,
  filesDirName: string
): Promise<string> {
  const turndownService = new TurndownService({
    blankReplacement: function (content: string, node: any) {
      return node.isBlock ? "\n\n" : "";
    },
  });

  turndownService.addRule("heading", {
    filter: ["h1", "h2", "h3", "h4", "h5", "h6"],
    replacement: function (content: string, node: any) {
      const level = Number(node.nodeName.charAt(1));
      // Remove any existing bold markers from the content
      content = content.replace(/^\*\*|\*\*$/g, "").trim();
      return "\n\n" + "#".repeat(level) + " " + content + "\n\n";
    },
  });

  turndownService.addRule("callouts", {
    filter: (node: any) =>
      node.classList && node.classList.contains("callout-wrapper"),
    replacement: (content: string, node: any) => content.trim(),
  });

  // Add rule for paragraphs to ensure proper spacing
  turndownService.addRule("paragraph", {
    filter: "p",
    replacement: function (content: string, node: any) {
      return "\n\n" + content + "\n\n";
    },
  });

  // Download images and replace with local references
  const imagePromises = $("div.item-page img")
    .map(async (_, el) => {
      const src = $(el).attr("src");
      const alt = $(el).attr("alt") || "";

      if (src) {
        const imageUrl = new URL(src, "https://humandbs.dbcls.jp");
        const imageName = path.basename(imageUrl.pathname);
        const imagePath = path.join(filesDir, imageName);

        try {
          // Check if file already exists
          if (!fs.existsSync(imagePath)) {
            const imageResponse = await axios.get(imageUrl.href, {
              responseType: "arraybuffer",
            });
            fs.writeFileSync(imagePath, imageResponse.data);
            console.log(`Downloaded image: ${imageName}`);
          } else {
            console.log(`Skipped image (already exists): ${imageName}`);
          }
          // Update the image reference to use the new directory name
          $(el).after(`![${alt}](${filesDirName}/${imageName})`);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.error(
            `Failed to download image from ${imageUrl.href}:`,
            errorMessage
          );
        }
      }

      $(el).remove();
    })
    .get();

  // Download linked files and update references
  const filePromises = $("div.item-page a")
    .map(async (_, el) => {
      const href = $(el).attr("href");

      if (href && isDownloadableFile(href)) {
        try {
          const fileUrl = new URL(href, "https://humandbs.dbcls.jp");
          const fileName = path.basename(fileUrl.pathname);
          const filePath = path.join(filesDir, fileName);

          // Check if file already exists
          if (!fs.existsSync(filePath)) {
            const fileResponse = await axios.get(fileUrl.href, {
              responseType: "arraybuffer",
            });
            fs.writeFileSync(filePath, fileResponse.data);
            console.log(`Downloaded file: ${fileName}`);
          } else {
            console.log(`Skipped file (already exists): ${fileName}`);
          }

          // Update the link to point to the local file
          $(el).attr("href", `${filesDirName}/${fileName}`);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.error(`Failed to download file from ${href}:`, errorMessage);
          // Keep the original link if download fails
        }
      }
    })
    .get();

  // Wait for all downloads to finish
  await Promise.all([...imagePromises, ...filePromises]);

  // Handle callout blocks before converting to markdown
  $("div.item-page")
    .find("div[style*='border-style: solid']")
    .each((_, el) => {
      // Process each block element inside the callout separately
      const processedContent: string[] = [];
      $(el)
        .children()
        .each((_, child) => {
          const content = turndownService
            .turndown($(child).clone().wrap("<div>").parent().html() || "")
            .trim();
          if (content) {
            processedContent.push(content);
          }
        });

      // Join with double newlines to ensure spacing
      const innerContent = processedContent.join("\n\n");

      // Create the callout replacement with proper spacing
      const replacement = $(
        `
      <div class="spacing-wrapper">
        <p></p>
        {% callout type="info" %}

${innerContent}

        {% /callout %}
        <p></p>
      </div>
    `.trim()
      );
      $(el).replaceWith(replacement);
    });

  // Do the same for text-* classes
  $("div.item-page")
    .find(".text-info, .text-error, .text-tip")
    .each((_, el) => {
      const className = $(el).attr("class");
      const type = className?.split("-")[1] || "info";
      const processedContent: string[] = [];
      $(el)
        .children()
        .each((_, child) => {
          const content = turndownService
            .turndown($(child).clone().wrap("<div>").parent().html() || "")
            .trim();
          if (content) {
            processedContent.push(content);
          }
        });

      const innerContent = processedContent.join("\n\n");

      const replacement = $(
        `
      <div class="spacing-wrapper">
        <p></p>
        {% callout type="${type}" %}

${innerContent}

        {% /callout %}
        <p></p>
      </div>
    `.trim()
      );
      $(el).replaceWith(replacement);
    });

  const htmlContent = $("div.item-page").html();
  return (
    turndownService
      .turndown(htmlContent || "")
      // Clean up any potential extra newlines but preserve doubles
      .replace(/\n{4,}/g, "\n\n\n")
  );
}

fetchAndParse().catch((error) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error("Unhandled error:", errorMessage);
  process.exit(1);
});
