import { evaluate } from "@tanstack/react-form";

/** True when `current` differs from `def` (deep, via tanstack's evaluate). */
export function modified(current: unknown, def: unknown) {
  return !evaluate(current, def);
}

/** "subjectCount" -> "Subject Count" */
export function humanize(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
}
