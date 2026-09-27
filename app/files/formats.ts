/**
 * The file formats a dataset's files are shown and filtered by, read off the
 * files' names.
 *
 * **The list is the vocabulary.** The terms of `file-type` are made from it and
 * nobody edits them on a screen (`admin/catalog.ts` の `SETTLED_VOCABULARIES`),
 * because what a file is follows from how its name ends. An extension the list
 * does not know is not made into a format: the refresh that reads it reports
 * how many files had it, and adding it here is a change to the code.
 *
 * **Only the end of a name is read.** A dot in the middle of a name cannot be
 * told apart from an extension (`hum0014.v8.ALT.zip`), so a name is read from
 * the right: JGA's `.encrypt` is taken off, then one compression, and the
 * extension before it is the format — or, where that is not one the list knows,
 * the compression itself is.
 */

import { codeFrom } from "~/admin/catalog"

/** The vocabulary the formats are the terms of. */
export const FILE_FORMAT_SET = { code: "file-type", labelJa: "ファイル形式", labelEn: "File format" } as const

export interface FileFormat {
  /** The term's code, which is also what a search names it by (`file-type:fastq`). */
  code: string
  /** The same in both languages: a format is called by its own name. */
  label: string
  /** How names end for it, lower-case and without the dot. */
  extensions: readonly string[]
}

function format(label: string, ...extensions: string[]): FileFormat {
  return { code: codeFrom(label), label, extensions }
}

/**
 * In the order the terms are listed in. Indexes and companion files (BAI, TBI,
 * HTML) are formats as well: a reader looking at a dataset of controlled
 * access has no other way to see what comes with the data.
 */
export const FILE_FORMATS: readonly FileFormat[] = [
  format("FASTQ", "fastq", "fq"),
  format("FASTA", "fasta", "fa", "fna"),
  format("FAST5", "fast5"),
  format("SFF", "sff"),
  format("CSFASTA", "csfasta"),
  format("QUAL", "qual"),
  format("BAM", "bam"),
  format("BAI", "bai"),
  format("CRAM", "cram"),
  format("CRAI", "crai"),
  format("SAM", "sam"),
  format("VCF", "vcf", "gvcf"),
  format("BCF", "bcf"),
  format("TBI", "tbi"),
  format("CSI", "csi"),
  format("IDX", "idx"),
  format("MAF", "maf"),
  format("BED", "bed"),
  format("BEDPE", "bedpe"),
  format("narrowPeak", "narrowpeak"),
  format("broadPeak", "broadpeak"),
  format("bigWig", "bw", "bigwig"),
  format("bedGraph", "bedgraph", "bdg"),
  format("WIG", "wig"),
  format("GTF", "gtf"),
  format("GFF", "gff", "gff3"),
  format("HIC", "hic"),
  format("BIM", "bim"),
  format("FAM", "fam"),
  format("PED", "ped"),
  format("MAP", "map"),
  format("PHENO", "pheno"),
  format("IDAT", "idat"),
  format("CEL", "cel"),
  format("CHP", "chp", "cychp"),
  format("BPM", "bpm"),
  format("ADAT", "adat"),
  format("NPX", "npx"),
  format("WIFF", "wiff"),
  format("AB1", "ab1"),
  format("FCS", "fcs"),
  format("TXT", "txt", "text"),
  format("TSV", "tsv", "tab"),
  format("CSV", "csv"),
  format("XLSX", "xlsx"),
  format("XLS", "xls"),
  format("JSON", "json"),
  format("XML", "xml"),
  format("PARQUET", "parquet"),
  format("MTX", "mtx"),
  format("RDS", "rds"),
  format("H5AD", "h5ad"),
  format("HDF5", "h5", "hdf5"),
  format("CLOUPE", "cloupe"),
  format("HTML", "html", "htm"),
  format("Markdown", "md"),
  format("PDF", "pdf"),
  format("DOCX", "docx"),
  format("DOC", "doc"),
  format("PPTX", "pptx"),
  format("PNG", "png"),
  format("JPEG", "jpg", "jpeg"),
  format("TIFF", "tif", "tiff"),
  format("QPTIFF", "qptiff"),
  format("SVS", "svs"),
  format("NDPI", "ndpi"),
  format("NIfTI", "nii"),
  format("TAR", "tar", "tgz"),
  format("GENOZIP", "genozip"),
  format("ZIP", "zip"),
  format("GZIP", "gz"),
  format("BZIP2", "bz2"),
]

/**
 * The compressions a name may end in over the format's own extension. The
 * format a compressed file is shown as is the one inside, and the compression
 * only where the inside is not a format.
 */
const COMPRESSIONS: ReadonlySet<string> = new Set(["gz", "bz2", "zip"])

/** The extension JGA adds to a file it distributes encrypted; the format is the one before it. */
const ENCRYPTED = "encrypt"

const FORMAT_BY_EXTENSION: ReadonlyMap<string, string> = new Map(
  FILE_FORMATS.flatMap((one) => one.extensions.map((extension): [string, string] => [extension, one.code])),
)

const ORDER: ReadonlyMap<string, number> = new Map(FILE_FORMATS.map((one, index) => [one.code, index]))

/**
 * What a name was read as: a format, or the extension that made none — the
 * empty string where the name has no extension at all.
 */
export type NameReading = { format: string } | { format: null, extension: string }

export function readFileName(name: string): NameReading {
  const base = name.slice(Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\")) + 1).toLowerCase()
  // A name that only starts with a dot (`.bashrc`) is a name, not an extension.
  const parts = base.replace(/^\.+/, "").split(".").slice(1)
  if (parts.at(-1) === ENCRYPTED) parts.pop()
  const compression = COMPRESSIONS.has(parts.at(-1) ?? "") ? parts.pop() : undefined
  const extension = parts.at(-1) ?? ""
  const found = FORMAT_BY_EXTENSION.get(extension)
  if (found !== undefined) return { format: found }
  if (compression !== undefined) return { format: FORMAT_BY_EXTENSION.get(compression) ?? compression }
  return { format: null, extension }
}

export interface NamesReading {
  /** The formats found, in the list's order and each once. */
  formats: string[]
  /** How many names ended in each extension that made no format. */
  unknown: Map<string, number>
}

export function readFileNames(names: Iterable<string>): NamesReading {
  const formats = new Set<string>()
  const unknown = new Map<string, number>()
  for (const name of names) {
    const reading = readFileName(name)
    if (reading.format !== null) formats.add(reading.format)
    else unknown.set(reading.extension, (unknown.get(reading.extension) ?? 0) + 1)
  }
  return { formats: sortFormats(formats), unknown }
}

/** Format codes in the list's order; a code the list does not have goes last. */
export function sortFormats(codes: Iterable<string>): string[] {
  const last = FILE_FORMATS.length
  return [...new Set(codes)].toSorted((a, b) => (ORDER.get(a) ?? last) - (ORDER.get(b) ?? last) || a.localeCompare(b))
}
