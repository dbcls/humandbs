/**
 * A curator's question written where the answer belongs.
 *
 * v1 had no state for "this value should exist but is not settled", so a
 * curator asking the data provider wrote the question into the value itself:
 * `ご教示ください`, `プロジェクト名等ありましたらご教示ください(英語名)`,
 * `HeLa （購入情報をご教示ください）`, and a number's note when the question
 * followed a number (`450K: ご教示ください`). In v2 that is two things — the slot is
 * `unknown`, and what is being asked is a comment on that slot. Left as a value, the question would
 * pass the publish check as an answer and reach the public page.
 *
 * Only drafts have these; the published content holds none.
 *
 * **A value that contains a question is unsettled as a whole**, even when part
 * of it is an answer (`HeLa （購入情報をご教示ください）`): keeping it as a value
 * keeps the question in it. Nothing is lost, because the comment has the
 * words as they were.
 *
 * **A question that asks no more than "please tell us" leaves no comment.** The
 * preview already shows an unsettled slot as a red `ご教示ください`, so the
 * comment would repeat it. A list of IDs with a state (grant numbers) is
 * unsettled as a whole; one without (the IDs typed for a publication) has the
 * question taken out and always left as a comment.
 */

import type { CommentAnchor, NumberValue, RichText, Slot } from "~/content/types"

/** The phrasings curators asked in. Each is a request, never a data value. */
const REQUEST = /ご教示|お知らせください|ご確認|でしょうか|ますか[？?]|お願いします|ご記入/

/** A request that mentions nothing beyond itself. */
const BARE_REQUEST = /^ご教示(?:ください|下さい)。?$/

export function isRequest(text: string): boolean {
  return REQUEST.test(text)
}

export interface Asked {
  /** The place the comment anchors to, in the editing path vocabulary. */
  path: string
  /** The question as written, per language, or once for a single-valued slot. */
  ja?: string
  en?: string
  text?: string
  /**
   * The question was taken out of a list rather than leaving an unsettled
   * badge, so even a bare request has to be said in the comment.
   */
  unmarked?: true
}

type Subject = { kind: "research" } | { kind: "dataset", datasetId: string }

const STATES = new Set(["value", "unknown", "not-applicable"])

function isSlot(node: unknown): node is Slot<unknown> {
  return typeof node === "object" && node !== null && !Array.isArray(node)
    && STATES.has((node as { state?: unknown }).state as string)
}

function isTranslated(node: unknown): node is { ja: Slot<unknown>, en: Slot<unknown> } {
  if (typeof node !== "object" || node === null || Array.isArray(node)) return false
  const record = node as { ja?: unknown, en?: unknown }
  return isSlot(record.ja) && isSlot(record.en)
}

function isRichText(value: unknown): value is RichText {
  return Array.isArray(value) && value.every((line: unknown) => Array.isArray(line)
    && line.every((span: unknown) => typeof span === "object" && span !== null
      && typeof (span as { text?: unknown }).text === "string"))
}

/** The words of a string or prose slot; anything else is not a sentence. */
function wordsOf(slot: Slot<unknown>): string | null {
  if (slot.state !== "value") return null
  if (typeof slot.value === "string") return slot.value
  if (isRichText(slot.value)) return slot.value.map((line) => line.map((span) => span.text).join("")).join("\n")
  return null
}

function isNumbers(value: unknown): value is NumberValue[] {
  return Array.isArray(value) && value.length > 0 && value.every((one: unknown) => typeof one === "object" && one !== null
    && typeof (one as { inputValue?: unknown }).inputValue === "number")
}

/**
 * The numbers of a slot written out, when a label or a note of one of them
 * asks something: `450K: ご教示ください` was read as 450 with the note
 * `K: ご教示ください`. **Every number is written**, the answered ones too, since
 * the whole slot goes unsettled and the comment is what keeps them.
 */
function askedNumbers(numbers: readonly NumberValue[]): { ja: string, en: string } | null {
  const asks = numbers.some((one) => [one.label?.ja, one.label?.en, one.note?.ja, one.note?.en].some((words) => words !== undefined && isRequest(words)))
  if (!asks) return null
  const line = (one: NumberValue, lang: "ja" | "en") => {
    const label = one.label?.[lang] ? `${one.label[lang]}: ` : ""
    const high = one.inputHigh == null ? "" : `-${one.inputHigh}`
    const unit = one.inputUnit === null ? "" : ` ${one.inputUnit}`
    const note = one.note?.[lang] ? ` (${one.note[lang]})` : ""
    return `${label}${one.inputValue}${high}${unit}${note}`
  }
  return { ja: numbers.map((one) => line(one, "ja")).join("\n"), en: numbers.map((one) => line(one, "en")).join("\n") }
}

const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every((one) => typeof one === "string")

function settled<T>(slot: Slot<T>): { slot: Slot<T>, asked: string | null } {
  // A list of IDs with a state of its own (a grant's numbers): a question in it
  // unsettles the list, and the comment keeps every ID it held.
  if (slot.state === "value" && isStrings(slot.value) && slot.value.length > 0) {
    if (!slot.value.some(isRequest)) return { slot, asked: null }
    return { slot: { state: "unknown" }, asked: slot.value.join("\n") }
  }
  if (slot.state === "value" && isNumbers(slot.value)) {
    const numbers = askedNumbers(slot.value)
    if (numbers === null) return { slot, asked: null }
    return { slot: { state: "unknown" }, asked: numbers.ja === numbers.en ? numbers.ja : `日本語: ${numbers.ja}\n英語: ${numbers.en}` }
  }
  const words = wordsOf(slot)
  if (words === null || !isRequest(words)) return { slot, asked: null }
  return { slot: { state: "unknown" }, asked: words }
}

function identityOf(item: unknown): string | undefined {
  if (typeof item !== "object" || item === null) return undefined
  const record = item as { id?: unknown, keyId?: unknown }
  if (typeof record.id === "string") return record.id
  return typeof record.keyId === "string" ? record.keyId : undefined
}

/**
 * The content with every question turned `unknown`, and what was asked where.
 * A value slot is the place its value is asked about, as the editor anchors it;
 * elsewhere the place is the field — the translated pair, or the single slot.
 */
export function settleRequests<T>(content: T): { content: T, asked: Asked[] } {
  const asked: Asked[] = []

  const walk = (node: unknown, path: string[], place: string[] | null): unknown => {
    const at = (place ?? path).join(".")
    if (isTranslated(node)) {
      const ja = settled(node.ja)
      const en = settled(node.en)
      if (ja.asked === null && en.asked === null) return node
      asked.push({ path: at, ...(ja.asked === null ? {} : { ja: ja.asked }), ...(en.asked === null ? {} : { en: en.asked }) })
      return { ...node, ja: ja.slot, en: en.slot }
    }
    if (isSlot(node)) {
      const one = settled(node)
      if (one.asked === null) return node
      asked.push({ path: at, text: one.asked })
      return one.slot
    }
    if (Array.isArray(node) && node.every((item) => typeof item === "string")) {
      // A list of plain strings has no state to turn unknown, so the question
      // leaves the list and stays only in the comment.
      const items = node
      const questions = items.filter(isRequest)
      if (questions.length === 0) return node
      asked.push({ path: at, text: questions.join("\n"), unmarked: true })
      return items.filter((item) => !isRequest(item))
    }
    if (Array.isArray(node)) {
      return (node as unknown[]).map((item) => {
        const identity = identityOf(item)
        return identity === undefined ? item : walk(item, [...path, identity], place)
      })
    }
    if (typeof node !== "object" || node === null) return node
    const record = node as Record<string, unknown>
    // A value slot is where the editor anchors whatever is said about its value.
    const slotPath = typeof record.keyId === "string" && "value" in record ? path : place
    return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, walk(value, [...path, key], slotPath)]))
  }

  return { content: walk(content, [], null) as T, asked }
}

/** The words of a question, once when both languages asked the same. */
function bodyOf(one: Asked): string | null {
  const said = [one.ja, one.en, one.text].filter((words): words is string => words !== undefined)
  if (one.unmarked !== true && said.every((words) => BARE_REQUEST.test(words.trim()))) return null
  if (one.ja !== undefined && one.en !== undefined && one.ja !== one.en) return `日本語: ${one.ja}\n英語: ${one.en}`
  return said[0] ?? null
}

/** One comment per place that asked something the unsettled badge does not already say. */
export function requestComments(subject: Subject, asked: readonly Asked[]): { anchor: CommentAnchor, body: string }[] {
  return asked.flatMap((one) => {
    const body = bodyOf(one)
    if (body === null) return []
    const anchor: CommentAnchor = subject.kind === "research"
      ? { kind: "research-field", path: one.path }
      : { kind: "dataset-field", datasetId: subject.datasetId, path: one.path }
    return [{ anchor, body }]
  })
}
