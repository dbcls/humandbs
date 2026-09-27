/**
 * The accession keys of the archives whose entries the portal lists as datasets
 * of their own, taken out of every description once it is settled.
 *
 * A dataset of JGA, DRA, GEA or MetaboBank is the archive's entry, and a
 * portal-issued one (NHA) is the portal's own: the dataset's page shows the ID
 * and links the entry in DDBJ Search. The articles wrote the ID in the key
 * again, and beside it whatever the table had no row for — a count, the
 * sample each number stood for, a dictionary file, another dataset of the same
 * samples. **What of that is worth keeping is moved by hand before this runs**:
 * to another key (`value-edits.ts`), to a file's label (`hand/file-labels.json`).
 * What is left is the ID itself, the IDs of datasets the research lists
 * beside it, and misspellings of them.
 *
 * The keys are seeded and filled as the dump has them, so that the hand edits
 * written against their text still land; their values go here, before a
 * draft's requests become comments, and the keys once every description is
 * written. The keys of archives the portal holds no datasets of (GEO, jPOST,
 * INSDC, EGA) and the processed data's IDs stay.
 */

export const DROPPED_ARCHIVE_KEYS: readonly string[] = [
  "japanese-genotype-phenotype-archive-dataset-accession",
  "nbdc-dataset-accession",
  "sequence-read-archive-accession",
  "genomic-expression-archive-accession",
  "metabobank-accession",
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
