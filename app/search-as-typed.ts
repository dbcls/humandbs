import { useEffect, useRef } from "react"
import { useSubmit } from "react-router"

/**
 * Submitting a GET form in the refinement pane without a button being pressed.
 *
 * **The form stays a form**, and the address it produces is the same one a
 * submission would produce. Nothing here is the only way to reach a result —
 * which is what keeps a narrowed listing shareable and bookmarkable like
 * everything else on the page.
 *
 * **What differs between the pane's forms is when they ask, not how.** Reading
 * the fields, dropping the empty ones and replacing the history entry is one
 * piece of work (`useAsk`); the box waits for the typing to stop, a date asks
 * the moment it has one, and a number waits until its digits are a number
 * somebody meant.
 *
 * The submission replaces the entry rather than adding one — a reader stepping
 * back from a search should reach the page they came from, not the eight
 * prefixes of what they typed — and holds them where they are standing.
 */

/** How long the typing has to stop before a listing searches for itself. */
export const SEARCH_AFTER_TYPING = 400

export interface Ask {
  /** Put on the `<Form>`, which is what is read and submitted. */
  form: React.RefObject<HTMLFormElement | null>
  /** Go to the address the form stands for as it is now. */
  ask: () => void
}

/**
 * Reading a GET form and going to the address it stands for.
 *
 * **An empty field is no condition at all**, so it is dropped: an address is
 * easier to read and to share without the parts of it that say nothing, and a
 * range with both ends empty is a facet nobody asked about.
 */
export function useAsk(action: string): Ask {
  const runSearch = useSubmit()
  const form = useRef<HTMLFormElement>(null)
  const ask = () => {
    const fields = form.current
    if (fields === null) return
    const asked = new FormData(fields)
    for (const [key, given] of [...asked]) if (given === "") asked.delete(key)
    void runSearch(asked, { method: "get", action, replace: true, preventScrollReset: true })
  }
  return { form, ask }
}

export interface SearchAsTyped {
  /** Put on the `<Form>`, which is what is read and submitted. */
  form: React.RefObject<HTMLFormElement | null>
  /** Spread onto the one field the form is driven by. */
  field: {
    onChange: () => void
    onCompositionStart: () => void
    onCompositionEnd: () => void
  }
}

/**
 * Asking once the typing has stopped.
 *
 * **Two things are waited for.** That the typing has stopped, because a request
 * per keystroke is a page of results nobody read; and that the composition has
 * ended, because kana is typed as several keystrokes that are not yet a word
 * and searching for the half-written form of it answers about something nobody
 * asked for.
 *
 * **This is the trigger for words, and only for words.** Letters accumulate
 * into what the reader meant — every prefix of it matches a superset of the
 * answer — so a result on the way is the answer coming closer. Digits do not
 * (`facets.tsx` の `Bound`).
 */
export function useSearchAsTyped({ action, enabled = true }: {
  /** Where the form goes, which the submission has to name for itself. */
  action: string
  /**
   * **Only where the box sits over what it searches.** A box that sends the
   * reader to another screen would run early and leave the page in the middle
   * of a word.
   */
  enabled?: boolean
}): SearchAsTyped {
  const { form, ask } = useAsk(action)
  const waiting = useRef<number | undefined>(undefined)
  const composing = useRef(false)

  // A timer that outlives the form would submit a form that is no longer on the
  // page, which is a navigation the reader did not ask for.
  useEffect(() => {
    return () => {
      window.clearTimeout(waiting.current)
    }
  }, [])

  const soon = () => {
    if (!enabled) return
    window.clearTimeout(waiting.current)
    waiting.current = window.setTimeout(() => {
      if (composing.current) return
      ask()
    }, SEARCH_AFTER_TYPING)
  }

  return {
    form,
    field: {
      onChange: soon,
      onCompositionStart: () => { composing.current = true },
      onCompositionEnd: () => {
        composing.current = false
        soon()
      },
    },
  }
}
