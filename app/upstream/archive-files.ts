/**
 * Reading what the DDBJ public file server distributes for a dataset of DRA,
 * GEA or MetaboBank.
 *
 * The pure half of that source: where an accession's files are listed, and how
 * a listing becomes a size and a set of names. The requests are in
 * `archive-files.server.ts`. DDBJ Search's entries have no file sizes, so the
 * file server is the only place they are.
 *
 * **The size is what a reader downloads.** GEA distributes an experiment as
 * zips, and a zip is counted as it is rather than by what it unpacks to; its
 * contents are read only for their names, which is where the formats are.
 * The files that describe an entry rather than hold its data — GEA's and
 * MetaboBank's IDF and SDRF, and the file list itself — are not counted.
 */

import { mapConcurrently } from "~/concurrency"

export type ArchiveFilesKind = "dra" | "gea" | "metabobank"

const KIND_BY_PATTERN: readonly (readonly [RegExp, ArchiveFilesKind])[] = [
  [/^DRA\d{6}$/, "dra"],
  [/^E-GEAD-\d+$/, "gea"],
  [/^MTBKS\d+$/, "metabobank"],
]

/**
 * Which of the three an accession is, or null for one whose files this source
 * does not read — JGA's are the application system's, BioProject has none.
 */
export function archiveFilesKindOf(accession: string): ArchiveFilesKind | null {
  return KIND_BY_PATTERN.find(([pattern]) => pattern.test(accession))?.[1] ?? null
}

/** Paths are under the server's `public/` and have no leading slash. */
export function geaFileListPath(accession: string): string {
  const number = Number(accession.slice("E-GEAD-".length))
  const thousands = Math.floor(number / 1000) * 1000
  const directory = `E-GEAD-${thousands === 0 ? "000" : String(thousands)}`
  return `ddbj_database/gea/experiment/${directory}/${accession}/${accession}.filelist.txt`
}

export function metaboBankFileListPath(accession: string): string {
  return `metabobank/study/${accession}/${accession}.filelist.txt`
}

export function draDirectoryPath(accession: string): string {
  return `ddbj_database/dra/fastq/${accession.slice(0, 6)}/${accession}/`
}

export interface ListedFiles {
  byteCount: number
  /** The names the formats are read from. */
  names: string[]
}

function sizeOf(value: string | undefined, line: string): number {
  const size = Number(value)
  if (value === undefined || !/^\d+$/.test(value.trim()) || !Number.isSafeInteger(size)) {
    throw new Error(`a file list line has no size: ${line}`)
  }
  return size
}

function rowsOf(text: string): string[][] {
  return text.split("\n")
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.trim() !== "" && !line.startsWith("#"))
    .map((line) => line.split("\t"))
}

const DESCRIBING = /\.(?:idf|sdrf)\.txt$/i

/**
 * A GEA file list: `Archive` rows for the zips, each followed by `File` rows
 * for what it holds. `File` rows before the first zip are the experiment's own
 * files — its IDF and SDRF, which are not counted.
 */
export function readGeaFileList(text: string): ListedFiles {
  let byteCount = 0
  const names: string[] = []
  let archive: { name: string, members: number } | null = null
  const closeArchive = () => {
    if (archive !== null && archive.members === 0) names.push(archive.name)
  }
  for (const row of rowsOf(text)) {
    const [type, name = "", , size] = row
    if (type === "Archive") {
      closeArchive()
      byteCount += sizeOf(size, row.join("\t"))
      archive = { name, members: 0 }
    } else if (type === "File") {
      if (archive !== null) {
        archive.members += 1
        names.push(name)
      } else if (!DESCRIBING.test(name)) {
        byteCount += sizeOf(size, row.join("\t"))
        names.push(name)
      }
    } else {
      throw new Error(`a GEA file list line of an unknown type: ${row.join("\t")}`)
    }
  }
  closeArchive()
  return { byteCount, names }
}

const METABOBANK_DESCRIBING = new Set(["idf", "sdrf", "type"])

/** A MetaboBank file list: a header, then one row per file, typed by what the file is. */
export function readMetaboBankFileList(text: string): ListedFiles {
  let byteCount = 0
  const names: string[] = []
  for (const row of rowsOf(text)) {
    const [type = "", name = "", , size] = row
    if (METABOBANK_DESCRIBING.has(type.trim().toLowerCase())) continue
    byteCount += sizeOf(size, row.join("\t"))
    names.push(name)
  }
  return { byteCount, names }
}

export interface Listing {
  directories: string[]
  files: string[]
}

/**
 * The entries of a directory as the server lists it. Only relative links are
 * entries: the parent, the sort links and anything absolute are the page's own.
 */
export function readListing(html: string): Listing {
  const directories: string[] = []
  const files: string[] = []
  for (const [, href = ""] of html.matchAll(/href="([^"]*)"/g)) {
    if (href === "" || href.startsWith("?") || href.startsWith("/") || href.startsWith("../") || href.includes("://")) continue
    const name = decodeURIComponent(href)
    if (name.endsWith("/")) directories.push(name.slice(0, -1))
    else files.push(name)
  }
  return { directories: [...new Set(directories)], files: [...new Set(files)] }
}

/** The requests the DRA walk makes, supplied by the server half so tests can answer them. */
export interface PublicFiles {
  /** A text file or a directory listing, or null where there is none. */
  text: (path: string) => Promise<string | null>
  /** The size of one file. */
  size: (path: string) => Promise<number>
}

const DRA_CONCURRENCY = 4

/**
 * A DRA submission's fastq: one directory per experiment, each with its runs'
 * files. The listing rounds the sizes, so each file's own size is asked for.
 */
async function readDraFiles(accession: string, files: PublicFiles): Promise<ListedFiles | null> {
  const root = draDirectoryPath(accession)
  const listing = await files.text(root)
  if (listing === null) return null
  const experiments = readListing(listing).directories.filter((name) => /^DRX\d+$/.test(name)).sort()
  const paths = (await mapConcurrently(experiments, DRA_CONCURRENCY, async (experiment) => {
    const inside = await files.text(`${root}${experiment}/`)
    if (inside === null) throw new Error(`the listing of ${experiment} went away while ${accession} was read`)
    return readListing(inside).files.map((name) => `${root}${experiment}/${name}`)
  })).flat()
  const sizes = await mapConcurrently(paths, DRA_CONCURRENCY, (path) => files.size(path))
  return {
    byteCount: sizes.reduce((sum, size) => sum + size, 0),
    names: paths.map((path) => path.slice(path.lastIndexOf("/") + 1)),
  }
}

/** What the server distributes for an accession, or null where it has nothing for it. */
export async function readArchiveFiles(accession: string, files: PublicFiles): Promise<ListedFiles | null> {
  switch (archiveFilesKindOf(accession)) {
    case "dra":
      return readDraFiles(accession, files)
    case "gea": {
      const text = await files.text(geaFileListPath(accession))
      return text === null ? null : readGeaFileList(text)
    }
    case "metabobank": {
      const text = await files.text(metaboBankFileListPath(accession))
      return text === null ? null : readMetaboBankFileList(text)
    }
    case null:
      return null
  }
}
