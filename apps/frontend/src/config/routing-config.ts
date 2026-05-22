/**
 * List of system-reserved path segments, that can't be used in document or content Id
 */
export const RESERVED_SEGMENTS = [
  "data-use",
  "data-submission",
  "navigation",
  "revision",
  "news",
  "dataset",
  "research",
  "dataset",
  "versions",
  "home",
];

export const PROTECTED_DOC_IDS = ["home", "data-use", "data-submission"] as const;
