import { describe, expect, test } from "bun:test";

import {
  addDatasetRenderedHtml,
  addResearchRenderedHtml,
  addResearchVersionsRenderedHtml,
  renderBilingualField,
} from "./transforms";

const tv = (text: string, rawHtml: string | null = null) => ({ text, rawHtml });

describe("renderBilingualField", () => {
  test("renders both sides' text into renderedHtml", async () => {
    const out = await renderBilingualField({ ja: tv("# 日本語"), en: tv("# English") });
    expect(out.ja?.renderedHtml).toContain("日本語");
    expect(out.en?.renderedHtml).toContain("English");
    // markdown actually rendered (heading, not raw text)
    expect(out.en?.renderedHtml).toContain("<h");
  });

  test("preserves rawHtml untouched", async () => {
    const out = await renderBilingualField({
      ja: tv("hello", "<legacy>ja</legacy>"),
      en: tv("hi", "<legacy>en</legacy>"),
    });
    expect(out.ja?.rawHtml).toBe("<legacy>ja</legacy>");
    expect(out.en?.rawHtml).toBe("<legacy>en</legacy>");
  });

  test("null sides pass through", async () => {
    const out = await renderBilingualField({ ja: null, en: tv("x") });
    expect(out.ja).toBeNull();
    expect(out.en?.renderedHtml).toBeDefined();
  });

  test("absent field yields { ja: null, en: null }", async () => {
    expect(await renderBilingualField(undefined)).toEqual({ ja: null, en: null });
    expect(await renderBilingualField(null)).toEqual({ ja: null, en: null });
  });
});

describe("addResearchRenderedHtml", () => {
  test("renders aims/methods/targets + releaseNote, leaves rawHtml", async () => {
    const res = await addResearchRenderedHtml({
      meta: { _seq_no: 1 },
      data: {
        humId: "hum0001",
        summary: {
          aims: { ja: tv("aims ja", "<a/>"), en: tv("aims en") },
          methods: { ja: null, en: tv("methods en") },
          targets: { ja: tv("targets ja"), en: null },
        },
        releaseNote: { ja: tv("note ja"), en: null },
      },
    });

    expect(res.data.summary.aims.ja?.renderedHtml).toContain("aims ja");
    expect(res.data.summary.aims.ja?.rawHtml).toBe("<a/>");
    expect(res.data.summary.methods.en?.renderedHtml).toContain("methods en");
    expect(res.data.summary.methods.ja).toBeNull();
    expect(res.data.summary.targets.ja?.renderedHtml).toContain("targets ja");
    expect(res.data.releaseNote.ja?.renderedHtml).toContain("note ja");
    // envelope + non-rendered data preserved
    expect(res.meta._seq_no).toBe(1);
    expect(res.data.humId).toBe("hum0001");
  });
});

describe("addResearchVersionsRenderedHtml", () => {
  test("renders releaseNote across the array", async () => {
    const res = await addResearchVersionsRenderedHtml({
      data: [
        { humVersionId: "hum0001-v1", releaseNote: { ja: tv("v1 ja"), en: null } },
        { humVersionId: "hum0001-v2", releaseNote: { ja: null, en: tv("v2 en") } },
      ],
    });

    expect(res.data[0].releaseNote.ja?.renderedHtml).toContain("v1 ja");
    expect(res.data[1].releaseNote.en?.renderedHtml).toContain("v2 en");
    expect(res.data[0].humVersionId).toBe("hum0001-v1");
  });
});

describe("addDatasetRenderedHtml", () => {
  test("walks experiment.data per key, ja/en independently; header untouched", async () => {
    const res = await addDatasetRenderedHtml({
      data: {
        datasetId: "JGAD000001",
        experiments: [
          {
            header: { ja: tv("ヘッダ"), en: tv("Header") },
            data: {
              method: { ja: tv("method ja", "<legacy/>"), en: tv("method en") },
              empty: null,
              oneSide: { ja: null, en: tv("only en") },
            },
          },
        ],
      },
    });

    const exp = res.data.experiments[0];
    expect(exp.data.method?.ja?.renderedHtml).toContain("method ja");
    expect(exp.data.method?.ja?.rawHtml).toBe("<legacy/>");
    expect(exp.data.method?.en?.renderedHtml).toContain("method en");
    expect(exp.data.empty).toEqual({ ja: null, en: null });
    expect(exp.data.oneSide?.ja).toBeNull();
    expect(exp.data.oneSide?.en?.renderedHtml).toContain("only en");
    // header is NOT given renderedHtml (out of scope)
    expect((exp.header.en as { renderedHtml?: string }).renderedHtml).toBeUndefined();
    expect(res.data.datasetId).toBe("JGAD000001");
  });

  test("empty experiments array does not throw", async () => {
    const res = await addDatasetRenderedHtml({ data: { experiments: [] } });
    expect(res.data.experiments).toEqual([]);
  });
});
