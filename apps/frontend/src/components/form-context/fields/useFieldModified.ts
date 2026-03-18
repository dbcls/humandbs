import { useStore } from "@tanstack/react-form";

import { useFormContext } from "../FormContext";

export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object"
  )
    return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((val, i) => deepEqual(val, b[i]));
  }

  if (Array.isArray(b)) return false;

  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);
  if (keysA.length !== keysB.length) return false;

  return keysA.every((key) =>
    deepEqual(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key],
    ),
  );
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

  return { isModified: !deepEqual(currentValue, initialValue) };
}
