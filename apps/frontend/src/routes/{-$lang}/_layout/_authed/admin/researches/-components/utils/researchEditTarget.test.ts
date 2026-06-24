import { describe, expect, test } from "bun:test";

import {
  isResearchEditable,
  isViewingDraftVersion,
  isViewingPublishedLatest,
  researchSaveEndpoint,
} from "./researchEditTarget";

describe("researchEditTarget", () => {
  test("draft version → editable, update endpoint", () => {
    const input = {
      selectedVersion: "v1-draft",
      draftVersion: "v1-draft",
      latestVersion: "v1",
      status: "draft" as const,
    };
    expect(isViewingDraftVersion(input)).toBe(true);
    expect(isResearchEditable(input)).toBe(true);
    expect(researchSaveEndpoint(input)).toBe("update");
  });

  test("published latest of a published research → editable, patch endpoint", () => {
    const input = {
      selectedVersion: "v2",
      draftVersion: null,
      latestVersion: "v2",
      status: "published" as const,
    };
    expect(isViewingPublishedLatest(input)).toBe(true);
    expect(isResearchEditable(input)).toBe(true);
    expect(researchSaveEndpoint(input)).toBe("patch");
  });

  test("draft and published-latest can coexist — draft view routes to update", () => {
    const input = {
      selectedVersion: "v3-draft",
      draftVersion: "v3-draft",
      latestVersion: "v2",
      status: "published" as const,
    };
    expect(researchSaveEndpoint(input)).toBe("update");
    expect(isResearchEditable(input)).toBe(true);
  });

  test("same research, published-latest view routes to patch", () => {
    const input = {
      selectedVersion: "v2",
      draftVersion: "v3-draft",
      latestVersion: "v2",
      status: "published" as const,
    };
    expect(researchSaveEndpoint(input)).toBe("patch");
  });

  test("an old (non-latest) published version is read-only", () => {
    const input = {
      selectedVersion: "v1",
      draftVersion: null,
      latestVersion: "v2",
      status: "published" as const,
    };
    expect(isResearchEditable(input)).toBe(false);
    expect(researchSaveEndpoint(input)).toBe(null);
  });

  test("latest version of a NON-published research is not patchable", () => {
    const input = {
      selectedVersion: "v1",
      draftVersion: null,
      latestVersion: "v1",
      status: "review" as const,
    };
    expect(isViewingPublishedLatest(input)).toBe(false);
    expect(isResearchEditable(input)).toBe(false);
    expect(researchSaveEndpoint(input)).toBe(null);
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
