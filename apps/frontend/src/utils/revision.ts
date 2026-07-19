/**
 * Builds the splat path for a document version.
 * Maps to "<docId>/version/<versionNumber>", so the original (version 1)
 * is "<docId>/version/1".
 */
export function revisionSplatPath(basePath: string, versionNumber: number): string {
  return `${basePath}/version/${versionNumber}`;
}
