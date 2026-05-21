#!/usr/bin/env bun
/**
 * Converts a publications content.md file from flat paragraph format to a markdown table.
 *
 * Input format (repeating groups of 5 paragraphs):
 *   Principal Investigator
 *   Title
 *   Journal (with link)
 *   Published date
 *   Used Dataset IDs (with links)
 *
 * Usage: bun run apps/frontend/src/scripts/convert-publications-to-table.ts <input.md> [output.md]
 * If output is omitted, overwrites input in place.
 */

import { readFileSync, writeFileSync } from "fs";
import path from "path";

const inputPath = process.argv[2];
const outputPath = process.argv[3] ?? inputPath;

if (!inputPath) {
  console.error("Usage: bun run convert-publications-to-table.ts <input.md> [output.md]");
  process.exit(1);
}

const raw = readFileSync(inputPath, "utf8");

// Separate frontmatter from body
const frontmatterMatch = /^(---\n[\s\S]*?\n---\n)/.exec(raw);
const frontmatter = frontmatterMatch ? frontmatterMatch[1] : "";
const body = frontmatterMatch ? raw.slice(frontmatterMatch[0].length) : raw;

// Split into non-empty paragraphs
const paragraphs = body
  .split(/\n{2,}/)
  .map((p) => p.trim())
  .filter(Boolean);

// The first 5 paragraphs should be the header row labels
const HEADER = ["Principal Investigator", "Title", "Journal", "Published", "Used Dataset ID"];

// Find where data rows start — skip any leading header-label paragraphs
let startIndex = 0;
if (paragraphs.slice(0, 5).join("\n") === HEADER.join("\n")) {
  startIndex = 5;
} else if (HEADER.includes(paragraphs[0])) {
  // partial match — skip however many header labels appear
  while (startIndex < paragraphs.length && HEADER.includes(paragraphs[startIndex])) {
    startIndex++;
  }
}

const dataParas = paragraphs.slice(startIndex);

if (dataParas.length % 5 !== 0) {
  console.warn(
    `Warning: ${dataParas.length} paragraphs after header — not a multiple of 5. ` +
      `Last ${dataParas.length % 5} paragraph(s) will be ignored.`,
  );
}

// Escape pipe characters inside a table cell (but not inside link syntax)
function escapeCell(s: string): string {
  // Collapse internal newlines to a space so each row stays on one line
  return s.replace(/\n/g, " ").replace(/\|/g, "\\|");
}

const rows: string[] = [];
const count = Math.floor(dataParas.length / 5);

for (let i = 0; i < count; i++) {
  const [pi, title, journal, published, datasets] = dataParas.slice(i * 5, i * 5 + 5);
  rows.push(
    `| ${escapeCell(pi)} | ${escapeCell(title)} | ${escapeCell(journal)} | ${escapeCell(published)} | ${escapeCell(datasets)} |`,
  );
}

const table = [
  `| Principal Investigator | Title | Journal | Published | Used Dataset ID |`,
  `| --- | --- | --- | --- | --- |`,
  ...rows,
].join("\n");

const output = frontmatter + table + "\n";
writeFileSync(outputPath, output, "utf8");

const resolvedOutput = path.resolve(outputPath);
console.log(`Wrote ${count} rows to ${resolvedOutput}`);
