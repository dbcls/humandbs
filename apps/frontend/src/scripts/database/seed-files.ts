import { copyFile, mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Locale } from "@/config/i18n";
import { i18n } from "@/config/i18n";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

const DOCUMENTS_DIR = path.join(SCRIPT_DIR, "..", "seed-data", "documents");

const PUBLIC_FILES_DIR = path.join(
  SCRIPT_DIR,
  "..",
  "..",
  "..",
  "public",
  process.env.HUMANDBS_FRONTEND_PUBLIC_FILES_DIR ?? "public-files",
);

const SUPPORTED_LOCALES = i18n.locales;

type DocumentLocaleMap = Map<string, Map<Locale, { dir: string }>>;

async function collectDocumentPaths(
  dir: string,
  prefix: string,
  documents: DocumentLocaleMap,
  locale: Locale,
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error: unknown) {
    if ((error as { code?: unknown })?.code === "ENOENT") {
      console.warn(`Missing folder: ${dir}`);
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const segmentId = prefix ? `${prefix}/${entry.name}` : entry.name;
    const entryPath = path.join(dir, entry.name);
    const contentPath = path.join(entryPath, "content.md");

    try {
      await readFile(contentPath, "utf-8");
      if (!documents.has(segmentId)) documents.set(segmentId, new Map());
      documents.get(segmentId)!.set(locale, { dir: entryPath });
    } catch (error: unknown) {
      if ((error as { code?: unknown })?.code !== "ENOENT") {
        throw error;
      }
    }

    await collectDocumentPaths(entryPath, segmentId, documents, locale);
  }
}

async function loadDocuments(): Promise<DocumentLocaleMap> {
  const documents: DocumentLocaleMap = new Map();

  for (const locale of SUPPORTED_LOCALES) {
    const localeDir = path.join(DOCUMENTS_DIR, locale);
    await collectDocumentPaths(localeDir, "", documents, locale);
  }

  return documents;
}

async function copyDocumentFiles(documents: DocumentLocaleMap): Promise<number> {
  const copiedByDocumentId = new Map<string, Set<string>>();
  let totalCopied = 0;

  for (const [documentId, localeMap] of documents) {
    for (const [locale, { dir }] of localeMap) {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }

      const filesToCopy = entries.filter((e) => e.isFile() && e.name !== "content.md");

      if (filesToCopy.length === 0) continue;

      const destDir = path.join(PUBLIC_FILES_DIR, documentId);
      await mkdir(destDir, { recursive: true });

      if (!copiedByDocumentId.has(documentId)) {
        copiedByDocumentId.set(documentId, new Set());
      }
      const copied = copiedByDocumentId.get(documentId)!;

      for (const entry of filesToCopy) {
        if (copied.has(entry.name)) continue;
        const src = path.join(dir, entry.name);
        const dest = path.join(destDir, entry.name);
        await copyFile(src, dest);
        copied.add(entry.name);
        totalCopied++;
        console.log(`Copied: ${locale}/${documentId}/${entry.name} → ${destDir}/${entry.name}`);
      }
    }
  }

  return totalCopied;
}

if (import.meta.main) {
  loadDocuments()
    .then(async (documents) => {
      console.log(`Found ${documents.size} document(s)`);
      const count = await copyDocumentFiles(documents);
      console.log(`\nDone! Copied ${count} file(s) to ${PUBLIC_FILES_DIR}`);
    })
    .catch((err: unknown) => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
}
