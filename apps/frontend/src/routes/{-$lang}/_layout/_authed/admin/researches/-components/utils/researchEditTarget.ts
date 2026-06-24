import type { ResearchStatus } from "@humandbs/backend/types";

/**
 * Pure logic mapping (selected version, research state) → how the research editor
 * should behave. Kept free of React/network so it can be unit-tested in isolation.
 *
 * A research has at most one draft version and one published latest version, which
 * can coexist. Which one is being edited is decided by the selected version:
 *  - viewing the draft version → editable via PUT /research/{humId}/update
 *  - viewing the published latest of a published research → editable via PUT /patch
 * Any other view (e.g. an old published version, or a non-published research's
 * latest) is read-only.
 */

export type ResearchSaveEndpoint = "update" | "patch";

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
 * The editor surface is editable when viewing the draft, OR the published latest
 * of a published research. Everything else is read-only.
 */
export function isResearchEditable(input: ResearchEditTargetInput): boolean {
  return isViewingDraftVersion(input) || isViewingPublishedLatest(input);
}

/**
 * Which backend endpoint a Save should target, or null when the current view is
 * not editable. Draft → update; published latest → patch.
 */
export function researchSaveEndpoint(input: ResearchEditTargetInput): ResearchSaveEndpoint | null {
  if (isViewingDraftVersion(input)) return "update";
  if (isViewingPublishedLatest(input)) return "patch";
  return null;
}
