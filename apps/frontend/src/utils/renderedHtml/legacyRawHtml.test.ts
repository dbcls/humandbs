import { describe, expect, test } from "bun:test";

import {
  datasetLegacyRawHtml,
  experimentDataFieldKey,
  getLegacyRawHtml,
  researchLegacyRawHtml,
} from "./legacyRawHtml";

const tv = (text: string, rawHtml: string | null) => ({ text, rawHtml });

describe("researchLegacyRawHtml", () => {
  test("maps in-scope fields to field → locale → legacy rawHtml", () => {
    const lookup = researchLegacyRawHtml({
      data: {
        summary: {
          aims: { ja: tv("a", "<aims-ja>"), en: tv("a", "<aims-en>") },
          methods: { ja: tv("m", "<methods-ja>"), en: null },
          targets: { ja: null, en: null },
        },
        releaseNote: { ja: null, en: tv("r", "<note-en>") },
      },
    });

    expect(getLegacyRawHtml(lookup, "aims", "ja")).toBe("<aims-ja>");
    expect(getLegacyRawHtml(lookup, "aims", "en")).toBe("<aims-en>");
    expect(getLegacyRawHtml(lookup, "methods", "ja")).toBe("<methods-ja>");
    expect(getLegacyRawHtml(lookup, "methods", "en")).toBeUndefined();
    expect(getLegacyRawHtml(lookup, "releaseNote", "en")).toBe("<note-en>");
  });

  test("null/absent legacy yields no entry (no key)", () => {
    const lookup = researchLegacyRawHtml({
      data: {
        summary: {
          aims: { ja: tv("a", null), en: tv("a", null) },
          methods: undefined,
          targets: null,
        },
      },
    });
    expect(lookup.aims).toBeUndefined();
    expect(lookup.methods).toBeUndefined();
    expect(lookup.targets).toBeUndefined();
    expect(lookup.releaseNote).toBeUndefined();
  });

  test("missing data does not throw", () => {
    expect(researchLegacyRawHtml({})).toEqual({});
    expect(researchLegacyRawHtml({ data: null })).toEqual({});
  });
});

describe("datasetLegacyRawHtml", () => {
  test("maps each experiment.data.* value, keyed by index + dataKey", () => {
    const lookup = datasetLegacyRawHtml({
      data: {
        experiments: [
          {
            data: {
              method: { ja: tv("m", "<m0-ja>"), en: tv("m", "<m0-en>") },
              empty: null,
            },
          },
          {
            data: {
              method: { ja: tv("m", "<m1-ja>"), en: null },
            },
          },
        ],
      },
    });

    expect(getLegacyRawHtml(lookup, experimentDataFieldKey(0, "method"), "ja")).toBe("<m0-ja>");
    expect(getLegacyRawHtml(lookup, experimentDataFieldKey(0, "method"), "en")).toBe("<m0-en>");
    expect(lookup[experimentDataFieldKey(0, "empty")]).toBeUndefined();
    expect(getLegacyRawHtml(lookup, experimentDataFieldKey(1, "method"), "ja")).toBe("<m1-ja>");
    expect(getLegacyRawHtml(lookup, experimentDataFieldKey(1, "method"), "en")).toBeUndefined();
  });

  test("missing experiments does not throw", () => {
    expect(datasetLegacyRawHtml({})).toEqual({});
    expect(datasetLegacyRawHtml({ data: { experiments: null } })).toEqual({});
  });
});

describe("no leak into submittable shape", () => {
  test("lookup is a separate object holding only strings, never the form value", () => {
    const lookup = researchLegacyRawHtml({
      data: { summary: { aims: { ja: tv("a", "<x>"), en: null } } },
    });
    // entry values are plain strings, not { text, rawHtml } objects
    expect(typeof lookup.aims.ja).toBe("string");
    expect(lookup.aims).not.toHaveProperty("text");
  });
});
