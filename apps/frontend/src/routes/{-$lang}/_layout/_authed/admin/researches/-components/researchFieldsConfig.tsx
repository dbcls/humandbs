import type { ReactNode } from "react";

import { UpdateResearchRequestSchema } from "@humandbs/backend/types";

import { SchemaObjectFields } from "@/components/form-context/schema-form/SchemaObjectFields";
import { SortableObjectArrayField } from "@/components/form-context/schema-form/SortableObjectArrayField";

import type { ResearchForm, ResearchValues } from "./researchForm";

// Element item types, derived from the form's value shape.
type DataProvider = NonNullable<ResearchValues["dataProvider"]>[number];
type ResearchProject = NonNullable<ResearchValues["researchProject"]>[number];
type Grant = NonNullable<ResearchValues["grant"]>[number];
type RelatedPublication = NonNullable<ResearchValues["relatedPublication"]>[number];

/**
 * Structural constraint for an app form usable by the array-section wrappers:
 * it must expose the `AppField`/`Field` mounters. The wrappers are generic over
 * `F` so each accepts whatever *precise* form the caller has — the
 * research-*detail* form (`ResearchValues`) or the *create* form
 * (`CreateResearchRequest`) — instead of widening it to `any`. (TanStack's form
 * data type is invariant, so a plain union of the two forms isn't assignable; a
 * generic lets the exact call-site type flow through.)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SectionForm = { AppField: any; Field: any };

/**
 * Unwrap nullable/optional/default to reach the inner Zod schema.
 *
 * Operates on Zod `_def` internals, which are intentionally untyped — this is the
 * dynamic boundary between the typed config surface and the schema-walking engine.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap(schema: any): any {
  let s = schema;
  for (let i = 0; i < 10; i++) {
    const t = s?._def?.type;
    if (t === "nullable" || t === "optional" || t === "default") s = s._def.innerType;
    else break;
  }
  return s;
}

/** Element schema of an (optional) array field on UpdateResearchRequestSchema. */
function elementOf(key: keyof typeof UpdateResearchRequestSchema.shape) {
  return unwrap(UpdateResearchRequestSchema.shape[key])?._def?.element;
}

// === Reusable array-field renderers ===
// Each renders the section as a drag-sortable list whose item body is generated
// from the array element schema (no hardcoded field list). Shared by the dynamic
// research-detail tabs (via the config below) and the standalone NewResearchForm.

export function DataProviderArrayField<F extends SectionForm>({ form }: { form: F }) {
  return (
    <SortableObjectArrayField<DataProvider>
      form={form}
      name="dataProvider"
      elementSchema={elementOf("dataProvider")}
      getTitle={(item) => item?.name?.en?.text ?? item?.name?.ja?.text ?? ""}
      overrides={{
        "organization.name": ({ form, name, label }) => (
          <form.AppField name={name}>
            {(field) => (
              <field.BilingualTextValueField label={label} inputsClassName="flex w-full gap-2" />
            )}
          </form.AppField>
        ),
      }}
    />
  );
}

export function ResearchProjectArrayField<F extends SectionForm>({ form }: { form: F }) {
  return (
    <SortableObjectArrayField<ResearchProject>
      form={form}
      name="researchProject"
      elementSchema={elementOf("researchProject")}
      getTitle={(item) => item?.name?.en?.text ?? item?.name?.ja?.text ?? ""}
      overrides={{
        name: ({ form, name, label }) => (
          <form.AppField name={name}>
            {(field) => (
              <field.BilingualTextValueField label={label} inputsClassName="flex w-full gap-2" />
            )}
          </form.AppField>
        ),
      }}
    />
  );
}

export function GrantArrayField<F extends SectionForm>({ form }: { form: F }) {
  return (
    <SortableObjectArrayField<Grant>
      form={form}
      name="grant"
      elementSchema={elementOf("grant")}
      getTitle={(item) => item?.title?.en ?? item?.title?.ja ?? ""}
      overrides={{
        title: ({ form, name, label }) => (
          <form.AppField name={name}>
            {(field) => <field.BilingualTextField label={label} variant="textarea" />}
          </form.AppField>
        ),
        "agency.name": ({ form, name, label }) => (
          <form.AppField name={name}>
            {(field) => <field.BilingualTextField label={label} variant="textarea" />}
          </form.AppField>
        ),
      }}
    />
  );
}

export function RelatedPublicationArrayField<F extends SectionForm>({ form }: { form: F }) {
  return (
    <SortableObjectArrayField<RelatedPublication>
      form={form}
      name="relatedPublication"
      elementSchema={elementOf("relatedPublication")}
      getTitle={(item) => item?.title?.en ?? item?.title?.ja ?? ""}
      renderItemExtra={(item) =>
        item?.datasetIds && item.datasetIds.length > 0 ? (
          <div className="mt-3 flex flex-col gap-1">
            <span className="font-medium text-form-label text-xs">Dataset IDs</span>
            <div className="flex flex-wrap gap-1">
              {item.datasetIds.map((id) => (
                <span key={id} className="font-mono text-form-value text-xs">
                  {id}
                </span>
              ))}
            </div>
          </div>
        ) : null
      }
      overrides={{
        title: ({ form, name, label }) => (
          <form.AppField name={name}>
            {(field) => <field.BilingualTextField label={label} variant="textarea" />}
          </form.AppField>
        ),
      }}
    />
  );
}

// === Field config ===

/**
 * Per-field config for the research metadata form. Each top-level research key
 * maps to a display label, sort order, and a renderer.
 *
 * Keys WITHOUT an entry fall through to the generic schema-driven `FieldControl`
 * in the dynamic tab loop — so a new *scalar* backend field appears automatically.
 * Structural fields (bilingual/person/grant arrays) need an entry here so the
 * right section renderer is used.
 */
export type ResearchFieldConfig = {
  label: string;
  order: number;
  hidden?: boolean;
  /** Renders the field body given the live, typed research form. */
  renderer?: (form: ResearchForm) => ReactNode;
};

export const researchFieldsConfig: Partial<Record<keyof ResearchValues, ResearchFieldConfig>> = {
  title: {
    label: "Title",
    order: 0,
    renderer: (form) => (
      <form.AppField name="title">
        {(field) => <field.BilingualTextField label={null} variant="textarea" />}
      </form.AppField>
    ),
  },
  summary: {
    label: "Summary",
    order: 1,
    renderer: (form) => (
      <SchemaObjectFields
        form={form}
        baseName="summary"
        schema={unwrap(UpdateResearchRequestSchema.shape.summary)}
      />
    ),
  },
  summaryShort: {
    label: "Summary Short",
    order: 2,
  },
  dataProvider: {
    label: "Data providers",
    order: 3,
    renderer: (form) => <DataProviderArrayField form={form} />,
  },
  researchProject: {
    label: "Research project",
    order: 4,
    renderer: (form) => <ResearchProjectArrayField form={form} />,
  },
  grant: {
    label: "Grant",
    order: 5,
    renderer: (form) => <GrantArrayField form={form} />,
  },
  relatedPublication: {
    label: "Related publication",
    order: 6,
    renderer: (form) => <RelatedPublicationArrayField form={form} />,
  },
};
