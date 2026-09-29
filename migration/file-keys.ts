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
 * The keys are seeded and filled as the dump has them, and their values are
 * taken out once every description is written (`withoutKeys`). The terms of
 * `file-type` are then made from the list of formats
 * (`app/files/format-terms.server.ts`), which removes the ones the articles'
 * values were read into.
 */

export const DROPPED_FILE_KEYS: readonly string[] = [
  "total-data-volume",
  "file-type",
]

interface Described {
  experiments?: { values: { keyId: string }[] }[]
}

/** A description without the values of the given keys, and how many it held. */
export function withoutKeys<T extends Described>(content: T, keyIds: ReadonlySet<string>): { content: T, dropped: number } {
  if (content.experiments === undefined) return { content, dropped: 0 }
  let dropped = 0
  const experiments = content.experiments.map((experiment) => {
    const values = experiment.values.filter((one) => !keyIds.has(one.keyId))
    dropped += experiment.values.length - values.length
    return values.length === experiment.values.length ? experiment : { ...experiment, values }
  })
  return { content: dropped === 0 ? content : { ...content, experiments }, dropped }
}
