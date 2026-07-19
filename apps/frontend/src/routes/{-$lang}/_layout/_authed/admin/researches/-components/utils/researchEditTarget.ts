import type { ResearchStatus } from "@humandbs/backend/types";

/**
 * Pure logic mapping (selected version, research state) → how the research editor
 * should behave. Kept free of React/network so it can be unit-tested in isolation.
 *
 * A research has at most one draft version and one published latest version, which
 * can coexist. Research metadata belongs to the research rather than an individual
 * version, so it may be edited from any selected version while the research is in a
 * writable status. Release notes are version-specific and have a narrower target:
 * the current draft or the latest published version.
 */

export interface ResearchEditTargetInput {
  selectedVersion: string | null | undefined;
  draftVersion: string | null | undefined;
  latestVersion: string | null | undefined;
  status: ResearchStatus | null | undefined;
}

/** Whether the editor is on the draft version (the in-flight draft). */
export function isViewingDraftVersion({
  selectedVersion,
  draftVersion,
}: Pick<ResearchEditTargetInput, "selectedVersion" | "draftVersion">): boolean {
  return draftVersion != null && selectedVersion === draftVersion;
}

/**
 * Whether the editor is on the latest published version of a published research —
 * the in-place patch case.
 */
export function isViewingPublishedLatest({
  selectedVersion,
  latestVersion,
  status,
}: Pick<ResearchEditTargetInput, "selectedVersion" | "latestVersion" | "status">): boolean {
  return status === "published" && latestVersion != null && selectedVersion === latestVersion;
}

/**
 * Research metadata is editable from any selected version while the backend permits
 * updates (draft or published). Review remains read-only because the update endpoint
 * rejects it.
 */
export function isResearchEditable(input: ResearchEditTargetInput): boolean {
  return (
    input.selectedVersion != null && (input.status === "draft" || input.status === "published")
  );
}

/**
 * Release notes belong to a specific version. They can be changed only on the
 * current draft or on the latest published version.
 */
export function isReleaseNoteEditable(input: ResearchEditTargetInput): boolean {
  return isViewingDraftVersion(input) || isViewingPublishedLatest(input);
}
