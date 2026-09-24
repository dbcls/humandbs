/**
 * Corrections to the site content, written by hand as exact replacements.
 *
 * The guideline versions are renumbered so that the number a page shows is the
 * number in its address, the operator is named as it is now on the pages that
 * say who runs the site, and sentences that are no longer true are rewritten.
 * None of this follows a rule that could be applied blind — a past version of
 * a guideline keeps the operator it was issued under — so each change names the
 * document, the version, the language and the words.
 *
 * **An edit that finds nothing stops the load.** The words were copied from the
 * input; if they are not there, either the input or the edit is wrong, and
 * carrying on would leave the page unchanged without anyone noticing.
 */

import type { CmsDump } from "./cms"

export interface SiteEdit {
  slug: string
  versionNumber: number
  locale: "ja" | "en"
  field: "title" | "content"
  before: string
  after: string
}

/**
 * The content with every edit made. An edit replaces each occurrence in every
 * row of its version and language — a version can be held both as a draft and
 * as published — and must find at least one.
 */
export function applySiteEdits(cms: CmsDump, edits: readonly SiteEdit[]): CmsDump {
  const found = new Map<SiteEdit, number>(edits.map((edit) => [edit, 0]))
  const documents = cms.documents.map((doc) => ({
    ...doc,
    versions: doc.versions.map((version) => {
      let row = version
      for (const edit of edits) {
        if (edit.slug !== doc.slug || edit.versionNumber !== version.versionNumber || edit.locale !== version.locale) continue
        const text = row[edit.field]
        if (!text?.includes(edit.before)) continue
        found.set(edit, (found.get(edit) ?? 0) + text.split(edit.before).length - 1)
        row = { ...row, [edit.field]: text.replaceAll(edit.before, edit.after) }
      }
      return row
    }),
  }))
  const missed = edits.filter((edit) => found.get(edit) === 0)
  if (missed.length > 0) {
    const where = missed.map((edit) => `${edit.slug} v${edit.versionNumber} ${edit.locale} ${edit.field}: ${JSON.stringify(edit.before.slice(0, 60))}`)
    throw new Error(`site edits found nothing to replace:\n${where.join("\n")}`)
  }
  return { ...cms, documents }
}
