import fc from "fast-check"

import { KEY_IDS } from "~/content/arbitraries/content"
import type { DatasetContent } from "~/content/types"
import type { CatalogView } from "~/public/view.server"

/**
 * A catalog the API projection can be run against.
 *
 * The vocabulary side is built from the ids a generated content actually holds,
 * so that resolving a term is exercised rather than always missing. Some are
 * left out on purpose: a key or a term the catalog does not know is dropped, and
 * a law that never saw one would not be saying anything about that.
 */

/** Every vocabulary term id a dataset content refers to. */
export function termIdsIn(content: DatasetContent): string[] {
  const slots = [...content.values, ...content.experiments.flatMap((one) => one.values)]
  return [...new Set(slots.flatMap((slot) =>
    slot.value.kind === "vocabulary" && slot.value.termIds.state === "value"
      ? slot.value.termIds.value
      : []))]
}

export function catalogViewArb(termIds: readonly string[]): fc.Arbitrary<CatalogView> {
  return fc.record({
    keys: fc.subarray([...KEY_IDS], { minLength: 1 }),
    shown: fc.array(fc.boolean(), { minLength: KEY_IDS.length, maxLength: KEY_IDS.length }),
    // Usually the catalog knows every term the content refers to, so that
    // resolving one is the common case; sometimes it knows only part of them,
    // which is the case where a value has to disappear.
    known: fc.oneof(
      { weight: 3, arbitrary: fc.constant<string[]>([...termIds]) },
      { weight: 1, arbitrary: fc.subarray<string>([...termIds]) },
    ),
  }).map(({ keys, shown, known }) => {
    const entries = keys.map((id, at) => [id, {
      id,
      code: `code-${id}`,
      labelJa: at % 2 === 0 ? `ラベル ${id}` : "",
      labelEn: `Label ${id}`,
      position: keys.length - at,
      showOnPublicPage: shown[at] ?? true,
    }] as const)

    return {
      keyById: new Map(entries),
      keyByCode: new Map(entries.map(([, key]) => [key.code, key])),
      termById: new Map(known.map((id, at) => [id, {
        code: `term-${at}`,
        labelJa: at % 2 === 0 ? `語 ${at}` : null,
        labelEn: `Term ${at}`,
      }])),
    }
  })
}
