/**
 * The controls the management forms are built from.
 *
 * They are plain forms. A row offers save, move and delete side by side, and
 * **which one was pressed is the button's own value** — a form holds one value
 * per name, so a direction cannot be a field of its own without the other
 * button's direction going along with it.
 *
 * Nothing here needs JavaScript. The screens that edit a research do (a state
 * toggle and a merge are moves inside a page), but a catalog row and a document
 * body are a form and a submit.
 *
 * **No control here is marked `required`.** The rules live on the server, where
 * a save is checked against the whole content rather than one box at a time, and
 * a form under `SectionTabs` cannot use the browser's own validation at all: a
 * required field inside a hidden panel cannot be focused, so pressing save does
 * nothing and explains nothing.
 *
 * What a control *looks* like is `base.tsx`, which the public pages draw from
 * as well.
 */

import { useId, type ReactNode } from "react"

import { Button, type ButtonVariant } from "~/components/base"
import { Icon } from "~/components/icons"

const CONTROL = "rounded border border-line-strong bg-surface-input px-2 py-1 text-ink"

/**
 * The frame every input sits in: what it is called, what it has to look like,
 * and what was wrong with it.
 *
 * The label is tied to the control by id rather than by wrapping it, because a
 * checkbox wants its label after it and everything else wants it before.
 */
function Labelled({ id, label, hint, error, children, inline = false }: {
  id: string
  label: string
  hint?: string
  error?: string
  children: ReactNode
  inline?: boolean
}) {
  return (
    <div className={inline ? "flex items-start gap-2 text-sm" : "flex flex-col gap-1 text-sm"}>
      {inline
        ? (
            <>
              {children}
              <label htmlFor={id} className="text-ink">{label}</label>
            </>
          )
        : (
            <>
              <label htmlFor={id} className="font-semibold text-ink-muted text-xs">{label}</label>
              {children}
            </>
          )}
      {hint !== undefined && <span className="text-ink-muted text-xs">{hint}</span>}
      {error !== undefined && (
        <span id={`${id}-error`} className="flex items-center gap-1 text-danger text-xs">
          <Icon name="alert" />
          {error}
        </span>
      )}
    </div>
  )
}

/** What every control passes through: naming, help, and the state it is in. */
interface FieldLook {
  label: string
  name: string
  hint?: string
  error?: string
  disabled?: boolean
}

function invalid(id: string, error?: string) {
  return error === undefined
    ? {}
    : { "aria-invalid": true, "aria-describedby": `${id}-error` }
}

function edge(error?: string) {
  return error === undefined ? "" : "border-danger"
}

export function Field({ label, name, value, hint, error, disabled, width = "w-48", type = "text" }: FieldLook & {
  value?: string
  width?: string
  /** `text` unless the value has a shape the browser can help with. */
  type?: "text" | "email" | "url" | "number" | "date" | "search"
}) {
  const id = useId()
  return (
    <Labelled id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        type={type}
        name={name}
        defaultValue={value}
        disabled={disabled}
        className={`${CONTROL} ${width} ${edge(error)} disabled:opacity-50`}
        {...invalid(id, error)}
      />
    </Labelled>
  )
}

/** A body: markdown, written as it will be stored. */
export function TextArea({ label, name, value, hint, error, disabled, rows = 16 }: FieldLook & {
  value?: string
  rows?: number
}) {
  const id = useId()
  return (
    <Labelled id={id} label={label} hint={hint} error={error}>
      <textarea
        id={id}
        name={name}
        defaultValue={value}
        rows={rows}
        disabled={disabled}
        spellCheck={false}
        className={`${CONTROL} w-full font-mono text-xs ${edge(error)} disabled:opacity-50`}
        {...invalid(id, error)}
      />
    </Labelled>
  )
}

/** One of a fixed, short list. Anything longer is a search box over a catalog. */
export function Select({ label, name, value, options, hint, error, disabled }: FieldLook & {
  value?: string
  options: { value: string, label: string }[]
}) {
  const id = useId()
  return (
    <Labelled id={id} label={label} hint={hint} error={error}>
      <select
        id={id}
        name={name}
        defaultValue={value}
        disabled={disabled}
        className={`${CONTROL} ${edge(error)} disabled:opacity-50`}
        {...invalid(id, error)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </Labelled>
  )
}

export function Checkbox({ label, name, value, checked, hint, error, disabled }: FieldLook & {
  value?: string
  checked?: boolean
}) {
  const id = useId()
  return (
    <Labelled id={id} label={label} hint={hint} error={error} inline>
      <input
        id={id}
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={checked}
        disabled={disabled}
        className="mt-0.5 size-4 accent-brand disabled:opacity-50"
        {...invalid(id, error)}
      />
    </Labelled>
  )
}

/**
 * One of a few, all of them visible.
 *
 * A `<fieldset>` rather than a set of labelled boxes, so that the question the
 * options answer is announced once instead of repeated on each of them.
 */
export function RadioGroup({ label, name, value, options, hint, disabled }: {
  label: string
  name: string
  value?: string
  options: { value: string, label: string }[]
  hint?: string
  disabled?: boolean
}) {
  return (
    <fieldset className="flex flex-col gap-1 text-sm" disabled={disabled}>
      <legend className="font-semibold text-ink-muted text-xs">{label}</legend>
      <div className="flex flex-wrap gap-4">
        {options.map((option) => (
          <label key={option.value} className="flex items-center gap-1.5">
            <input
              type="radio"
              name={name}
              value={option.value}
              defaultChecked={option.value === value}
              className="size-4 accent-brand"
            />
            {option.label}
          </label>
        ))}
      </div>
      {hint !== undefined && <span className="text-ink-muted text-xs">{hint}</span>}
    </fieldset>
  )
}

/**
 * Choosing a file to send.
 *
 * The bytes never pass through the application — the browser puts them into the
 * store with a signed URL — so this is a chooser and nothing else
 * (`docs/data-model.md` の「ファイル」).
 */
export function FileField({ label, name, hint, error, disabled, multiple = false }: FieldLook & {
  multiple?: boolean
}) {
  const id = useId()
  return (
    <Labelled id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        type="file"
        name={name}
        multiple={multiple}
        disabled={disabled}
        className="text-sm file:mr-3 file:cursor-pointer file:rounded file:border file:border-brand file:bg-white file:px-3 file:py-1 file:text-brand file:text-sm"
        {...invalid(id, error)}
      />
    </Labelled>
  )
}

/**
 * A translated pair, side by side.
 *
 * The two languages are one field with two values, not two fields, and putting
 * them beside each other is what makes a missing translation visible without
 * anything having to say so.
 */
export function BilingualField({ label, name, ja, en, hint, error, disabled }: FieldLook & {
  ja?: string
  en?: string
}) {
  return (
    <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
      <Field
        label={`${label} (ja)`}
        name={`${name}.ja`}
        value={ja}
        hint={hint}
        error={error}
        disabled={disabled}
        width="w-full"
      />
      <Field
        label={`${label} (en)`}
        name={`${name}.en`}
        value={en}
        disabled={disabled}
        width="w-full"
      />
    </div>
  )
}

/**
 * The checkbox at the head of a column of checkboxes.
 *
 * It works on the form's own elements rather than on state, because the boxes
 * it turns on and off are uncontrolled: the form posts what is ticked and
 * nothing on the page reads the ticks before it is submitted. Holding them in
 * state would re-render the whole table on every tick to no end.
 */
export function SelectAll({ name, label }: { name: string, label: string }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      onChange={(event) => {
        const form = event.currentTarget.form
        if (form === null) return
        const checked = event.currentTarget.checked
        const boxes = form.querySelectorAll<HTMLInputElement>(
          `input[type="checkbox"][name="${name}"]`,
        )
        for (const box of boxes) box.checked = checked
      }}
    />
  )
}

export function Submit({ children, intent, variant = "secondary", disabled }: {
  children: ReactNode
  intent?: string
  variant?: ButtonVariant
  disabled?: boolean
}) {
  return (
    <Button
      type="submit"
      variant={variant}
      disabled={disabled}
      name={intent === undefined ? undefined : "intent"}
      value={intent}
    >
      {children}
    </Button>
  )
}

/**
 * What a form did, said once at the top of the screen.
 *
 * `role="status"` so that it is announced when it appears: a save that answers
 * on the same page is otherwise silent to anybody not watching that corner.
 */
export function Result({ ok, children }: { ok: boolean, children: ReactNode }) {
  return (
    <p
      role="status"
      className={`mb-4 flex items-start gap-2 rounded border bg-white px-4 py-2 text-sm ${
        ok ? "border-line-strong" : "border-danger text-danger"
      }`}
    >
      <Icon name={ok ? "check" : "alert"} className="mt-1" />
      <span className="min-w-0 text-ink">{children}</span>
    </p>
  )
}
