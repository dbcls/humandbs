import { useEffect, useRef } from "react"
import { useSubmit } from "react-router"

/**
 * Running a GET form as its field is typed.
 *
 * **The form stays a form.** What this adds is a submission nobody pressed for,
 * on a delay; with no script at all the same form is submitted by pressing
 * Enter in it and produces the same address. Nothing here is the only way to
 * ask — which is what keeps a box that narrows a listing shareable and
 * bookmarkable like everything else on the page.
 *
 * **Two things are waited for.** That the typing has stopped, because a request
 * per keystroke is a page of results nobody read; and that the composition has
 * ended, because kana is typed as several keystrokes that are not yet a word
 * and searching for the half-written form of it answers about something nobody
 * asked for.
 *
 * The submission replaces the entry rather than adding one — a reader stepping
 * back from a search should reach the page they came from, not the eight
 * prefixes of what they typed — and holds them where they are standing.
 */

/** How long the typing has to stop before a listing searches for itself. */
export const SEARCH_AFTER_TYPING = 400

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
  const runSearch = useSubmit()
  const form = useRef<HTMLFormElement>(null)
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
      const fields = form.current
      if (composing.current || fields === null) return
      const asked = new FormData(fields)
      // An empty field is no condition at all, and an address is easier to read
      // and to share without the parts of it that say nothing.
      for (const [key, given] of [...asked]) if (given === "") asked.delete(key)
      void runSearch(asked, { method: "get", action, replace: true, preventScrollReset: true })
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
