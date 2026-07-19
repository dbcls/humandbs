import type { ResearchDetailResponse } from "@humandbs/backend/types";

import { useAppForm } from "@/components/form-context/FormContext";

/** Value shape backing the research metadata form. */
export type ResearchValues = ResearchDetailResponse["data"];

/**
 * Type-only witnesses that capture the app-form type by letting `useAppForm`
 * *infer* its return from `{ defaultValues }`. We deliberately read the type via
 * `ReturnType<typeof witness>` and never call these functions.
 *
 * Why not `ReturnType<typeof useAppForm<...>>`? Spelling the 12 optional validator
 * generics explicitly resolves them differently than inference does, producing a
 * form type that a real `useAppForm({ defaultValues })` call is NOT assignable to.
 * Inferring from an actual call expression is the only way to get the exact type
 * the component produces.
 *
 * The `biome-ignore` is correct: these are compile-time type witnesses, never
 * executed, so the rules-of-hooks concern does not apply.
 */
function researchFormWitness(values: ResearchValues) {
  // biome-ignore lint/correctness/useHookAtTopLevel: type-only witness, never called
  return useAppForm({ defaultValues: values });
}

/**
 * The fully-typed app-form instance for the research metadata form. Carries the
 * registered field components (`AppField`, `BilingualTextField`, …) bound to
 * `ResearchValues`. Used at the config boundary (renderers, array-section
 * wrappers); the schema-walking engine internals stay schema-agnostic by design.
 */
export type ResearchForm = ReturnType<typeof researchFormWitness>;
