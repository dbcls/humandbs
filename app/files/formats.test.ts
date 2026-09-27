import { describe, expect, it } from "vitest"

import { codeFrom } from "~/admin/catalog"

import { FILE_FORMATS, readFileName, readFileNames, sortFormats } from "./formats"

describe("FILE_FORMATS", () => {
  it("gives every format a code made from its label, once", () => {
    const codes = FILE_FORMATS.map((one) => one.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const one of FILE_FORMATS) expect(one.code).toBe(codeFrom(one.label))
  })

  it("names each extension once, in lower case and without the dot", () => {
    const extensions = FILE_FORMATS.flatMap((one) => one.extensions)
    expect(new Set(extensions).size).toBe(extensions.length)
    for (const extension of extensions) expect(extension).toMatch(/^[a-z0-9]+$/)
  })

  it("has a format for each compression, so a compressed file of an unknown inside is still one", () => {
    for (const name of ["x.gz", "x.bz2", "x.zip"]) expect(readFileName(name).format).not.toBeNull()
  })
})

describe("readFileName", () => {
  it.each([
    ["hum0014.v8.ALT.zip", "zip"],
    ["hum0014.v5.AF.v1.txt.zip", "txt"],
    ["2410001A02_N0323.CEL.encrypt", "cel"],
    ["DRR658128_1.fastq.bz2", "fastq"],
    ["sample.fq.gz.encrypt", "fastq"],
    ["BD_PBMC_Donor1.h5", "hdf5"],
    ["chr1.vcf.gz.tbi.encrypt", "tbi"],
    ["chr1.g.vcf.gz", "vcf"],
    ["data.tar.gz", "tar"],
    ["data.tgz.encrypt", "tar"],
    ["S11152_R1.gz.encrypt", "gzip"],
    ["reads.R1.bz2", "bzip2"],
    ["run.zip.encrypt", "zip"],
    ["x..gz", "gzip"],
    ["processed/Sumstats_for_assoc_analysis.tsv", "tsv"],
    ["/lustre/jga/filesets/JGAZ000071125/2410017E06.CEL.encrypt", "cel"],
    ["C:\\data\\peaks.narrowPeak", "narrowpeak"],
    ["README.md", "markdown"],
  ])("reads %s as %s", (name, code) => {
    expect(readFileName(name)).toEqual({ format: code })
  })

  it.each([
    ["trait.cov.encrypt", "cov"],
    ["gene.genes.results", "results"],
    ["README", ""],
    [".bashrc", ""],
    ["sample.encrypt", ""],
    ["archive.gz.encrypt.bak", "bak"],
  ])("makes no format of %s and reports %j", (name, extension) => {
    expect(readFileName(name)).toEqual({ format: null, extension })
  })
})

describe("readFileNames", () => {
  it("lists each format once in the list's order and counts the extensions that made none", () => {
    const reading = readFileNames([
      "a.txt", "b.bam", "c.fastq.gz", "d.bam.bai", "e.fastq", "f.stats", "g.stats", "README",
    ])
    expect(reading.formats).toEqual(["fastq", "bam", "bai", "txt"])
    expect(reading.unknown).toEqual(new Map([["stats", 2], ["", 1]]))
  })

  it("reads nothing from no names", () => {
    expect(readFileNames([])).toEqual({ formats: [], unknown: new Map() })
  })
})

describe("sortFormats", () => {
  it("puts codes the list does not have last, alphabetically", () => {
    expect(sortFormats(["zz", "txt", "aa", "fastq", "txt"])).toEqual(["fastq", "txt", "aa", "zz"])
  })
})
