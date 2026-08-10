/**
 * The controls the catalog screens are built from.
 *
 * They are plain forms. A row offers save, move and delete side by side, and
 * **which one was pressed is the button's own value** — a form holds one value
 * per name, so a direction cannot be a field of its own without the other
 * button's direction going along with it.
 */

export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-sm border border-line px-2 py-0.5 text-ink-muted text-xs">
      {children}
    </span>
  )
}

export function Field({ label, name, value, width = "w-48" }: {
  label: string
  name: string
  value?: string
  width?: string
}) {
  return (
    <label className="flex flex-col text-sm">
      {label}
      <input
        type="text"
        name={name}
        defaultValue={value}
        className={`${width} rounded border border-line bg-surface-input px-2 py-1`}
      />
    </label>
  )
}

export function Submit({ children, intent }: { children: React.ReactNode, intent?: string }) {
  return (
    <button
      type="submit"
      name={intent === undefined ? undefined : "intent"}
      value={intent}
      className="rounded border border-line px-3 py-1 text-sm"
    >
      {children}
    </button>
  )
}

/** What a form did, said once at the top of the screen. */
export function Result({ ok, children }: { ok: boolean, children: React.ReactNode }) {
  return (
    <p className={`mb-4 rounded-sm border px-4 py-2 text-sm ${ok ? "border-line" : "border-danger"}`}>
      {children}
    </p>
  )
}
