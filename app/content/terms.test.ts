import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { datasetContentArb } from "./arbitraries/content"
import { datasetWithTermMerged, versionWithTermMerged } from "./terms"
import type { DatasetContent, ValueSlot, VersionContent } from "./types"

function vocabulary(termIds: string[], keyId = "key-a"): ValueSlot {
  return { keyId, value: { kind: "vocabulary", termIds: { state: "value", value: termIds } } }
}

function disease(termIds: string[], nameJa: string | null = null): ValueSlot {
  return {
    keyId: "key-b",
    value: {
      kind: "disease",
      diseases: { state: "value", value: [{ termIds, nameJa, nameEn: null }] },
    },
  }
}

function dataset(values: ValueSlot[], experiments: ValueSlot[][] = []): DatasetContent {
  return {
    releaseDate: null,
    fileSelection: [],
    values,
    experiments: experiments.map((held, at) => ({
      id: `experiment-${at}`,
      label: { state: "value", value: "" },
      values: held,
    })),
  }
}

/** Every term identity a description points at, in the two shapes that hold them. */
function termIdsIn(content: DatasetContent): string[] {
  const ids = new Set<string>()
  const slots = [...content.values, ...content.experiments.flatMap((one) => one.values)]
  for (const slot of slots) {
    const value = slot.value
    if (value.kind === "vocabulary" && value.termIds.state === "value") {
      for (const id of value.termIds.value) ids.add(id)
    }
    if (value.kind === "disease" && value.diseases.state === "value") {
      for (const one of value.diseases.value) for (const id of one.termIds) ids.add(id)
    }
  }
  return [...ids]
}

/** The element that has to be there, without asserting it away. */
function nth<T>(list: readonly T[], index: number): T {
  const held = list[index]
  if (held === undefined) throw new Error(`nothing at ${index}`)
  return held
}

function chosenOf(slot: ValueSlot): string[] {
  const value = slot.value
  if (value.kind === "vocabulary" && value.termIds.state === "value") return value.termIds.value
  if (value.kind === "disease" && value.diseases.state === "value") {
    return value.diseases.value.flatMap((one) => one.termIds)
  }
  return []
}

describe("語彙値の併合", () => {
  it("指している値が、統合先を指すようになる", () => {
    const merged = datasetWithTermMerged(dataset([vocabulary(["a"])]), "a", "b")
    expect(chosenOf(nth(merged.values, 0))).toEqual(["b"])
  })

  it("両方を指していた値は、統合先を 1 つだけ持つ", () => {
    // ここを畳まないと、facet が同じ値を 2 度数える。
    const merged = datasetWithTermMerged(dataset([vocabulary(["a", "b"])]), "a", "b")
    expect(chosenOf(nth(merged.values, 0))).toEqual(["b"])
  })

  it("統合先を先に持っていても、1 つだけになる", () => {
    const merged = datasetWithTermMerged(dataset([vocabulary(["b", "a"])]), "a", "b")
    expect(chosenOf(nth(merged.values, 0))).toEqual(["b"])
  })

  it("他の値の並びは動かない", () => {
    const merged = datasetWithTermMerged(dataset([vocabulary(["x", "a", "y"])]), "a", "b")
    expect(chosenOf(nth(merged.values, 0))).toEqual(["x", "b", "y"])
  })

  it("疾患の中の id も変わり、疾患が持つ名前は動かない", () => {
    const merged = datasetWithTermMerged(dataset([disease(["a"], "肝がん")]), "a", "b")
    const value = nth(merged.values, 0).value
    if (value.kind !== "disease" || value.diseases.state !== "value") throw new Error("shape")
    expect(nth(value.diseases.value, 0).termIds).toEqual(["b"])
    expect(nth(value.diseases.value, 0).nameJa).toBe("肝がん")
  })

  it("experiment が持つ値にも効く", () => {
    const merged = datasetWithTermMerged(dataset([], [[vocabulary(["a"])]]), "a", "b")
    expect(chosenOf(nth(nth(merged.experiments, 0).values, 0))).toEqual(["b"])
  })

  it("指していない値は、同じものがそのまま返る", () => {
    // 参照が変わらないので、呼ぶ側は書き戻す行を選べる。
    const before = dataset([vocabulary(["x"])])
    const merged = datasetWithTermMerged(before, "a", "b")
    expect(merged.values[0]).toBe(before.values[0])
  })

  it("値を持たない状態の slot は触らない", () => {
    const unknown: ValueSlot = { keyId: "key-a", value: { kind: "vocabulary", termIds: { state: "unknown" } } }
    const before = dataset([unknown])
    expect(datasetWithTermMerged(before, "a", "b").values[0]).toBe(before.values[0])
  })

  it("版は、並べている dataset すべてに効く", () => {
    const content = {
      datasets: [
        { datasetId: "one", ...dataset([vocabulary(["a"])]) },
        { datasetId: "two", ...dataset([vocabulary(["a", "c"])]) },
      ],
    } as unknown as VersionContent

    const merged = versionWithTermMerged(content, "a", "b")
    expect(chosenOf(nth(nth(merged.datasets, 0).values, 0))).toEqual(["b"])
    expect(chosenOf(nth(nth(merged.datasets, 1).values, 0))).toEqual(["b", "c"])
  })
})

/** A description, and two of the identities it actually points at. */
const mergeArb = datasetContentArb.chain((content) => {
  const ids = termIdsIn(content)
  const pool = ids.length === 0 ? ["nothing-points-at-this"] : ids
  return fc.record({
    content: fc.constant(content),
    from: fc.constantFrom(...pool),
    into: fc.constantFrom(...pool, "a-fresh-term"),
  })
})

describe("語彙値の併合 (性質)", () => {
  it("併合したあと、元の語を指している値は 1 つも残らない", () => {
    fc.assert(fc.property(mergeArb, ({ content, from, into }) => {
      if (from === into) return
      expect(termIdsIn(datasetWithTermMerged(content, from, into))).not.toContain(from)
    }))
  })

  it("どの値も、持つ id の数が増えない", () => {
    fc.assert(fc.property(mergeArb, ({ content, from, into }) => {
      const before = [...content.values, ...content.experiments.flatMap((one) => one.values)]
      const merged = datasetWithTermMerged(content, from, into)
      const after = [...merged.values, ...merged.experiments.flatMap((one) => one.values)]
      for (const [at, slot] of after.entries()) {
        expect(chosenOf(slot).length).toBeLessThanOrEqual(chosenOf(nth(before, at)).length)
      }
    }))
  })

  it("どの値も、同じ id を 2 度持たない", () => {
    fc.assert(fc.property(mergeArb, ({ content, from, into }) => {
      const merged = datasetWithTermMerged(content, from, into)
      const slots = [...merged.values, ...merged.experiments.flatMap((one) => one.values)]
      for (const slot of slots) {
        const value = slot.value
        // 疾患は 1 つの slot に複数の疾患を持てて、別の疾患が同じ語を指すのは
        // 重複ではない。畳むのは 1 つの疾患の中だけ。
        if (value.kind === "disease" && value.diseases.state === "value") {
          for (const one of value.diseases.value) {
            expect(new Set(one.termIds).size).toBe(one.termIds.length)
          }
          continue
        }
        const held = chosenOf(slot)
        expect(new Set(held).size).toBe(held.length)
      }
    }))
  })

  it("指していない語を併合しても、content は 1 か所も変わらない", () => {
    fc.assert(fc.property(datasetContentArb, (content) => {
      const merged = datasetWithTermMerged(content, "nothing-points-at-this", "somewhere")
      // 値の同一を見る。`fc.record` は prototype を持たない object を作るので、
      // 作り直したぶんだけ `toStrictEqual` は形の違いとして落ちる。
      expect(merged).toEqual(content)
    }))
  })

  it("自分自身への併合は、何も変えない", () => {
    fc.assert(fc.property(mergeArb, ({ content, from }) => {
      expect(datasetWithTermMerged(content, from, from)).toEqual(content)
    }))
  })
})
