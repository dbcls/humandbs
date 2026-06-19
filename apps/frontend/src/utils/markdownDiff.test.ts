import { describe, expect, test } from "bun:test";

import type { DiffRow } from "./markdownDiff";
import { renderMarkdownDiffRows } from "./markdownDiff";

// Find the first row whose new (right) side contains `needle`.
function rowWithRight(rows: DiffRow[], needle: string): DiffRow | undefined {
  return rows.find((r) => r.right?.includes(needle));
}
// Find the first row whose old (left) side contains `needle`.
function rowWithLeft(rows: DiffRow[], needle: string): DiffRow | undefined {
  return rows.find((r) => r.left?.includes(needle));
}

describe("renderMarkdownDiffRows", () => {
  test("identical content produces only unchanged rows with matching sides", async () => {
    const md = "# Title\n\nA paragraph.";
    const rows = await renderMarkdownDiffRows(md, md);

    expect(rows.every((r) => r.status === "unchanged")).toBe(true);
    for (const r of rows) {
      expect(r.left).toBe(r.right);
    }
  });

  test("inline word edit: removal on left, addition on right", async () => {
    const rows = await renderMarkdownDiffRows(
      "Researchers may access controlled-access data.",
      "Researchers may access controlled-access datasets here.",
    );
    const row = rows.find((r) => r.status === "changed");
    expect(row).toBeDefined();
    expect(row!.left).toContain("<del>data</del>");
    expect(row!.right).toContain("<ins>datasets here</ins>");
    // unchanged words are not wrapped
    expect(row!.left).toContain("controlled-access");
  });

  test("CJK edits diff at character level and coalesce into a single run", async () => {
    const rows = await renderMarkdownDiffRows("## 申請", "## 申請方法");
    const row = rowWithRight(rows, "<ins>");
    expect(row).toBeDefined();
    // single coalesced <ins>方法</ins>, not <ins>方</ins><ins>法</ins>
    expect(row!.right).toContain("<ins>方法</ins>");
    expect(row!.right).not.toContain("<ins>方</ins>");
  });

  test("heading rename aligns to one changed row (not delete + add)", async () => {
    const rows = await renderMarkdownDiffRows("## Applying", "## How to apply");
    const headingRows = rows.filter((r) => r.left?.includes("<h2") || r.right?.includes("<h2"));
    expect(headingRows).toHaveLength(1);
    expect(headingRows[0]!.status).toBe("changed");
    expect(headingRows[0]!.left).toContain("Applying");
    expect(headingRows[0]!.right).toContain("How to apply");
  });

  test("added block: only the right side is present", async () => {
    const rows = await renderMarkdownDiffRows(
      "# Doc\n\nIntro.",
      "# Doc\n\nIntro.\n\n## New Section\n\nBody.",
    );
    const added = rows.filter((r) => r.status === "added");
    expect(added.length).toBeGreaterThan(0);
    for (const r of added) {
      expect(r.left).toBeUndefined();
      expect(r.right).toContain('data-diff-node="ins"');
    }
  });

  test("removed block: only the left side is present", async () => {
    const rows = await renderMarkdownDiffRows(
      "# Doc\n\nIntro.\n\n## Old Section\n\nBody.",
      "# Doc\n\nIntro.",
    );
    const removed = rows.filter((r) => r.status === "removed");
    expect(removed.length).toBeGreaterThan(0);
    for (const r of removed) {
      expect(r.right).toBeUndefined();
      expect(r.left).toContain('data-diff-node="del"');
    }
  });

  describe("callouts", () => {
    test("edit inside a callout keeps the <callout> element on both sides", async () => {
      const rows = await renderMarkdownDiffRows(
        "::: callout\nProvided data should be broadly available.\n:::",
        "::: callout\nProvided data should be broadly and freely available.\n:::",
      );
      const row = rows.find((r) => r.right?.includes("<callout"));
      expect(row).toBeDefined();
      expect(row!.status).toBe("changed");
      expect(row!.left).toContain("<callout");
      expect(row!.right).toContain("<callout");
      expect(row!.right).toContain("<ins>");
    });

    test("callout type change is surfaced as an attribute marker on the right", async () => {
      const rows = await renderMarkdownDiffRows(
        "::: callout\nReview the guidelines.\n:::",
        '::: callout type="warning"\nReview the guidelines.\n:::',
      );
      const row = rows.find((r) => r.right?.includes('data-attr-changed="true"'));
      expect(row).toBeDefined();
      expect(row!.right).toContain('type="warning"');
      expect(row!.right).toContain("diff-attr-change");
      expect(row!.right).toContain("warning");
    });

    test("a newly added callout appears only on the right", async () => {
      const rows = await renderMarkdownDiffRows(
        "# Doc\n\nIntro.",
        "# Doc\n\nIntro.\n\n::: callout\nNote.\n:::",
      );
      const calloutAdd = rows.find((r) => r.status === "added" && r.right?.includes("<callout"));
      expect(calloutAdd).toBeDefined();
      expect(calloutAdd!.left).toBeUndefined();
    });
  });

  describe("lists (structure must survive so markers render)", () => {
    test("edit in a list item keeps every <li> and inline-diffs only the change", async () => {
      const rows = await renderMarkdownDiffRows(
        "1. first\n2. second\n3. third",
        "1. first\n2. second changed\n3. third",
      );
      const row = rows.find((r) => r.right?.includes("<ol"));
      expect(row).toBeDefined();
      // all three items present on both sides (not flattened to bare text)
      expect((row!.left!.match(/<li/g) ?? []).length).toBe(3);
      expect((row!.right!.match(/<li/g) ?? []).length).toBe(3);
      expect(row!.right).toContain("<ins> changed</ins>");
    });

    test("added list item is marked, existing items preserved", async () => {
      const rows = await renderMarkdownDiffRows(
        "1. first\n2. second",
        "1. first\n2. second\n3. third",
      );
      const row = rows.find((r) => r.right?.includes("<ol"));
      expect(row).toBeDefined();
      expect((row!.right!.match(/<li/g) ?? []).length).toBe(3);
      expect(row!.right).toContain('data-diff-node="ins"');
      // the new item's text is present
      expect(row!.right).toContain("third");
    });
  });

  test("rows preserve document order", async () => {
    const rows = await renderMarkdownDiffRows(
      "# A\n\nfirst\n\n## B\n\nsecond",
      "# A\n\nfirst edited\n\n## B\n\nsecond",
    );
    // first non-heading text rows should reference 'first' before 'second'
    const firstIdx = rows.findIndex((r) => (r.right ?? "").includes("first"));
    const secondIdx = rows.findIndex((r) => (r.right ?? "").includes("second"));
    expect(firstIdx).toBeGreaterThanOrEqual(0);
    expect(secondIdx).toBeGreaterThan(firstIdx);
  });
});
