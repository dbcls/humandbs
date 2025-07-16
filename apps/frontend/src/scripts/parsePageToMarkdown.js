const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");

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
    description: "Directory to save parsed content and images",
    type: "string",
    default: path.resolve(__dirname, "."), // Default to current directory
  })
  .help().argv;

function getFileNameFromUrl(url) {
  // Extract the last segment of the URL path and remove any trailing slashes
  const urlObj = new URL(url);
  const segments = urlObj.pathname
    .split("/")
    .filter((segment) => segment.length > 0);
  const lastSegment = segments[segments.length - 1] || "index";
  return lastSegment;
}

async function fetchAndParse() {
  try {
    const url = argv.url;
    const response = await axios.get(url);

    const $ = cheerio.load(response.data);
    const content = $("div.item-page").html();

    if (!content) {
      throw new Error("No .item-page content found!");
    }

    // Generate base filename from URL
    const baseFileName = getFileNameFromUrl(url);
    const mdFileName = `${baseFileName}.md`;
    const imagesDirName = `${baseFileName}_files`;

    // Create the images directory
    const imagesDir = path.join(argv.outdir, imagesDirName);
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    const markdown = await convertToMarkdown(
      content,
      $,
      imagesDir,
      imagesDirName
    );

    const mdFilePath = path.join(argv.outdir, mdFileName);
    fs.writeFileSync(mdFilePath, markdown, "utf-8");

    console.log(`Content parsed and saved as ${mdFilePath}`);
    console.log(`Images saved in ${imagesDir}`);
  } catch (error) {
    console.error("Error fetching or parsing content:", error.message);
  }
}

async function convertToMarkdown(html, $, imagesDir, imagesDirName) {
  const turndown = require("turndown");
  const turndownService = new turndown({
    blankReplacement: function (content, node) {
      return node.isBlock ? "\n\n" : "";
    },
  });

  turndownService.addRule("heading", {
    filter: ["h1", "h2", "h3", "h4", "h5", "h6"],
    replacement: function (content, node) {
      const level = Number(node.nodeName.charAt(1));
      // Remove any existing bold markers from the content
      content = content.replace(/^\*\*|\*\*$/g, "").trim();
      return "\n\n" + "#".repeat(level) + " " + content + "\n\n";
    },
  });

  turndownService.addRule("callouts", {
    filter: (node) =>
      node.classList && node.classList.contains("callout-wrapper"),
    replacement: (content, node) => content.trim(),
  });

  // Add rule for paragraphs to ensure proper spacing
  turndownService.addRule("paragraph", {
    filter: "p",
    replacement: function (content, node) {
      return "\n\n" + content + "\n\n";
    },
  });

  // Save images locally and replace the src with the new local path
  const imagePromises = $("div.item-page img")
    .map(async (_, el) => {
      const src = $(el).attr("src");
      const alt = $(el).attr("alt") || "";

      if (src) {
        const imageUrl = new URL(src, "https://humandbs.dbcls.jp"); // Resolve relative URLs
        const imageName = path.basename(imageUrl.pathname);
        const imagePath = path.join(imagesDir, imageName);

        try {
          const imageResponse = await axios.get(imageUrl.href, {
            responseType: "arraybuffer",
          });
          fs.writeFileSync(imagePath, imageResponse.data);
          // Update the image reference to use the new directory name
          $(el).after(`![${alt}](${imagesDirName}/${imageName})`);
        } catch (err) {
          console.error(
            `Failed to download image from ${imageUrl.href}:`,
            err.message
          );
        }
      }

      $(el).remove();
    })
    .get();

  // Wait for all image downloads to finish
  await Promise.all(imagePromises);

  // Handle callout blocks before converting to markdown
  $("div.item-page")
    .find("div[style*='border-style: solid']")
    .each((_, el) => {
      // Process each block element inside the callout separately
      const processedContent = [];
      $(el)
        .children()
        .each((_, child) => {
          const content = turndownService
            .turndown($(child).clone().wrap("<div>").parent().html())
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
      const type = $(el).attr("class").split("-")[1];
      const processedContent = [];
      $(el)
        .children()
        .each((_, child) => {
          const content = turndownService
            .turndown($(child).clone().wrap("<div>").parent().html())
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

  return (
    turndownService
      .turndown($("div.item-page").html())
      // Clean up any potential extra newlines but preserve doubles
      .replace(/\n{4,}/g, "\n\n\n")
  );
}

fetchAndParse();
