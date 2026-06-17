import { describe, expect, test } from "bun:test";

import type { ResearchDetailResponse } from "@humandbs/backend/types";

import { computeMergeFields } from "../routes/{-$lang}/_layout/_authed/admin/researches/-components/utils/computeMergeFields";
import { researchDetailToTemplate } from "../routes/{-$lang}/_layout/_authed/admin/researches/-components/utils/researchDetailToTemplate";

type ResearchDetailData = ResearchDetailResponse["data"];

/**
 * A research detail response carries both locales for every editable field plus
 * a number of detail-only fields the adapter ignores. We cast a partial object
 * to the data type — the adapter only reads the editable fields.
 */
function makeDetail(overrides: Partial<ResearchDetailData> = {}): ResearchDetailData {
  return {
    humId: "hum0001",
    title: { ja: "タイトル", en: "Title" },
    summary: {
      aims: { ja: { text: "目的" }, en: { text: "Aims" } },
      methods: { ja: { text: "方法" }, en: { text: "Methods" } },
      targets: { ja: { text: "対象" }, en: { text: "Targets" } },
      url: {
        ja: [{ text: "リンク", url: "https://example.jp" }],
        en: [{ text: "Link", url: "https://example.com" }],
      },
    },
    dataProvider: [
      { name: { ja: "提供者", en: "Provider" } },
    ],
    researchProject: [
      { title: { ja: "プロジェクト", en: "Project" } },
    ],
    grant: [
      { id: ["G1"], title: { ja: "助成", en: "Grant" }, agency: { name: { ja: "機関", en: "Agency" } } },
    ],
    relatedPublication: [
      { title: { ja: "論文", en: "Publication" }, doi: "10.1/x" },
    ],
    uids: ["user-1"],
    ...overrides,
  } as unknown as ResearchDetailData;
}

describe("researchDetailToTemplate", () => {
  test("stubs the J-DS-only fields", () => {
    const out = researchDetailToTemplate(makeDetail());
    expect(out.relatedAccessions).toEqual({ jgad: [] });
    expect(out.warnings).toEqual([]);
  });

  test("preserves both locales for every editable field", () => {
    const out = researchDetailToTemplate(makeDetail());

    expect(out.title).toEqual({ ja: "タイトル", en: "Title" });
    expect(out.summary?.aims).toEqual({ ja: { text: "目的" }, en: { text: "Aims" } });
    expect(out.summary?.methods).toEqual({ ja: { text: "方法" }, en: { text: "Methods" } });
    expect(out.summary?.targets).toEqual({ ja: { text: "対象" }, en: { text: "Targets" } });
    expect(out.summary?.url.ja).toEqual([{ text: "リンク", url: "https://example.jp" }]);
    expect(out.summary?.url.en).toEqual([{ text: "Link", url: "https://example.com" }]);
    expect(out.dataProvider).toHaveLength(1);
    expect(out.researchProject).toHaveLength(1);
    expect(out.grant).toHaveLength(1);
    expect(out.relatedPublication).toHaveLength(1);
    expect(out.humId).toBe("hum0001");
    expect(out.uids).toEqual(["user-1"]);
  });

  test("fills defaults for missing fields", () => {
    const out = researchDetailToTemplate(
      makeDetail({
        title: undefined,
        summary: undefined,
        dataProvider: undefined,
        researchProject: undefined,
        grant: undefined,
        relatedPublication: undefined,
        uids: undefined,
      } as Partial<ResearchDetailData>),
    );

    expect(out.title).toEqual({ ja: null, en: null });
    expect(out.summary).toEqual({
      aims: { ja: null, en: null },
      methods: { ja: null, en: null },
      targets: { ja: null, en: null },
      url: { ja: [], en: [] },
    });
    expect(out.dataProvider).toEqual([]);
    expect(out.researchProject).toEqual([]);
    expect(out.grant).toEqual([]);
    expect(out.relatedPublication).toEqual([]);
    expect(out.uids).toEqual([]);
  });

  test("adapter output flows through computeMergeFields with expected statuses", () => {
    const incoming = researchDetailToTemplate(makeDetail());
    // Current is empty → every incoming field can fill.
    const empty = researchDetailToTemplate(
      makeDetail({
        title: { ja: null, en: null },
        summary: {
          aims: { ja: null, en: null },
          methods: { ja: null, en: null },
          targets: { ja: null, en: null },
          url: { ja: [], en: [] },
        },
        dataProvider: [],
        researchProject: [],
        grant: [],
        relatedPublication: [],
      } as Partial<ResearchDetailData>),
    );

    const fields = computeMergeFields(empty, incoming);

    expect(fields.find((f) => f.key === "title.ja")?.status).toBe("can-fill");
    expect(fields.find((f) => f.key === "title.en")?.status).toBe("can-fill");
    expect(fields.find((f) => f.key === "summary.aims.ja")?.status).toBe("can-fill");
    expect(fields.find((f) => f.key === "dataProvider")?.status).toBe("can-fill");
    expect(fields.find((f) => f.key === "grant")?.status).toBe("can-fill");
  });
});
