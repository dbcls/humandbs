import type { useTranslations } from "use-intl";

/** The translator returned by useTranslations("common"). */
type CommonTranslator = ReturnType<typeof useTranslations<"common">>;

/**
 * Maps a 1-based document version number to its public revision label.
 * Version 1 is the original; version N (N>=2) is "Revision N-1".
 */
export function revisionLabel(versionNumber: number, t: CommonTranslator): string {
  return versionNumber <= 1
    ? t("original") // "Original"
    : t("revision", { n: versionNumber - 1 }); // "Revision N"
}

/**
 * Builds the splat path for a document version.
 * Maps to "<docId>/revision/<revisionNumber>" where revisionNumber = versionNumber - 1,
 * so the original (version 1) is "<docId>/revision/0".
 */
export function revisionSplatPath(basePath: string, versionNumber: number): string {
  return `${basePath}/revision/${versionNumber - 1}`;
}
