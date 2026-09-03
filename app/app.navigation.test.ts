/**
 * The rules about where a link takes the reader.
 *
 * `app.contrast.test.ts` and `app.spacing.test.ts` are the same idea: a
 * requirement nobody can check by looking at one screen, held by something that
 * reads the source. Neither of these can be checked by rendering either — a link
 * that forgot `preventScrollReset` draws exactly like one that did not, and the
 * word a reader who cannot see the mark needs is not in the picture at all.
 *
 * **Only the refinement panel is held to the first rule absolutely.** Everything
 * that panel offers narrows a listing standing beside it, so there is no link in
 * it that should send the reader anywhere; the wrapper is what makes that true
 * of a link added later. The controls in `components/search.tsx` are a mixture
 * on purpose — the front page's box goes to another screen, and arriving there
 * part-way down would be arriving in the middle — so they are read one at a time
 * rather than by a rule (`docs/public-pages.md` の「一覧と検索」).
 *
 * **The second rule is about leaving the site.** A link that opens a tab says so
 * twice — a mark for the eye and a word for anyone not using one — because a tab
 * that opens unannounced leaves the reader pressing a back button that does
 * nothing. `external` on the button-shaped parts does not mean this: it means an
 * address client-side navigation cannot answer, which the CSV download and the
 * redirect to the identity provider also are. Those two stay in the same tab and
 * are named here, so that the next `external` written cannot quietly become a
 * third exception.
 */

import { readFile } from "node:fs/promises"
import path from "node:path"

import { describe, expect, it } from "vitest"

const PANEL = path.join(import.meta.dirname, "components/facets.tsx")

/** The one place the wrapper is allowed to reach for the thing it wraps. */
const WRAPPER = /function RefineLink\([\s\S]*?\n}/

describe("the refinement panel", () => {
  it("reaches for Link in one place only, so a link added to it cannot forget the reader", async () => {
    const source = await readFile(PANEL, "utf8")
    expect(source).toMatch(WRAPPER)

    const elsewhere = source.replace(WRAPPER, "")
    expect(elsewhere.match(/<Link[\s/>]/g)).toBeNull()
    // The wrapper is worth having only while something goes through it.
    expect(elsewhere.match(/<RefineLink[\s/>]/g)?.length ?? 0).toBeGreaterThan(0)
  })

  it("submits every one of its forms without moving the reader", async () => {
    const source = await readFile(PANEL, "utf8")
    const forms = source.match(/<Form\b[^>]*>/g) ?? []

    expect(forms.length).toBeGreaterThan(0)
    expect(forms.filter((form) => !form.includes("preventScrollReset"))).toEqual([])
  })

  it("has no plain form left in it, which would leave the page instead of narrowing it", async () => {
    const source = await readFile(PANEL, "utf8")
    expect(source.match(/<form[\s/>]/g)).toBeNull()
  })
})

/** Where a reader could be sent out of the site without being told. */
const OUTWARD = [
  "components/page.tsx",
  "components/research.tsx",
  "components/layout.tsx",
  "components/site.tsx",
  "routes/cart.tsx",
].map((file) => path.join(import.meta.dirname, file))

/**
 * `external` on a button-shaped part that stays in this tab. Both are addresses
 * client-side navigation cannot answer rather than other sites, so neither owes
 * the reader a warning — and listing them is what keeps a third from appearing
 * without anyone deciding it should.
 */
const SAME_TAB = [
  { file: "components/search.tsx", what: "the CSV of a search" },
  { file: "components/layout.tsx", what: "the redirect that signs somebody in" },
]

describe("a link that leaves the site", () => {
  it("opens its tab with the opener cut, everywhere one is opened", async () => {
    for (const file of OUTWARD) {
      const source = await readFile(file, "utf8")
      const opened = source.match(/target="_blank"[\s\S]{0,120}?>/g) ?? []
      const bare = opened.filter((tag) => !tag.includes("noopener"))

      expect({ file: path.basename(file), bare }).toEqual({ file: path.basename(file), bare: [] })
    }
  })

  it("goes through the one part that carries both, in the prose and the values", async () => {
    // `page.tsx` opens a tab in exactly one place — inside `ExternalLink` — and
    // nothing else in the prose or the values opens one at all. A second
    // occurrence is a link somebody wrote without the mark or the word.
    const page = await readFile(path.join(import.meta.dirname, "components/page.tsx"), "utf8")
    expect(page.match(/target="_blank"/g)).toHaveLength(1)
    expect(page.indexOf("target=\"_blank\"")).toBeGreaterThan(page.indexOf("export function ExternalLink"))

    const research = await readFile(path.join(import.meta.dirname, "components/research.tsx"), "utf8")
    expect(research.match(/target="_blank"/g)).toBeNull()
    expect(research).toContain("<ExternalLink")
  })

  it("owes the word even where the mark has nowhere to sit", async () => {
    // The footer's link is a logo: the mark would land on top of the image, so
    // only the word is left to say the tab is new.
    const source = await readFile(path.join(import.meta.dirname, "components/layout.tsx"), "utf8")
    const logo = source.slice(source.indexOf("dbcls.rois.ac.jp"))
    expect(logo.slice(0, logo.indexOf("</a>"))).toContain("newTab")
  })

  it("keeps the word in both languages, so neither falls back to the other", async () => {
    const messages = await readFile(path.join(import.meta.dirname, "i18n/messages.ts"), "utf8")
    expect(messages.match(/^\s*newTab: /gm)?.length).toBe(2)
  })

  it("hands the word down wherever a button shape opens a tab", async () => {
    const base = await readFile(path.join(import.meta.dirname, "components/base.tsx"), "utf8")
    // Both button shapes that can open a tab say it; `base.tsx` holds no words
    // of its own, so what they say is handed to them.
    expect(base.match(/newTabLabel/g)?.length).toBeGreaterThanOrEqual(6)

    for (const { file } of SAME_TAB) {
      const source = await readFile(path.join(import.meta.dirname, file), "utf8")
      // The named exceptions are `external` without a new tab, so no word is owed.
      expect(source).toMatch(/\bexternal\b/)
      expect(source).not.toMatch(/external[\s\S]{0,80}newTab\b/)
    }
  })
})
