import { evaluate, getBy, useStore } from "@tanstack/react-form";

import { useFormContext } from "../FormContext";

/**
 * Get the initial (default) value for a field from its form's defaultValues.
 * Use this instead of field.options.defaultValue, which is only set when
 * a `defaultValue` prop is explicitly passed to the field component.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getFieldDefaultValue(field: any): unknown {
  return getBy(field.form.options.defaultValues, field.name);
}

// Treat null and undefined as equivalent (optional fields may be absent in
// server responses but present as null in form state, or vice versa).
function normalize(v: unknown): unknown {
  return v == null || v === "" ? undefined : v;
}

  if (Object.is(na, nb)) return true;
  if (na === undefined || nb === undefined) return false;
  if (typeof na !== "object" || typeof nb !== "object") return false;


  if (Array.isArray(nb)) return false;

  const objA = na as Record<string, unknown>;
  const objB = nb as Record<string, unknown>;


// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFieldApi = any;

export function resetFieldKeyToDefault(field: AnyFieldApi, key: string): void {
  const defaultValue = (getFieldDefaultValue(field) as Record<string, unknown>)?.[key];
  field.handleChange((prev: Record<string, unknown>) => ({
    ...prev,
    [key]: defaultValue ?? null,
  }));
}

/**
 * Returns whether a field's current value differs from its default value.
 * Pass an optional `key` to compare a single top-level property of the field
 * value (e.g. "en" or "ja" for bilingual fields).
 */
export function isFieldModified(field: AnyFieldApi, key?: string): boolean {
  const currentValue =
    key != null ? (field.state.value as Record<string, unknown>)?.[key] : field.state.value;

  const defaultValue =
    key != null
      ? (getFieldDefaultValue(field) as Record<string, unknown>)?.[key]
      : getFieldDefaultValue(field);

  return !evaluate(currentValue, defaultValue);
}

/**
 * Returns whether a form field's current value differs from its initial value.
 *
 * @param fieldName - dot-path to the field (e.g. "title.en" or "dataProvider")
 * @param initialValues - the defaultValues object passed to useAppForm
 */
export function useFieldModified<T extends Record<string, unknown>>(
  fieldName: string,
  initialValues: T,
): { isModified: boolean } {
  const form = useFormContext();

  const currentValue = useStore(form.store, (state) => {
    const parts = fieldName.split(".");
    let value: unknown = state.values;
    for (const part of parts) {
      if (value === null || value === undefined) return undefined;
      value = (value as Record<string, unknown>)[part];
    }
    return value;
  });

  // Navigate the dot-path in initialValues
  const parts = fieldName.split(".");
  let initialValue: unknown = initialValues;
  for (const part of parts) {
    if (initialValue === null || initialValue === undefined) {
      initialValue = undefined;
      break;
    }
    initialValue = (initialValue as Record<string, unknown>)[part];
  }

  return { isModified: !evaluate(currentValue, initialValue) };
}
