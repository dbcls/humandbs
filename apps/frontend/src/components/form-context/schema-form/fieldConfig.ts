import type React from "react";

/**
 * Props passed to a custom field renderer registered in a field config map.
 * Generic over the form's value shape `T` and the field key `K`.
 */
export type RendererProps<T = Record<string, any>, K extends keyof T = keyof T> = {
  fieldKey: K;
  value: T[K];
  defaultValue: T[K];
  onChange: (v: T[K]) => void;
  disabled?: boolean;
};

/**
 * Per-field overrides for a schema-driven form. Fields with no entry fall
 * through to the generic `FieldControl` (driven by `getFieldKind`).
 */
export type FieldConfig<T = Record<string, any>, S extends string = string> = {
  /** Section/group key used to bucket the field. */
  section?: S;
  /** Sort order within its section (lower first). */
  order?: number;
  /** Hide the field entirely. */
  hidden?: boolean;
  /** Display label override (defaults to a humanized key). */
  label?: string;
  /** Custom renderer overriding the generic control. */
  renderer?: React.ComponentType<RendererProps<T, any>>;
};
