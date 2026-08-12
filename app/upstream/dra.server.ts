/**
 * Walking a DRA submission down to its libraries.
 *
 * One request names the submission's experiments and the rest read them, a few
 * at a time. There is no bulk form and no aggregate on the submission itself —
 * its own entry answers with the library fields empty — so the walk is the only
 * way to learn what a submission holds.
 *
 * **An experiment that does not answer is named rather than dropped silently.**
 * A draft seeded from a submission whose libraries were half unreachable would
 * otherwise look like a submission with half as many libraries
 * (docs/editing.md の「上流からの下書き」).
 */

import { mapConcurrently } from "~/concurrency"

import { fetchDbXrefs, fetchSraEntry } from "./ddbj-search.server"
import { experimentOf, groupByStrategy, type DraExperimentGroup } from "./dra"

/** How many experiment requests are in flight at once. */
const CONCURRENCY = 5

const SUBMISSION = "sra-submission"
const EXPERIMENT = "sra-experiment"

export interface DraSubmission {
  accession: string
  title: string
  groups: DraExperimentGroup[]
  /** The experiments upstream did not answer for, named. */
  unreachable: string[]
}

/**
 * What a submission holds, or null when DDBJ Search does not know it.
 *
 * A submission that is not there is an answer — the accession was mistyped, or
 * the data is not out yet — so the screen says so instead of failing. Anything
 * else upstream does while answering for the submission itself throws, because
 * "it did not answer" and "it holds nothing" are not the same thing to somebody
 * about to create a dataset from it.
 */
export async function fetchDraSubmission(accession: string): Promise<DraSubmission | null> {
  const entry = await fetchSraEntry(SUBMISSION, accession)
  if (entry === null) return null

  const xrefs = await fetchDbXrefs(SUBMISSION, accession)
  const experimentIds = [...new Set(
    xrefs.filter((xref) => xref.type === EXPERIMENT).map((xref) => xref.identifier),
  )].sort()

  const unreachable: string[] = []
  const experiments = (await mapConcurrently(experimentIds, CONCURRENCY, async (id) => {
    try {
      const found = await fetchSraEntry(EXPERIMENT, id)
      if (found === null) {
        unreachable.push(id)
        return null
      }
      return experimentOf(found)
    } catch {
      unreachable.push(id)
      return null
    }
  })).filter((experiment) => experiment !== null)

  const title = entry.title?.trim() ?? ""
  return {
    accession,
    // A submission's title is often the accession itself, which says nothing a
    // reader does not already have. Its description is the next best thing.
    title: title === "" || title === accession ? entry.description?.trim() ?? "" : title,
    groups: groupByStrategy(experiments),
    unreachable: unreachable.sort(),
  }
}
