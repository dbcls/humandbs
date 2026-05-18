import { describe, expect, it } from "bun:test"

import { parseBiosampleAttributes } from "@/api/external/ddbj-search/biosample"

describe("parseBiosampleAttributes", () => {
  it("extracts harmonized_name -> content for an Attribute array", () => {
    const properties = {
      BioSample: {
        Attributes: {
          Attribute: [
            {
              attribute_name: "sample_name",
              harmonized_name: "sample_name",
              display_name: "sample name",
              content: "DRS000001",
            },
            {
              attribute_name: "strain",
              harmonized_name: "strain",
              display_name: "strain",
              content: "BEST195",
            },
          ],
        },
      },
    }
    expect(parseBiosampleAttributes(properties)).toEqual({
      sample_name: "DRS000001",
      strain: "BEST195",
    })
  })

  it("falls back to attribute_name when harmonized_name is absent", () => {
    const properties = {
      BioSample: {
        Attributes: {
          Attribute: [
            { attribute_name: "sample comment", content: "free text comment" },
            { attribute_name: "common name", content: "Bacillus subtilis subsp. natto" },
          ],
        },
      },
    }
    expect(parseBiosampleAttributes(properties)).toEqual({
      "sample comment": "free text comment",
      "common name": "Bacillus subtilis subsp. natto",
    })
  })

  it("handles single-Attribute object (xmltodict returns non-array for length 1)", () => {
    const properties = {
      BioSample: {
        Attributes: {
          Attribute: {
            attribute_name: "strain",
            harmonized_name: "strain",
            content: "BEST195",
          },
        },
      },
    }
    expect(parseBiosampleAttributes(properties)).toEqual({ strain: "BEST195" })
  })

  it("falls back to #text when content is absent", () => {
    const properties = {
      BioSample: {
        Attributes: {
          Attribute: [
            { harmonized_name: "host", "#text": "Homo sapiens" },
          ],
        },
      },
    }
    expect(parseBiosampleAttributes(properties)).toEqual({
      host: "Homo sapiens",
    })
  })

  it("returns empty object for missing BioSample / Attributes / Attribute", () => {
    expect(parseBiosampleAttributes(undefined)).toEqual({})
    expect(parseBiosampleAttributes(null)).toEqual({})
    expect(parseBiosampleAttributes({})).toEqual({})
    expect(parseBiosampleAttributes({ BioSample: {} })).toEqual({})
    expect(parseBiosampleAttributes({ BioSample: { Attributes: {} } })).toEqual(
      {},
    )
  })

  it("skips attributes with neither harmonized_name nor attribute_name", () => {
    const properties = {
      BioSample: {
        Attributes: {
          Attribute: [
            { display_name: "missing keys", content: "ignored" },
            { harmonized_name: "tissue", content: "lung" },
          ],
        },
      },
    }
    expect(parseBiosampleAttributes(properties)).toEqual({ tissue: "lung" })
  })

  it("skips attributes with non-string content", () => {
    const properties = {
      BioSample: {
        Attributes: {
          Attribute: [
            { harmonized_name: "skipped_numeric", content: 42 },
            { harmonized_name: "kept", content: "value" },
          ],
        },
      },
    }
    expect(parseBiosampleAttributes(properties)).toEqual({ kept: "value" })
  })

  it("last-write-wins for duplicate keys (consistent with Record<string,string> shape)", () => {
    const properties = {
      BioSample: {
        Attributes: {
          Attribute: [
            { attribute_name: "sample comment", content: "first" },
            { attribute_name: "sample comment", content: "second" },
          ],
        },
      },
    }
    expect(parseBiosampleAttributes(properties)).toEqual({
      "sample comment": "second",
    })
  })
})
