/**
 * The code editor a markdown body is written in, was shown over the form's
 * textarea by `form.tsx` の `MarkdownEditor`.
 *
 * **Client only.** It draws into the document and is imported the moment the
 * box mounts, never on the server — which is also what keeps the editor out of
 * every page that has no body to write.
 *
 * **What it has is what a textarea cannot**: line numbers, wrapping at the
 * box's own edge, the markdown's syntax characters drawn apart from the words, and the
 * caret put on a line by its number. **Tab moves focus** rather than
 * indenting: a body is prose, and a box that swallows Tab is one a keyboard
 * cannot leave.
 */

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { markdown } from "@codemirror/lang-markdown"
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { EditorState, type Range, RangeSet, StateEffect, StateField } from "@codemirror/state"
import {
  Decoration,
  type DecorationSet,
  drawSelection,
  EditorView,
  gutterLineClass,
  GutterMarker,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from "@codemirror/view"

export interface MountedMarkdown {
  /** Put the caret on a line, selected, and bring it into view. */
  goToLine: (line: number) => void
  /**
   * Colour the lines a save refused, and bring the first into view.
   *
   * **The lines are marked in the body, not only listed under it.** A list
   * reports "line 109"; the editor shows the line, and a reader scrolling past it
   * sees which one it is without counting. The indicators stay while the body is
   * edited (they move with it) until the next save responds, and an empty list
   * clears them. The selection is left alone — moving the caret is the list's
   * "go there", and pressing save should not take the caret away.
   */
  highlightLines: (lines: number[]) => void
  destroy: () => void
}

/** The lines a save refused, handed to the editor after the answer came back. */
const refusedLines = StateEffect.define<number[]>()

const refusedLine = Decoration.line({ class: "cm-refused" })
const refusedNumber = new (class extends GutterMarker {
  override elementClass = "cm-refusedGutter"
})()

/**
 * Where the refused lines are, kept as ranges so that typing above one moves
 * the indicator with the line rather than leaving it on whatever line took its
 * number.
 */
const refused = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, tr) {
    let next = marks.map(tr.changes)
    for (const effect of tr.effects) {
      if (effect.is(refusedLines)) {
        next = Decoration.set(
          effect.value
            .filter((line) => line >= 1 && line <= tr.state.doc.lines)
            .map((line) => refusedLine.range(tr.state.doc.line(line).from)),
          true,
        )
      }
    }
    return next
  },
  provide: (field) => [
    EditorView.decorations.from(field),
    // The number in the gutter is shown with the same colour, so the indicator reaches
    // across the whole row rather than starting after the gutter's rule.
    gutterLineClass.from(field, (marks) => {
      const numbers: Range<GutterMarker>[] = []
      marks.between(0, Number.MAX_SAFE_INTEGER, (from) => {
        numbers.push(refusedNumber.range(from))
      })
      return RangeSet.of(numbers, true)
    }),
  ],
})

/**
 * The editor's theme, from the site's own tokens, so the box reads as one of
 * the fields beside it (`form.tsx` の `CONTROL`): the field's fill and ink, the
 * mono typeface at the size the source textarea took, the gutter in the page's
 * surface. **The editor is as tall as its container and scrolls inside**: it fills
 * the container's column, and `minHeight: 0` keeps the body's length from becoming
 * the editor's — left at `auto`, a flex item is never shorter than what it
 * holds, and the scroller would have nothing to scroll. **The focus ring is the box's** (`focus-within` on the container), so the
 * editor draws none of its own — neither the dotted line CodeMirror puts round
 * a focused editor nor the one the browser puts round the editable content.
 * Left on, the dotted line remains 1px inside the box's ring as a second edge.
 *
 * **A refused line is tinted in the danger colour across its whole row**, the
 * gutter's number included, and the tint outranks the active line's so that
 * putting the caret on it does not wash the indicator out. The selection is drawn
 * over both, which is what "go there" leaves on the line.
 */
const theme = EditorView.theme({
  "&": {
    flex: "1 1 0%",
    minHeight: "0",
    fontSize: "0.875rem",
    backgroundColor: "var(--color-surface-input)",
    color: "var(--color-ink)",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.5",
  },
  ".cm-content": { padding: "0.375rem 0", caretColor: "var(--color-ink)" },
  "&.cm-focused": { outline: "none" },
  ".cm-content:focus-visible": { outline: "none" },
  ".cm-line": { padding: "0 0.5rem" },
  ".cm-gutters": {
    backgroundColor: "var(--color-surface)",
    color: "var(--color-ink-muted)",
    borderRight: "1px solid var(--color-line)",
  },
  ".cm-activeLine": { backgroundColor: "var(--color-surface-hover)" },
  ".cm-activeLineGutter": { backgroundColor: "var(--color-surface-hover)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "color-mix(in srgb, var(--color-brand) 20%, transparent)",
  },
  ".cm-line.cm-refused": {
    backgroundColor: "color-mix(in srgb, var(--color-danger) 14%, transparent)",
  },
  ".cm-gutterElement.cm-refusedGutter": {
    backgroundColor: "color-mix(in srgb, var(--color-danger) 14%, transparent)",
    color: "var(--color-danger)",
    fontWeight: "600",
  },
})

export function mountMarkdown(parent: HTMLElement, { doc, label, onChange }: {
  doc: string
  /** What the box is called, for whoever hears it rather than sees it. */
  label: string
  onChange: (doc: string) => void
}): MountedMarkdown {
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        EditorView.lineWrapping,
        markdown(),
        syntaxHighlighting(defaultHighlightStyle),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.contentAttributes.of({ "aria-label": label, "spellcheck": "false" }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange(update.state.doc.toString())
        }),
        refused,
        theme,
      ],
    }),
  })
  return {
    goToLine(line) {
      const at = view.state.doc.line(Math.min(Math.max(line, 1), view.state.doc.lines))
      view.dispatch({ selection: { anchor: at.from, head: at.to }, scrollIntoView: true })
      view.focus()
    },
    highlightLines(lines) {
      const first = lines.find((line) => line >= 1 && line <= view.state.doc.lines)
      view.dispatch({
        effects: first === undefined
          ? [refusedLines.of(lines)]
          : [refusedLines.of(lines), EditorView.scrollIntoView(view.state.doc.line(first).from, { y: "center" })],
      })
    },
    destroy() {
      view.destroy()
    },
  }
}
