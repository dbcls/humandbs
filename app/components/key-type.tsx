import { Badge } from "~/components/base"
import { Icon, type IconName } from "~/components/icons"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

/** What a key of the catalog holds (`content_key.value_type`). */
export type KeyType = "text" | "single" | "accession" | "vocabulary" | "number" | "disease"

/**
 * The icon a type is drawn with.
 *
 * **What a key holds is a shape before it is a word**, and the shapes are what
 * separate the four kinds at a glance: strokes on a page for prose, a bulleted
 * set for a value picked from one, a number sign for a measured one, a trace
 * for the one vocabulary that has a tree. A key that identifies something
 * elsewhere takes the link's icon rather than a shape of its own.
 */
export const KEY_TYPE_ICON: Record<KeyType, IconName> = {
  text: "type",
  single: "check",
  accession: "link",
  vocabulary: "list",
  number: "hash",
  disease: "activity",
}

/**
 * A key's type as a badge: its icon and its word, and for a number the unit it
 * is stored in where the caller names it.
 *
 * **A kind, not a state, so it is a badge.** The box shows the words are a
 * category of the field rather than something that happened to it, and it is
 * muted because nothing about it is to be picked out.
 */
export function KeyTypeBadge({ type, unit = null, locale }: {
  type: KeyType
  unit?: string | null
  locale: Locale
}) {
  const word = messagesFor(locale).admin.catalog.types[type]
  return (
    <Badge icon={<Icon name={KEY_TYPE_ICON[type]} aria-hidden="true" />}>
      {unit === null ? word : `${word} (${unit})`}
    </Badge>
  )
}
