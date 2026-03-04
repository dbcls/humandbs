import type { CreateResearchRequest } from "@humandbs/backend/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";

import { useAppForm, withForm } from "@/components/form-context/FormContext";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  $createResearch,
  type CreateResearchResult,
} from "@/serverFunctions/researches";

const defaultValues: CreateResearchRequest = {
  humId: undefined,
  title: { ja: "", en: "" },
  summary: {
    aims: { ja: { text: "", rawHtml: "" }, en: { text: "", rawHtml: "" } },
    methods: { ja: { text: "", rawHtml: "" }, en: { text: "", rawHtml: "" } },
    targets: { ja: { text: "", rawHtml: "" }, en: { text: "", rawHtml: "" } },
    url: { ja: [], en: [] },
    footers: { ja: [], en: [] },
  },
  dataProvider: [],
  researchProject: [],
  grant: [],
  relatedPublication: [],
  uids: [],
  initialReleaseNote: {
    ja: { text: "", rawHtml: "" },
    en: { text: "", rawHtml: "" },
  },
};

export function CreateResearchDialog() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const form = useAppForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      setError(null);
      const normalizedHumId =
        value.humId == null || value.humId.trim() === ""
          ? undefined
          : value.humId.trim();
      await mutateAsync({
        ...value,
        humId: normalizedHumId,
      });
    },
  });

  const { mutateAsync, isPending } = useMutation({
    mutationFn: (body: CreateResearchRequest) =>
      $createResearch({ data: body }),
    onSuccess: (result: CreateResearchResult) => {
      if (!result.ok) {
        if (result.code === "HUMID_CONFLICT") {
          form.setFieldMeta("humId", (prev) => ({
            ...prev,
            errorMap: { onSubmit: result.error },
          }));
        } else {
          setError(result.error);
        }
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["researches", "list"] });
      setOpen(false);
      setError(null);
      form.reset();
    },
    onError: (err: Error) => {
      setError(err.message ?? "Failed to create research.");
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          form.reset();
          setError(null);
        }
        setOpen(o);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="accent">Add New</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Create Research</DialogTitle>
          <DialogDescription>
            Create a new Research entry (draft). All fields are optional.
          </DialogDescription>
        </DialogHeader>

        <form.AppForm>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              form.handleSubmit();
            }}
            className="flex flex-col gap-4 overflow-auto flex-1 pr-2"
          >
            {error && (
              <div className="text-danger text-sm rounded border border-red-200 bg-red-50 p-2">
                {error}
              </div>
            )}

            {/* humId */}
            <form.AppField name="humId">
              {(field) => (
                <div className="flex flex-col gap-1">
                  <field.TextField type="col" label="Research ID (humId)" />
                  {field.state.meta.errors.length > 0 && (
                    <em role="alert" className="text-danger text-xs">
                      {field.state.meta.errors.map((e, i) => (
                        <p key={i}>{String(e)}</p>
                      ))}
                    </em>
                  )}
                </div>
              )}
            </form.AppField>

            {/* Title */}
            <fieldset className="flex flex-col gap-2">
              <Label className="font-semibold">Title</Label>
              <div className="nested-form flex flex-col gap-2">
                <form.AppField name="title.ja">
                  {(field) => <field.TextField type="col" label="Japanese" />}
                </form.AppField>
                <form.AppField name="title.en">
                  {(field) => <field.TextField type="col" label="English" />}
                </form.AppField>
              </div>
            </fieldset>

            {/* Summary */}
            <fieldset className="flex flex-col gap-3">
              <Label className="font-semibold">Summary</Label>
              <div className="nested-form flex flex-col gap-3">
                <BilingualTextValueFields
                  form={form}
                  baseName="summary.aims"
                  label="Aims"
                />
                <BilingualTextValueFields
                  form={form}
                  baseName="summary.methods"
                  label="Methods"
                />
                <BilingualTextValueFields
                  form={form}
                  baseName="summary.targets"
                  label="Targets"
                />

                {/* Summary URLs */}
                <UrlArrayFields
                  form={form}
                  baseName="summary.url"
                  label="URLs"
                />

                {/* Summary Footers */}
                <TextValueArrayFields
                  form={form}
                  baseName="summary.footers"
                  label="Footers"
                />
              </div>
            </fieldset>

            {/* Data Providers */}
            <ArraySection
              form={form}
              name="dataProvider"
              label="Data Providers"
              renderItem={(i) => <DataProviderFields form={form} index={i} />}
              emptyItem={{
                name: {
                  ja: { text: "", rawHtml: "" },
                  en: { text: "", rawHtml: "" },
                },
              }}
            />

            {/* Research Projects */}
            <ArraySection
              form={form}
              name="researchProject"
              label="Research Projects"
              renderItem={(i) => (
                <div className="nested-form flex flex-col gap-2">
                  <BilingualTextValueFields
                    form={form}
                    baseName={`researchProject[${i}].name`}
                    label="Name"
                  />
                  <fieldset className="flex flex-col gap-1">
                    <Label className="text-sm">URL</Label>
                    <div className="nested-form flex gap-2">
                      <div className="flex-1 flex flex-col gap-1">
                        <form.AppField
                          name={`researchProject[${i}].url.ja.text`}
                        >
                          {(f) => <f.TextField type="col" label="JA Text" />}
                        </form.AppField>
                        <form.AppField
                          name={`researchProject[${i}].url.ja.url`}
                        >
                          {(f) => <f.TextField type="col" label="JA URL" />}
                        </form.AppField>
                      </div>
                      <div className="flex-1 flex flex-col gap-1">
                        <form.AppField
                          name={`researchProject[${i}].url.en.text`}
                        >
                          {(f) => <f.TextField type="col" label="EN Text" />}
                        </form.AppField>
                        <form.AppField
                          name={`researchProject[${i}].url.en.url`}
                        >
                          {(f) => <f.TextField type="col" label="EN URL" />}
                        </form.AppField>
                      </div>
                    </div>
                  </fieldset>
                </div>
              )}
              emptyItem={{
                name: {
                  ja: { text: "", rawHtml: "" },
                  en: { text: "", rawHtml: "" },
                },
                url: {
                  ja: { text: "", url: "" },
                  en: { text: "", url: "" },
                },
              }}
            />

            {/* Grants */}
            <ArraySection
              form={form}
              name="grant"
              label="Grants"
              renderItem={(i) => (
                <div className="nested-form flex flex-col gap-2">
                  <form.AppField name={`grant[${i}].id`} mode="array">
                    {(field) => (
                      <div className="flex flex-col gap-1">
                        <Label className="text-sm">Grant IDs</Label>
                        {field.state.value?.map((_: string, j: number) => (
                          <div key={j} className="flex items-center gap-1">
                            <form.AppField name={`grant[${i}].id[${j}]`}>
                              {(f) => <f.TextField />}
                            </form.AppField>
                            <button
                              type="button"
                              onClick={() => {
                                field.removeValue(j);
                              }}
                            >
                              <Trash2 className="text-danger size-4" />
                            </button>
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="outline"
                          size="slim"
                          className="self-start"
                          onClick={() => {
                            field.pushValue("");
                          }}
                        >
                          Add ID
                        </Button>
                      </div>
                    )}
                  </form.AppField>
                  <fieldset className="flex gap-2">
                    <div className="flex-1">
                      <form.AppField name={`grant[${i}].title.ja`}>
                        {(f) => <f.TextField type="col" label="Title (JA)" />}
                      </form.AppField>
                    </div>
                    <div className="flex-1">
                      <form.AppField name={`grant[${i}].title.en`}>
                        {(f) => <f.TextField type="col" label="Title (EN)" />}
                      </form.AppField>
                    </div>
                  </fieldset>
                  <fieldset className="flex gap-2">
                    <div className="flex-1">
                      <form.AppField name={`grant[${i}].agency.name.ja`}>
                        {(f) => <f.TextField type="col" label="Agency (JA)" />}
                      </form.AppField>
                    </div>
                    <div className="flex-1">
                      <form.AppField name={`grant[${i}].agency.name.en`}>
                        {(f) => <f.TextField type="col" label="Agency (EN)" />}
                      </form.AppField>
                    </div>
                  </fieldset>
                </div>
              )}
              emptyItem={{
                id: [],
                title: { ja: "", en: "" },
                agency: { name: { ja: "", en: "" } },
              }}
            />

            {/* Related Publications */}
            <ArraySection
              form={form}
              name="relatedPublication"
              label="Related Publications"
              renderItem={(i) => (
                <div className="nested-form flex flex-col gap-2">
                  <fieldset className="flex gap-2">
                    <div className="flex-1">
                      <form.AppField name={`relatedPublication[${i}].title.ja`}>
                        {(f) => <f.TextField type="col" label="Title (JA)" />}
                      </form.AppField>
                    </div>
                    <div className="flex-1">
                      <form.AppField name={`relatedPublication[${i}].title.en`}>
                        {(f) => <f.TextField type="col" label="Title (EN)" />}
                      </form.AppField>
                    </div>
                  </fieldset>
                  <form.AppField name={`relatedPublication[${i}].doi`}>
                    {(f) => <f.TextField type="col" label="DOI" />}
                  </form.AppField>
                  <form.AppField
                    name={`relatedPublication[${i}].datasetIds`}
                    mode="array"
                  >
                    {(field) => (
                      <div className="flex flex-col gap-1">
                        <Label className="text-sm">Dataset IDs</Label>
                        {field.state.value?.map((_: string, j: number) => (
                          <div key={j} className="flex items-center gap-1">
                            <form.AppField
                              name={`relatedPublication[${i}].datasetIds[${j}]`}
                            >
                              {(f) => <f.TextField />}
                            </form.AppField>
                            <button
                              type="button"
                              onClick={() => {
                                field.removeValue(j);
                              }}
                            >
                              <Trash2 className="text-danger size-4" />
                            </button>
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="outline"
                          size="slim"
                          className="self-start"
                          onClick={() => {
                            field.pushValue("");
                          }}
                        >
                          Add Dataset ID
                        </Button>
                      </div>
                    )}
                  </form.AppField>
                </div>
              )}
              emptyItem={{
                title: { ja: "", en: "" },
                doi: "",
                datasetIds: [],
              }}
            />

            {/* UIDs */}
            <form.AppField name="uids" mode="array">
              {(field) => (
                <fieldset className="flex flex-col gap-2">
                  <Label className="font-semibold">User IDs (uids)</Label>
                  <div className="nested-form flex flex-col gap-1">
                    {field.state.value?.map((_: string, i: number) => (
                      <div key={i} className="flex items-center gap-1">
                        <form.AppField name={`uids[${i}]`}>
                          {(f) => <f.TextField />}
                        </form.AppField>
                        <button
                          type="button"
                          onClick={() => {
                            field.removeValue(i);
                          }}
                        >
                          <Trash2 className="text-danger size-4" />
                        </button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="slim"
                      className="self-start"
                      onClick={() => {
                        field.pushValue("");
                      }}
                    >
                      Add UID
                    </Button>
                  </div>
                </fieldset>
              )}
            </form.AppField>

            {/* Initial Release Note */}
            <fieldset className="flex flex-col gap-2">
              <Label className="font-semibold">Initial Release Note</Label>
              <div className="nested-form flex flex-col gap-2">
                <form.AppField name="initialReleaseNote.ja.text">
                  {(f) => <f.TextAreaField label="Japanese" />}
                </form.AppField>
                <form.AppField name="initialReleaseNote.en.text">
                  {(f) => <f.TextAreaField label="English" />}
                </form.AppField>
              </div>
            </fieldset>

            <DialogFooter className="sticky bottom-0 bg-white pt-4 border-t">
              <form.Subscribe selector={(s) => s.canSubmit}>
                {(canSubmit) => (
                  <Button
                    type="submit"
                    variant="accent"
                    disabled={!canSubmit || isPending}
                  >
                    {isPending ? "Creating..." : "Create"}
                  </Button>
                )}
              </form.Subscribe>
            </DialogFooter>
          </form>
        </form.AppForm>
      </DialogContent>
    </Dialog>
  );
}

// --- Helper sub-components ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyName = any;
type ArraySectionName =
  | "dataProvider"
  | "researchProject"
  | "grant"
  | "relatedPublication";
type ArraySectionItem =
  | NonNullable<CreateResearchRequest["dataProvider"]>[number]
  | NonNullable<CreateResearchRequest["researchProject"]>[number]
  | NonNullable<CreateResearchRequest["grant"]>[number]
  | NonNullable<CreateResearchRequest["relatedPublication"]>[number];

const BilingualTextValueFields = withForm({
  defaultValues,
  props: {} as { baseName: string; label: string },
  render({ form, baseName, label }) {
    return (
      <fieldset className="flex flex-col gap-1">
        <Label className="text-sm">{label}</Label>
        <div className="flex gap-2">
          <div className="flex-1">
            <form.AppField name={`${baseName}.ja.text` as AnyName}>
              {(f) => <f.TextField type="col" label="JA" />}
            </form.AppField>
          </div>
          <div className="flex-1">
            <form.AppField name={`${baseName}.en.text` as AnyName}>
              {(f) => <f.TextField type="col" label="EN" />}
            </form.AppField>
          </div>
        </div>
      </fieldset>
    );
  },
});

const DataProviderFields = withForm({
  defaultValues,
  props: {} as { index: number },
  render({ form, index: i }) {
    return (
      <div className="nested-form flex flex-col gap-2">
        <BilingualTextValueFields
          form={form}
          baseName={`dataProvider[${i}].name`}
          label="Name"
        />
        <div className="flex gap-2">
          <div className="flex-1">
            <form.AppField name={`dataProvider[${i}].email` as AnyName}>
              {(f) => <f.TextField type="col" label="Email" />}
            </form.AppField>
          </div>
          <div className="flex-1">
            <form.AppField name={`dataProvider[${i}].orcid` as AnyName}>
              {(f) => <f.TextField type="col" label="ORCID" />}
            </form.AppField>
          </div>
        </div>
        <fieldset className="flex flex-col gap-1">
          <Label className="text-sm">Organization</Label>
          <div className="nested-form flex flex-col gap-2">
            <BilingualTextValueFields
              form={form}
              baseName={`dataProvider[${i}].organization.name`}
              label="Organization Name"
            />
            <form.AppField
              name={
                `dataProvider[${i}].organization.address.country` as AnyName
              }
            >
              {(f) => <f.TextField type="col" label="Country" />}
            </form.AppField>
          </div>
        </fieldset>
        <fieldset className="flex gap-2">
          <div className="flex-1">
            <form.AppField
              name={`dataProvider[${i}].researchTitle.ja` as AnyName}
            >
              {(f) => <f.TextField type="col" label="Research Title (JA)" />}
            </form.AppField>
          </div>
          <div className="flex-1">
            <form.AppField
              name={`dataProvider[${i}].researchTitle.en` as AnyName}
            >
              {(f) => <f.TextField type="col" label="Research Title (EN)" />}
            </form.AppField>
          </div>
        </fieldset>
        <form.AppField
          name={`dataProvider[${i}].datasetIds` as AnyName}
          mode="array"
        >
          {(field) => (
            <div className="flex flex-col gap-1">
              <Label className="text-sm">Dataset IDs</Label>
              {field.state.value?.map((_: string, j: number) => (
                <div key={j} className="flex items-center gap-1">
                  <form.AppField
                    name={`dataProvider[${i}].datasetIds[${j}]` as AnyName}
                  >
                    {(f) => <f.TextField />}
                  </form.AppField>
                  <button
                    type="button"
                    onClick={() => {
                      field.removeValue(j);
                    }}
                  >
                    <Trash2 className="text-danger size-4" />
                  </button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="slim"
                className="self-start"
                onClick={() => {
                  field.pushValue("");
                }}
              >
                Add Dataset ID
              </Button>
            </div>
          )}
        </form.AppField>
      </div>
    );
  },
});

const UrlArrayFields = withForm({
  defaultValues,
  props: {} as { baseName: "summary.url"; label: string },
  render({ form, baseName, label }) {
    return (
      <fieldset className="flex flex-col gap-2">
        <Label className="text-sm">{label}</Label>
        {(["ja", "en"] as const).map((lang) => (
          <form.AppField key={lang} name={`${baseName}.${lang}`} mode="array">
            {(field) => (
              <div className="flex flex-col gap-1">
                <Label className="text-xs uppercase">{lang}</Label>
                {field.state.value?.map((_: unknown, j: number) => (
                  <div key={j} className="flex items-center gap-1">
                    <form.AppField
                      name={`${baseName}.${lang}[${j}].text` as AnyName}
                    >
                      {(f) => <f.TextField label="Text" />}
                    </form.AppField>
                    <form.AppField
                      name={`${baseName}.${lang}[${j}].url` as AnyName}
                    >
                      {(f) => <f.TextField label="URL" />}
                    </form.AppField>
                    <button
                      type="button"
                      onClick={() => {
                        field.removeValue(j);
                      }}
                    >
                      <Trash2 className="text-danger size-4" />
                    </button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="slim"
                  className="self-start"
                  onClick={() => {
                    field.pushValue({ text: "", url: "" });
                  }}
                >
                  Add {lang.toUpperCase()}
                </Button>
              </div>
            )}
          </form.AppField>
        ))}
      </fieldset>
    );
  },
});

const TextValueArrayFields = withForm({
  defaultValues,
  props: {} as { baseName: "summary.footers"; label: string },
  render({ form, baseName, label }) {
    return (
      <fieldset className="flex flex-col gap-2">
        <Label className="text-sm">{label}</Label>
        {(["ja", "en"] as const).map((lang) => (
          <form.AppField key={lang} name={`${baseName}.${lang}`} mode="array">
            {(field) => (
              <div className="flex flex-col gap-1">
                <Label className="text-xs uppercase">{lang}</Label>
                {field.state.value?.map((_: unknown, j: number) => (
                  <div key={j} className="flex items-center gap-1">
                    <form.AppField
                      name={`${baseName}.${lang}[${j}].text` as AnyName}
                    >
                      {(f) => <f.TextField label="Text" />}
                    </form.AppField>
                    <button
                      type="button"
                      onClick={() => {
                        field.removeValue(j);
                      }}
                    >
                      <Trash2 className="text-danger size-4" />
                    </button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="slim"
                  className="self-start"
                  onClick={() => {
                    field.pushValue({ text: "", rawHtml: "" });
                  }}
                >
                  Add {lang.toUpperCase()}
                </Button>
              </div>
            )}
          </form.AppField>
        ))}
      </fieldset>
    );
  },
});

const ArraySection = withForm({
  defaultValues,

  props: {} as {
    name: ArraySectionName;
    label: string;
    renderItem: (index: number) => React.ReactNode;
    emptyItem: ArraySectionItem;
  },
  render({ form, name, label, renderItem, emptyItem }) {
    return (
      <form.AppField name={name} mode="array">
        {(field) => (
          <fieldset className="flex flex-col gap-2">
            <Label className="font-semibold">{label}</Label>
            <div className="flex flex-col gap-3">
              {field.state.value?.map((_: unknown, i: number) => (
                <div key={i} className="relative rounded border p-3">
                  <button
                    type="button"
                    className="absolute top-2 right-2"
                    onClick={() => {
                      field.removeValue(i);
                    }}
                  >
                    <Trash2 className="text-danger size-4" />
                  </button>
                  {renderItem(i)}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="slim"
                className="self-start"
                onClick={() => {
                  field.pushValue(emptyItem);
                }}
              >
                Add {label.replace(/s$/, "")}
              </Button>
            </div>
          </fieldset>
        )}
      </form.AppField>
    );
  },
});
