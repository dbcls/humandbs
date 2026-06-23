import { UpdateResearchRequestSchema } from "@humandbs/backend/types";

import { SchemaObjectFields } from "@/components/form-context/schema-form/SchemaObjectFields";
import { SortableObjectArrayField } from "@/components/form-context/schema-form/SortableObjectArrayField";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Unwrap nullable/optional/default to reach the inner schema. */
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
function elementOf(key: string): any {
  return unwrap(UpdateResearchRequestSchema.shape[key as keyof typeof UpdateResearchRequestSchema.shape])
    ?._def?.element;
}

// === Reusable array-field renderers ===
// Each renders the section as a drag-sortable list whose item body is generated
// from the array element schema (no hardcoded field list). Shared by the dynamic
// research-detail tabs (via the config below) and the standalone NewResearchForm.

export function DataProviderArrayField({ form }: { form: any }) {
  return (
    <SortableObjectArrayField
      form={form}
      name="dataProvider"
      elementSchema={elementOf("dataProvider")}
      getTitle={(item: any) => item?.name?.en?.text ?? item?.name?.ja?.text ?? ""}
    />
  );
}

export function ResearchProjectArrayField({ form }: { form: any }) {
  return (
    <SortableObjectArrayField
      form={form}
      name="researchProject"
      elementSchema={elementOf("researchProject")}
      getTitle={(item: any) => item?.name?.en?.text ?? item?.name?.ja?.text ?? ""}
    />
  );
}

export function GrantArrayField({ form }: { form: any }) {
  return (
    <SortableObjectArrayField
      form={form}
      name="grant"
      elementSchema={elementOf("grant")}
      getTitle={(item: any) => item?.title?.en ?? item?.title?.ja ?? ""}
    />
  );
}

export function RelatedPublicationArrayField({ form }: { form: any }) {
  return (
    <SortableObjectArrayField
      form={form}
      name="relatedPublication"
      elementSchema={elementOf("relatedPublication")}
      getTitle={(item: any) => item?.title?.en ?? item?.title?.ja ?? ""}
      renderItemExtra={(item: any) =>
        item?.datasetIds && item.datasetIds.length > 0 ? (
          <div className="mt-3 flex flex-col gap-1">
            <span className="font-medium text-form-label text-xs">Dataset IDs</span>
            <div className="flex flex-wrap gap-1">
              {item.datasetIds.map((id: string) => (
                <span key={id} className="font-mono text-form-value text-xs">
                  {id}
                </span>
              ))}
            </div>
          </div>
        ) : null
      }
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
  /** Renders the field body given the live form. */
  renderer: (form: any) => React.ReactNode;
};

export const researchFieldsConfig: Partial<Record<string, ResearchFieldConfig>> = {
  title: {
    label: "Title",
    order: 0,
    renderer: (form) => (
      <form.AppField name="title">
        {(field: any) => <field.BilingualTextField variant="textarea" />}
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
  dataProvider: {
    label: "Data providers",
    order: 2,
    renderer: (form) => <DataProviderArrayField form={form} />,
  },
  researchProject: {
    label: "Research project",
    order: 3,
    renderer: (form) => <ResearchProjectArrayField form={form} />,
  },
  grant: {
    label: "Grant",
    order: 4,
    renderer: (form) => <GrantArrayField form={form} />,
  },
  relatedPublication: {
    label: "Related publication",
    order: 5,
    renderer: (form) => <RelatedPublicationArrayField form={form} />,
  },
};
