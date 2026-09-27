import { describe, expect, it } from "vitest"

import {
  archiveFilesKindOf,
  draDirectoryPath,
  geaFileListPath,
  metaboBankFileListPath,
  readArchiveFiles,
  readGeaFileList,
  readListing,
  readMetaboBankFileList,
  type PublicFiles,
} from "./archive-files"

const GEA_1053 = [
  "#Archive/File\tName\tTime\tSize\tMD5",
  "File\tE-GEAD-1053.idf.txt\t2025-01-01T00:00:00Z\t2588\ta",
  "File\tE-GEAD-1053.sdrf.txt\t2025-01-01T00:00:00Z\t55752\tb",
  "Archive\tE-GEAD-1053.raw.zip\t2025-01-01T00:00:00Z\t358\tc",
  "File\traw-data-available-jga.txt\t2025-01-01T00:00:00Z\t214\td",
  "Archive\tE-GEAD-1053.processed.zip\t2025-01-01T00:00:00Z\t346755506064\te",
  "File\tTodai_001.tar\t2025-01-01T00:00:00Z\t2891950080\tf",
  "File\tTodai_002.tar\t2025-01-01T00:00:00Z\t3249735680\tg",
  "",
].join("\n")

const MTBKS213 = [
  "Type\tName\tTime\tSize\tMD5",
  "IDF\tMTBKS213.idf.txt\t2022-11-04T02:17:05Z\t5311\ta",
  "SDRF\tMTBKS213.sdrf.txt\t2022-11-02T08:39:32Z\t242361\tb",
  "processed\tprocessed/Sumstats_for_assoc_analysis.tsv\t2022-11-02T08:39:32Z\t38861\tc",
  "processed\tprocessed/Sumstats_for_assoc_analysis_CE.tsv\t2022-11-02T08:39:32Z\t18432\td",
].join("\r\n")

function listing(...hrefs: string[]): string {
  return [
    `<tr><td><a href="?C=N;O=D">Name</a></td></tr>`,
    `<tr><td><a href="/public/ddbj_database/dra/fastq/DRA029/">Parent Directory</a></td></tr>`,
    ...hrefs.map((href) => `<tr><td><a href="${href}">${href}</a></td><td align="right"> 6.5G</td></tr>`),
  ].join("\n")
}

describe("archiveFilesKindOf", () => {
  it.each([
    ["DRA029128", "dra"],
    ["E-GEAD-1076", "gea"],
    ["E-GEAD-12", "gea"],
    ["MTBKS213", "metabobank"],
  ])("reads %s as %s", (accession, kind) => {
    expect(archiveFilesKindOf(accession)).toBe(kind)
  })

  it.each(["JGAD000001", "PRJDB1234", "DRA02912", "DRX1036746", "hum0014.v1.freq.v1", "NHA000001", ""])("reads nothing of %j", (accession) => {
    expect(archiveFilesKindOf(accession)).toBeNull()
  })
})

describe("the paths", () => {
  it("puts a GEA experiment in the directory of its thousand", () => {
    expect(geaFileListPath("E-GEAD-627")).toBe("ddbj_database/gea/experiment/E-GEAD-000/E-GEAD-627/E-GEAD-627.filelist.txt")
    expect(geaFileListPath("E-GEAD-999")).toBe("ddbj_database/gea/experiment/E-GEAD-000/E-GEAD-999/E-GEAD-999.filelist.txt")
    expect(geaFileListPath("E-GEAD-1000")).toBe("ddbj_database/gea/experiment/E-GEAD-1000/E-GEAD-1000/E-GEAD-1000.filelist.txt")
    expect(geaFileListPath("E-GEAD-2076")).toBe("ddbj_database/gea/experiment/E-GEAD-2000/E-GEAD-2076/E-GEAD-2076.filelist.txt")
  })

  it("puts MetaboBank and DRA where the server has them", () => {
    expect(metaboBankFileListPath("MTBKS213")).toBe("metabobank/study/MTBKS213/MTBKS213.filelist.txt")
    expect(draDirectoryPath("DRA029128")).toBe("ddbj_database/dra/fastq/DRA029/DRA029128/")
  })
})

describe("readGeaFileList", () => {
  it("counts the zips as they are and reads the formats from what they hold", () => {
    expect(readGeaFileList(GEA_1053)).toEqual({
      byteCount: 358 + 346755506064,
      names: ["raw-data-available-jga.txt", "Todai_001.tar", "Todai_002.tar"],
    })
  })

  it("names a zip whose contents are not listed by the zip itself", () => {
    const text = "#Archive/File\tName\tTime\tSize\tMD5\nArchive\tE-GEAD-1.processed.zip\tt\t10\tm\n"
    expect(readGeaFileList(text)).toEqual({ byteCount: 10, names: ["E-GEAD-1.processed.zip"] })
  })

  it("counts a data file that is in no zip, but never the IDF and SDRF", () => {
    const text = "File\tE-GEAD-1.idf.txt\tt\t1\tm\nFile\tE-GEAD-1.SDRF.txt\tt\t2\tm\nFile\tcounts.tsv\tt\t30\tm\n"
    expect(readGeaFileList(text)).toEqual({ byteCount: 30, names: ["counts.tsv"] })
  })

  it("stops at a line with no size rather than counting less than there is", () => {
    expect(() => readGeaFileList("Archive\tE-GEAD-1.raw.zip\tt\t-\tm\n")).toThrow(/no size/)
    expect(() => readGeaFileList("Archive\tE-GEAD-1.raw.zip\n")).toThrow(/no size/)
  })

  it("stops at a line of a type it does not know", () => {
    expect(() => readGeaFileList("Folder\tx\tt\t1\tm\n")).toThrow(/unknown type/)
  })

  it("reads an empty list as nothing", () => {
    expect(readGeaFileList("#Archive/File\tName\tTime\tSize\tMD5\n")).toEqual({ byteCount: 0, names: [] })
  })
})

describe("readMetaboBankFileList", () => {
  it("counts the data files and leaves out the IDF and SDRF", () => {
    expect(readMetaboBankFileList(MTBKS213)).toEqual({
      byteCount: 38861 + 18432,
      names: ["processed/Sumstats_for_assoc_analysis.tsv", "processed/Sumstats_for_assoc_analysis_CE.tsv"],
    })
  })

  it("stops at a line with no size", () => {
    expect(() => readMetaboBankFileList("raw\tx.raw\tt\t\tm\n")).toThrow(/no size/)
  })
})

describe("readListing", () => {
  it("keeps the entries and leaves out the page's own links", () => {
    const html = listing("DRA029128.run.xml", "DRX1036746/", "DRX1036747/", "DRR1061135_1.fastq.bz2", "https://example.org/x", "../")
    expect(readListing(html)).toEqual({
      directories: ["DRX1036746", "DRX1036747"],
      files: ["DRA029128.run.xml", "DRR1061135_1.fastq.bz2"],
    })
  })

  it("decodes an escaped name", () => {
    expect(readListing(listing("a%20b.txt")).files).toEqual(["a b.txt"])
  })
})

describe("readArchiveFiles", () => {
  function server(texts: Record<string, string>, sizes: Record<string, number>): PublicFiles & { asked: string[] } {
    const asked: string[] = []
    return {
      asked,
      text: (path) => {
        asked.push(path)
        return Promise.resolve(texts[path] ?? null)
      },
      size: (path) => {
        asked.push(`HEAD ${path}`)
        const size = sizes[path]
        return size === undefined ? Promise.reject(new Error(`no ${path}`)) : Promise.resolve(size)
      },
    }
  }

  it("adds up each fastq of each experiment of a DRA submission by the file's own size", async () => {
    const root = "ddbj_database/dra/fastq/DRA029/DRA029128/"
    const files = server({
      [root]: listing("DRA029128.run.xml", "DRX2/", "DRX1/"),
      [`${root}DRX1/`]: listing("DRR1_1.fastq.bz2", "DRR1_2.fastq.bz2"),
      [`${root}DRX2/`]: listing("DRR2.fastq.bz2"),
    }, {
      [`${root}DRX1/DRR1_1.fastq.bz2`]: 7016758511,
      [`${root}DRX1/DRR1_2.fastq.bz2`]: 7043161093,
      [`${root}DRX2/DRR2.fastq.bz2`]: 5,
    })
    expect(await readArchiveFiles("DRA029128", files)).toEqual({
      byteCount: 7016758511 + 7043161093 + 5,
      names: ["DRR1_1.fastq.bz2", "DRR1_2.fastq.bz2", "DRR2.fastq.bz2"],
    })
  })

  it("reads nothing of a submission the server has no directory for", async () => {
    expect(await readArchiveFiles("DRA000001", server({}, {}))).toBeNull()
  })

  it("fails when a file's size cannot be had, rather than counting less", async () => {
    const root = "ddbj_database/dra/fastq/DRA000/DRA000001/"
    const files = server({ [root]: listing("DRX1/"), [`${root}DRX1/`]: listing("DRR1.fastq.bz2") }, {})
    await expect(readArchiveFiles("DRA000001", files)).rejects.toThrow()
  })

  it("fails when an experiment's listing goes away in the middle", async () => {
    const root = "ddbj_database/dra/fastq/DRA000/DRA000001/"
    await expect(readArchiveFiles("DRA000001", server({ [root]: listing("DRX1/") }, {}))).rejects.toThrow(/went away/)
  })

  it("reads GEA and MetaboBank from their file lists", async () => {
    const files = server({
      [geaFileListPath("E-GEAD-1053")]: GEA_1053,
      [metaboBankFileListPath("MTBKS213")]: MTBKS213,
    }, {})
    expect((await readArchiveFiles("E-GEAD-1053", files))?.byteCount).toBe(358 + 346755506064)
    expect((await readArchiveFiles("MTBKS213", files))?.byteCount).toBe(38861 + 18432)
    expect(await readArchiveFiles("E-GEAD-627", files)).toBeNull()
  })

  it("asks nothing for an accession whose files are not on the server", async () => {
    const files = server({}, {})
    expect(await readArchiveFiles("JGAD000001", files)).toBeNull()
    expect(files.asked).toEqual([])
  })
})
