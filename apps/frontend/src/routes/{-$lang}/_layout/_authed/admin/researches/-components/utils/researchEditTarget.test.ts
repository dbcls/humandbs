import { describe, expect, test } from "bun:test";

import {
  isResearchEditable,
  isViewingDraftVersion,
  isViewingPublishedLatest,
} from "./researchEditTarget";

describe("researchEditTarget", () => {
  test("draft version → editable", () => {
    const input = {
      selectedVersion: "v1-draft",
      draftVersion: "v1-draft",
      latestVersion: "v1",
      status: "draft" as const,
    };
    expect(isViewingDraftVersion(input)).toBe(true);
    expect(isResearchEditable(input)).toBe(true);
  });

  test("published latest of a published research → editable", () => {
    const input = {
      selectedVersion: "v2",
      draftVersion: null,
      latestVersion: "v2",
      status: "published" as const,
    };
    expect(isViewingPublishedLatest(input)).toBe(true);
    expect(isResearchEditable(input)).toBe(true);
  });

  test("draft and published-latest can coexist — draft view is editable", () => {
    const input = {
      selectedVersion: "v3-draft",
      draftVersion: "v3-draft",
      latestVersion: "v2",
      status: "published" as const,
    };
    expect(isViewingDraftVersion(input)).toBe(true);
    expect(isResearchEditable(input)).toBe(true);
  });

  test("same research, published-latest view is editable", () => {
    const input = {
      selectedVersion: "v2",
      draftVersion: "v3-draft",
      latestVersion: "v2",
      status: "published" as const,
    };
    expect(isViewingPublishedLatest(input)).toBe(true);
    expect(isResearchEditable(input)).toBe(true);
  });

  test("an old (non-latest) published version is read-only", () => {
    const input = {
      selectedVersion: "v1",
      draftVersion: null,
      latestVersion: "v2",
      status: "published" as const,
    };
    expect(isResearchEditable(input)).toBe(false);
  });

  test("latest version of a NON-published research is not editable", () => {
    const input = {
      selectedVersion: "v1",
      draftVersion: null,
      latestVersion: "v1",
      status: "review" as const,
    };
    expect(isViewingPublishedLatest(input)).toBe(false);
    expect(isResearchEditable(input)).toBe(false);
  });

  test("null/undefined versions are not editable", () => {
    expect(
      isResearchEditable({
        selectedVersion: undefined,
        draftVersion: null,
        latestVersion: null,
        status: undefined,
      }),
    ).toBe(false);
  });
});
