import { describe, expect, test } from "bun:test";

import type { ResearchTemplateData } from "../../../backend/src/api/types/templates";
import { applyMergeDecisions } from "../routes/{-$lang}/_layout/_authed/admin/researches/-components/utils/applyMergeDecisions";
import { arrayCodecs } from "../routes/{-$lang}/_layout/_authed/admin/researches/-components/utils/arrayCodecs/index";
import { computeMergeFields } from "../routes/{-$lang}/_layout/_authed/admin/researches/-components/utils/computeMergeFields";

const emptyResearch: ResearchTemplateData = {
  humId: "",
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
  relatedAccessions: { jgad: [] },
  warnings: [],
};

function makeResearch(overrides: Partial<ResearchTemplateData>): ResearchTemplateData {
  return { ...emptyResearch, ...overrides };
}

// ── computeMergeFields ──────────────────────────────────────────────────────

describe("computeMergeFields – scalar (title.ja)", () => {
  test("can-fill: current empty, incoming has value", () => {
    const fields = computeMergeFields(
      makeResearch({ title: { ja: null, en: null } }),
      makeResearch({ title: { ja: "タイトル", en: null } }),
    );
    expect(fields.find((f) => f.key === "title.ja")?.status).toBe("can-fill");
  });

  test("conflict: both non-empty and different", () => {
    const fields = computeMergeFields(
      makeResearch({ title: { ja: "現在", en: null } }),
      makeResearch({ title: { ja: "新しい", en: null } }),
    );
    expect(fields.find((f) => f.key === "title.ja")?.status).toBe("conflict");
  });

  test("same: both values equal", () => {
    const fields = computeMergeFields(
      makeResearch({ title: { ja: "同じ", en: null } }),
      makeResearch({ title: { ja: "同じ", en: null } }),
    );
    expect(fields.find((f) => f.key === "title.ja")?.status).toBe("same");
  });

  test("na: incoming is empty", () => {
    const fields = computeMergeFields(
      makeResearch({ title: { ja: "現在", en: null } }),
      makeResearch({ title: { ja: null, en: null } }),
    );
    expect(fields.find((f) => f.key === "title.ja")?.status).toBe("na");
  });
});

describe("computeMergeFields – bilingual sub-field (summary.aims.ja)", () => {
  test("can-fill: current empty, incoming has value", () => {
    const fields = computeMergeFields(
      makeResearch({
        summary: {
          aims: { ja: null, en: null },
          methods: { ja: null, en: null },
          targets: { ja: null, en: null },
          url: { ja: [], en: [] },
        },
      }),
      makeResearch({
        summary: {
          aims: { ja: { text: "目的" }, en: null },
          methods: { ja: null, en: null },
          targets: { ja: null, en: null },
          url: { ja: [], en: [] },
        },
      }),
    );
    expect(fields.find((f) => f.key === "summary.aims.ja")?.status).toBe("can-fill");
  });

  test("conflict: both non-empty and different", () => {
    const fields = computeMergeFields(
      makeResearch({
        summary: {
          aims: { ja: { text: "旧" }, en: null },
          methods: { ja: null, en: null },
          targets: { ja: null, en: null },
          url: { ja: [], en: [] },
        },
      }),
      makeResearch({
        summary: {
          aims: { ja: { text: "新" }, en: null },
          methods: { ja: null, en: null },
          targets: { ja: null, en: null },
          url: { ja: [], en: [] },
        },
      }),
    );
    expect(fields.find((f) => f.key === "summary.aims.ja")?.status).toBe("conflict");
  });

  test("same: both values equal", () => {
    const fields = computeMergeFields(
      makeResearch({
        summary: {
          aims: { ja: { text: "同じ" }, en: null },
          methods: { ja: null, en: null },
          targets: { ja: null, en: null },
          url: { ja: [], en: [] },
        },
      }),
      makeResearch({
        summary: {
          aims: { ja: { text: "同じ" }, en: null },
          methods: { ja: null, en: null },
          targets: { ja: null, en: null },
          url: { ja: [], en: [] },
        },
      }),
    );
    expect(fields.find((f) => f.key === "summary.aims.ja")?.status).toBe("same");
  });

  test("na: incoming is empty", () => {
    const fields = computeMergeFields(
      makeResearch({
        summary: {
          aims: { ja: { text: "旧" }, en: null },
          methods: { ja: null, en: null },
          targets: { ja: null, en: null },
          url: { ja: [], en: [] },
        },
      }),
      makeResearch({
        summary: {
          aims: { ja: null, en: null },
          methods: { ja: null, en: null },
          targets: { ja: null, en: null },
          url: { ja: [], en: [] },
        },
      }),
    );
    expect(fields.find((f) => f.key === "summary.aims.ja")?.status).toBe("na");
  });
});

describe("computeMergeFields – array field (dataProvider)", () => {
  const provider = {
    name: { ja: { text: "提供者" }, en: { text: "Provider" } },
    email: "a@example.com",
    orcid: null,
    organization: null,
  };

  test("can-fill: current empty, incoming has items", () => {
    const fields = computeMergeFields(
      makeResearch({ dataProvider: [] }),
      makeResearch({ dataProvider: [provider] }),
    );
    expect(fields.find((f) => f.key === "dataProvider")?.status).toBe("can-fill");
  });

  test("conflict: both have items", () => {
    const fields = computeMergeFields(
      makeResearch({ dataProvider: [provider] }),
      makeResearch({ dataProvider: [{ ...provider, email: "b@example.com" }] }),
    );
    expect(fields.find((f) => f.key === "dataProvider")?.status).toBe("conflict");
  });

  test("same: both identical", () => {
    const fields = computeMergeFields(
      makeResearch({ dataProvider: [provider] }),
      makeResearch({ dataProvider: [provider] }),
    );
    expect(fields.find((f) => f.key === "dataProvider")?.status).toBe("same");
  });

  test("na: incoming is empty", () => {
    const fields = computeMergeFields(
      makeResearch({ dataProvider: [provider] }),
      makeResearch({ dataProvider: [] }),
    );
    expect(fields.find((f) => f.key === "dataProvider")?.status).toBe("na");
  });
});

// ── applyMergeDecisions ─────────────────────────────────────────────────────

describe("applyMergeDecisions – scalar field (title.ja)", () => {
  const current = makeResearch({ title: { ja: "現在", en: null } });
  const incoming = makeResearch({ title: { ja: "新しい", en: null } });
  const fields = computeMergeFields(current, incoming);

  test("accepted → incoming value", () => {
    const result = applyMergeDecisions(fields, { "title.ja": "accepted" }, {});
    expect(result.title.ja).toBe("新しい");
  });

  test("rejected → current value", () => {
    const result = applyMergeDecisions(fields, { "title.ja": "rejected" }, {});
    expect(result.title.ja).toBe("現在");
  });

  test("custom → custom value", () => {
    const result = applyMergeDecisions(
      fields,
      { "title.ja": "custom" },
      { "title.ja": "カスタム" },
    );
    expect(result.title.ja).toBe("カスタム");
  });

  test("pending → current value (keep current)", () => {
    const result = applyMergeDecisions(fields, { "title.ja": "pending" }, {});
    expect(result.title.ja).toBe("現在");
  });
});

describe("applyMergeDecisions – array field (dataProvider)", () => {
  const providerA = {
    name: { ja: { text: "A" }, en: { text: "A" } },
    email: "a@example.com",
    orcid: null,
    organization: null,
  };
  const providerB = {
    name: { ja: { text: "B" }, en: { text: "B" } },
    email: "b@example.com",
    orcid: null,
    organization: null,
  };
  const current = makeResearch({ dataProvider: [providerA] });
  const incoming = makeResearch({ dataProvider: [providerB] });
  const fields = computeMergeFields(current, incoming);

  test("accepted → incoming array", () => {
    const result = applyMergeDecisions(fields, { dataProvider: "accepted" }, {});
    expect(result.dataProvider).toEqual([providerB]);
  });

  test("rejected → current array", () => {
    const result = applyMergeDecisions(fields, { dataProvider: "rejected" }, {});
    expect(result.dataProvider).toEqual([providerA]);
  });

  test("custom → custom array", () => {
    const customArr = [providerA, providerB];
    const result = applyMergeDecisions(
      fields,
      { dataProvider: "custom" },
      { dataProvider: customArr },
    );
    expect(result.dataProvider).toEqual(customArr);
  });

  test("pending → current array", () => {
    const result = applyMergeDecisions(fields, { dataProvider: "pending" }, {});
    expect(result.dataProvider).toEqual([providerA]);
  });
});

// ── summary text-value shape ─────────────────────────────────────────────────

describe("applyMergeDecisions – summary sub-field preserves {text} shape", () => {
  const summary = (aims: unknown, methods: unknown = null) => ({
    aims: { ja: aims, en: null },
    methods: { ja: methods, en: null },
    targets: { ja: null, en: null },
    url: { ja: [], en: [] },
  });

  const current = makeResearch({ summary: summary({ text: "旧目的" }) });
  const incoming = makeResearch({ summary: summary({ text: "新目的" }) });
  const fields = computeMergeFields(current, incoming);

  test("accepted → result contains {text} object, not bare string", () => {
    const result = applyMergeDecisions(fields, { "summary.aims.ja": "accepted" }, {});
    expect(result.summary.aims.ja).toEqual({ text: "新目的" });
  });

  test("rejected → current {text} object is preserved", () => {
    const result = applyMergeDecisions(fields, { "summary.aims.ja": "rejected" }, {});
    expect(result.summary.aims.ja).toEqual({ text: "旧目的" });
  });

  test("custom → custom {text} object is used verbatim", () => {
    const custom = { text: "カスタム目的" };
    const result = applyMergeDecisions(
      fields,
      { "summary.aims.ja": "custom" },
      { "summary.aims.ja": custom },
    );
    expect(result.summary.aims.ja).toEqual(custom);
  });

  test("accepted aims.ja does not affect methods.ja", () => {
    const withMethods = makeResearch({ summary: summary({ text: "旧目的" }, { text: "旧方法" }) });
    const incomingWithMethods = makeResearch({
      summary: summary({ text: "新目的" }, { text: "新方法" }),
    });
    const f = computeMergeFields(withMethods, incomingWithMethods);
    const result = applyMergeDecisions(f, { "summary.aims.ja": "accepted" }, {});
    expect(result.summary.aims.ja).toEqual({ text: "新目的" });
    expect(result.summary.methods.ja).toEqual({ text: "旧方法" });
  });
});

// ── URL array sub-fields ──────────────────────────────────────────────────────

describe("applyMergeDecisions – summary.url.ja and summary.url.en are independent", () => {
  const urlJa = [{ text: "日本語サイト", url: "https://ja.example.com" }];
  const urlEn = [{ text: "English site", url: "https://en.example.com" }];
  const incomingUrlJa = [{ text: "新日本語", url: "https://new-ja.example.com" }];

  const current = makeResearch({
    summary: {
      aims: { ja: null, en: null },
      methods: { ja: null, en: null },
      targets: { ja: null, en: null },
      url: { ja: urlJa, en: urlEn },
    },
  });
  const incoming = makeResearch({
    summary: {
      aims: { ja: null, en: null },
      methods: { ja: null, en: null },
      targets: { ja: null, en: null },
      url: { ja: incomingUrlJa, en: [] },
    },
  });
  const fields = computeMergeFields(current, incoming);

  test("accepted url.ja → incoming items used; pending url.en → current items kept", () => {
    const result = applyMergeDecisions(fields, { "summary.url.ja": "accepted" }, {});
    expect(result.summary.url.ja).toEqual(incomingUrlJa);
    expect(result.summary.url.en).toEqual(urlEn);
  });

  test("rejected url.ja → current items kept; accepted url.en still works from its own decision", () => {
    const result = applyMergeDecisions(
      fields,
      { "summary.url.ja": "rejected", "summary.url.en": "accepted" },
      {},
    );
    expect(result.summary.url.ja).toEqual(urlJa);
    // url.en incoming is [] but accepted means incoming wins (empty array)
    expect(result.summary.url.en).toEqual([]);
  });

  test("custom url.ja → custom array; url.en unaffected", () => {
    const customUrls = [{ text: "カスタム", url: "https://custom.example.com" }];
    const result = applyMergeDecisions(
      fields,
      { "summary.url.ja": "custom" },
      { "summary.url.ja": customUrls },
    );
    expect(result.summary.url.ja).toEqual(customUrls);
    expect(result.summary.url.en).toEqual(urlEn);
  });
});

// ── multi-field independence ─────────────────────────────────────────────────

describe("applyMergeDecisions – independent decisions on sibling fields", () => {
  const current = makeResearch({ title: { ja: "現在JA", en: "Current EN" } });
  const incoming = makeResearch({ title: { ja: "新JA", en: "New EN" } });
  const fields = computeMergeFields(current, incoming);

  test("accepted title.ja does not overwrite pending title.en", () => {
    const result = applyMergeDecisions(fields, { "title.ja": "accepted" }, {});
    expect(result.title.ja).toBe("新JA");
    expect(result.title.en).toBe("Current EN");
  });

  test("accepted title.en does not overwrite rejected title.ja", () => {
    const result = applyMergeDecisions(
      fields,
      { "title.ja": "rejected", "title.en": "accepted" },
      {},
    );
    expect(result.title.ja).toBe("現在JA");
    expect(result.title.en).toBe("New EN");
  });

  test("custom on one sub-field does not affect sibling", () => {
    const result = applyMergeDecisions(
      fields,
      { "title.ja": "custom" },
      { "title.ja": "カスタム" },
    );
    expect(result.title.ja).toBe("カスタム");
    expect(result.title.en).toBe("Current EN");
  });
});

// ── codec round-trips ────────────────────────────────────────────────────────

describe("providerCodec – fromItem/toItem round-trip", () => {
  const { fromItem, toItem } = arrayCodecs.providers;

  test("full provider with org and country", () => {
    const item = {
      name: { ja: { text: "田中太郎" }, en: { text: "Taro Tanaka" } },
      email: "taro@example.com",
      orcid: "0000-0001-2345-6789",
      organization: {
        name: { ja: { text: "国立研究所" }, en: { text: "National Institute" } },
        address: { country: "Japan" },
      },
    };
    expect(toItem(fromItem(item))).toEqual(item);
  });

  test("null email and orcid", () => {
    const item = {
      name: { ja: { text: "山田花子" }, en: { text: "Hanako Yamada" } },
      email: null,
      orcid: null,
      organization: {
        name: { ja: { text: "大学" }, en: { text: "University" } },
        address: null,
      },
    };
    expect(toItem(fromItem(item))).toEqual(item);
  });

  test("no organization (null)", () => {
    const item = {
      name: { ja: { text: "佐藤" }, en: { text: "Sato" } },
      email: "sato@example.com",
      orcid: null,
      organization: null,
    };
    expect(toItem(fromItem(item))).toEqual(item);
  });

  test("org with no country (address null)", () => {
    const item = {
      name: { ja: null, en: { text: "Smith" } },
      email: null,
      orcid: null,
      organization: {
        name: { ja: null, en: { text: "Lab" } },
        address: null,
      },
    };
    expect(toItem(fromItem(item))).toEqual(item);
  });
});

describe("projectCodec – fromItem/toItem round-trip", () => {
  const { fromItem, toItem } = arrayCodecs.projects;

  test("project with both bilingual urls", () => {
    const item = {
      name: { ja: { text: "プロジェクト" }, en: { text: "Project" } },
      url: {
        ja: { text: "日本語サイト", url: "https://ja.example.com" },
        en: { text: "English site", url: "https://en.example.com" },
      },
    };
    expect(toItem(fromItem(item))).toEqual(item);
  });

  test("project with only url.en (url.ja null)", () => {
    const item = {
      name: { ja: null, en: { text: "Project B" } },
      url: {
        ja: null,
        en: { text: "Site", url: "https://en.example.com" },
      },
    };
    expect(toItem(fromItem(item))).toEqual(item);
  });

  test("project with no url (null)", () => {
    const item = {
      name: { ja: { text: "プロジェクトC" }, en: null },
      url: null,
    };
    expect(toItem(fromItem(item))).toEqual(item);
  });
});

describe("grantCodec – fromItem/toItem round-trip", () => {
  const { fromItem, toItem } = arrayCodecs.grants;

  test("full grant with ids, title, and agency", () => {
    const item = {
      id: ["JP12345678", "JP87654321"],
      title: { ja: "研究課題", en: "Research Grant" },
      agency: { name: { ja: "科研費", en: "JSPS" } },
    };
    expect(toItem(fromItem(item))).toEqual(item);
  });

  test("empty id array — agency name null normalises to empty string", () => {
    // grantCodec stores bare strings; null agency name → "" in card → "" in toItem output
    const item = {
      id: [],
      title: { ja: "課題", en: "Task" },
      agency: { name: { ja: "", en: "" } },
    };
    expect(toItem(fromItem(item))).toEqual(item);
  });

  test("null title and agency fields normalise to empty strings", () => {
    // grantCodec uses bare strings, not {text} objects; null → "" is intentional
    const item = {
      id: ["JP00000001"],
      title: { ja: "", en: "" },
      agency: { name: { ja: "", en: "" } },
    };
    expect(toItem(fromItem(item))).toEqual(item);
  });
});

describe("publicationCodec – fromItem/toItem round-trip", () => {
  const { fromItem, toItem } = arrayCodecs.publications;

  test("full publication with title and doi", () => {
    const item = {
      title: { ja: "論文タイトル", en: "Paper Title" },
      doi: "10.1234/example.doi",
    };
    expect(toItem(fromItem(item))).toEqual(item);
  });

  test("null title fields normalise to empty strings", () => {
    // publicationCodec uses bare strings; null title → "" in card → "" in toItem
    const item = {
      title: { ja: "", en: "" },
      doi: null,
    };
    expect(toItem(fromItem(item))).toEqual(item);
  });

  test("partial title (only en) — null ja normalises to empty string", () => {
    const item = {
      title: { ja: "", en: "English Only" },
      doi: null,
    };
    expect(toItem(fromItem(item))).toEqual(item);
  });
});

describe("linkCodec – fromItem/toItem round-trip", () => {
  const { fromItem, toItem } = arrayCodecs.links;

  test("link with text and url", () => {
    const item = { text: "Homepage", url: "https://example.com" };
    expect(toItem(fromItem(item))).toEqual(item);
  });

  test("empty text and url", () => {
    const item = { text: "", url: "" };
    expect(toItem(fromItem(item))).toEqual(item);
  });
});
