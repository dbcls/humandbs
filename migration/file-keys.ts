/**
 * The experiments' data volume and file format keys, taken out of every
 * description once it is settled.
 *
 * A dataset's size and formats are read from its files — an archive's from what
 * the archive distributes (`app/upstream/`), an NHA dataset's from its file
 * selection — and have no key. The articles wrote them by hand per experiment,
 * in whatever unit and breakdown each research chose, and a figure worked out
 * by hand goes stale the moment data is added.
 *
 * The keys are seeded and filled as the dump has them, so that the hand edits
 * written against their text still land, and go with the archive keys
 * (`archive-keys.ts`). The terms of `file-type` are then made from the list of
 * formats (`app/files/format-terms.server.ts`), which removes the ones the
 * articles' values were read into.
 */

export const DROPPED_FILE_KEYS: readonly string[] = [
  "total-data-volume",
  "file-type",
]
