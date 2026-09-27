import { describe, expect, it } from "vitest"

import { summarizeJgadFiles, summarizeListedFiles } from "./file-summary"

describe("summarizeJgadFiles", () => {
  it("adds up each dataset's files and reads its formats from how the names end", () => {
    const summaries = summarizeJgadFiles([
      { accession: "JGAD000626", nameEnding: "x.cel.encrypt", fileCount: 96, byteCount: 6627294298 },
      { accession: "JGAD000001", nameEnding: "x.fastq.gz.encrypt", fileCount: 10, byteCount: 1000 },
      { accession: "JGAD000001", nameEnding: "x.bam.bai.encrypt", fileCount: 2, byteCount: 20 },
      { accession: "JGAD000001", nameEnding: "x.bam.encrypt", fileCount: 2, byteCount: 300 },
      { accession: "JGAD000001", nameEnding: "x.table.encrypt", fileCount: 1, byteCount: 4 },
      { accession: "JGAD000002", nameEnding: "x.table.encrypt", fileCount: 3, byteCount: 5 },
      { accession: "JGAD000002", nameEnding: "x", fileCount: 2, byteCount: 6 },
    ])
    expect(summaries.rows).toEqual([
      { accession: "JGAD000626", byteCount: 6627294298, formats: ["cel"] },
      { accession: "JGAD000001", byteCount: 1324, formats: ["fastq", "bam", "bai"] },
      { accession: "JGAD000002", byteCount: 11, formats: [] },
    ])
    expect(summaries.unknown).toEqual(new Map([["table", 4], ["", 2]]))
  })

  it("makes no rows of nothing", () => {
    expect(summarizeJgadFiles([])).toEqual({ rows: [], unknown: new Map() })
  })
})

describe("summarizeListedFiles", () => {
  it("keeps each dataset the server had files for and counts the names that made no format", () => {
    const summaries = summarizeListedFiles([
      { accession: "E-GEAD-1076", files: { byteCount: 308971767, names: ["a.rds", "b.csv", "c.h5", "d.h5", "e.genes.results"] } },
      { accession: "E-GEAD-627", files: null },
      { accession: "DRA000001", files: { byteCount: 0, names: [] } },
    ])
    expect(summaries.rows).toEqual([
      { accession: "E-GEAD-1076", byteCount: 308971767, formats: ["csv", "rds", "hdf5"] },
      { accession: "DRA000001", byteCount: 0, formats: [] },
    ])
    expect(summaries.unknown).toEqual(new Map([["results", 1]]))
  })
})
