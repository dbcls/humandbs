import type { CreateDatasetForResearchRequest } from "@humandbs/backend/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";

import { useAppForm } from "@/components/form-context/FormContext";
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
  $createDatasetForResearch,
  type CreateDatasetForResearchResult,
} from "@/serverFunctions/datasets";

const criteriaOptions = [
  "Controlled-access (Type I)",
  "Controlled-access (Type II)",
  "Unrestricted-access",
] as const;

type CriteriaOption = (typeof criteriaOptions)[number];

interface FormTextValue {
  text: string;
  rawHtml: string;
}
interface FormBilingualTextValue {
  ja: FormTextValue;
  en: FormTextValue;
}
interface FormExperimentDataEntry {
  key: string;
  value: FormBilingualTextValue;
}
interface FormExperiment {
  header: FormBilingualTextValue;
  dataEntries: FormExperimentDataEntry[];
  footers: {
    ja: FormTextValue[];
    en: FormTextValue[];
  };
}
interface CreateDatasetFormValues {
  humId: string;
  datasetId: string;
  releaseDate: string;
  criteria: "" | CriteriaOption;
  typeOfData: {
    ja: string;
    en: string;
  };
  experiments: FormExperiment[];
}

function getCreateErrorMessage(result: CreateDatasetForResearchResult) {
  if (result.ok) return null;
  if (result.code === "FORBIDDEN") {
    return "You are not allowed to create dataset for this research, or the parent research is not draft.";
  }
  if (result.code === "NOT_FOUND") {
    return "Parent research was not found.";
  }
  if (result.code === "UNAUTHORIZED") {
    return "You are not authenticated.";
  }
  if (result.code === "CONFLICT") {
    return result.error;
  }
  return result.error;
}

function createEmptyTextValue(): FormTextValue {
  return { text: "", rawHtml: "" };
}

function createEmptyExperiment(): FormExperiment {
  return {
    header: {
      ja: createEmptyTextValue(),
      en: createEmptyTextValue(),
    },
    dataEntries: [],
    footers: { ja: [], en: [] },
  };
}

const defaultValues: CreateDatasetFormValues = {
  humId: "",
  datasetId: "",
  releaseDate: "",
  criteria: "",
  typeOfData: { ja: "", en: "" },
  experiments: [],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyName = any;

export function CreateDatasetDialog() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { mutateAsync, isPending } = useMutation({
    mutationFn: (values: {
      humId: string;
      body: CreateDatasetForResearchRequest;
    }) =>
      $createDatasetForResearch({
        data: {
          humId: values.humId,
          body: values.body,
        },
      }),
    onSuccess: async (result) => {
      if (!result.ok) {
        if (result.code === "NOT_FOUND" || result.code === "FORBIDDEN") {
          form.setFieldMeta("humId", (prev) => ({
            ...prev,
            errorMap: {
              onSubmit: getCreateErrorMessage(result) ?? result.error,
            },
          }));
          setError(null);
          return;
        }
        setError(getCreateErrorMessage(result));
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ["datasets", "list"] });
      await queryClient.invalidateQueries({ queryKey: ["researches", "list"] });

      setError(null);
      setOpen(false);
    },
    onError: (err: Error) => {
      setError(err.message ?? "Failed to create dataset.");
    },
  });

  const form = useAppForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      setError(null);
      form.setFieldMeta("humId", (prev) => ({
        ...prev,
        errorMap: { onSubmit: undefined },
      }));

      const body: CreateDatasetForResearchRequest = {};
      const normalizedDatasetId = value.datasetId.trim();
      const normalizedReleaseDate = value.releaseDate.trim();
      const normalizedTypeOfDataJa = value.typeOfData.ja.trim();
      const normalizedTypeOfDataEn = value.typeOfData.en.trim();

      if (normalizedDatasetId) {
        body.datasetId = normalizedDatasetId;
      }
      if (normalizedReleaseDate) {
        body.releaseDate = normalizedReleaseDate;
      }
      if (value.criteria) {
        body.criteria = value.criteria;
      }
      if (normalizedTypeOfDataJa || normalizedTypeOfDataEn) {
        body.typeOfData = {
          ja: normalizedTypeOfDataJa || null,
          en: normalizedTypeOfDataEn || null,
        };
      }

      if (value.experiments.length > 0) {
        body.experiments = value.experiments.map((exp) => {
          const data: Record<
            string,
            {
              ja: { text: string; rawHtml: string } | null;
              en: { text: string; rawHtml: string } | null;
            } | null
          > = {};
          exp.dataEntries.forEach((entry) => {
            const key = entry.key.trim();
            if (!key) return;
            data[key] = {
              ja: {
                text: entry.value.ja.text,
                rawHtml: entry.value.ja.rawHtml,
              },
              en: {
                text: entry.value.en.text,
                rawHtml: entry.value.en.rawHtml,
              },
            };
          });

          return {
            header: {
              ja: {
                text: exp.header.ja.text,
                rawHtml: exp.header.ja.rawHtml,
              },
              en: {
                text: exp.header.en.text,
                rawHtml: exp.header.en.rawHtml,
              },
            },
            data,
            footers: {
              ja: exp.footers.ja.map((footer) => ({
                text: footer.text,
                rawHtml: footer.rawHtml,
              })),
              en: exp.footers.en.map((footer) => ({
                text: footer.text,
                rawHtml: footer.rawHtml,
              })),
            },
          };
        });
      }

      await mutateAsync({
        humId: value.humId.trim(),
        body,
      });
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          form.reset();
          setError(null);
        }
        setOpen(nextOpen);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="accent">Add New</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Create Dataset</DialogTitle>
          <DialogDescription>
            Create a new Dataset for a parent Research.
          </DialogDescription>
        </DialogHeader>

        <form.AppForm>
          <form
            className="flex flex-col gap-4 overflow-auto flex-1 pr-2"
            onSubmit={(e) => {
              e.preventDefault();
              form.handleSubmit();
            }}
          >
            {error && (
              <div className="text-danger text-sm rounded border border-red-200 bg-red-50 p-2">
                {error}
              </div>
            )}

            <form.AppField
              name="humId"
              validators={{
                onChange: ({ value }) =>
                  value.trim().length === 0
                    ? "Parent Research ID (humId) is required."
                    : undefined,
                onSubmit: ({ value }) =>
                  value.trim().length === 0
                    ? "Parent Research ID (humId) is required."
                    : undefined,
              }}
            >
              {(field) => (
                <div className="flex flex-col gap-1">
                  <field.TextField
                    type="col"
                    label="Parent Research ID (humId)"
                  />
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

            <form.AppField name="datasetId">
              {(field) => (
                <field.TextField type="col" label="Dataset ID (optional)" />
              )}
            </form.AppField>

            <form.AppField name="releaseDate">
              {(field) => <field.DateField label="Release Date (optional)" />}
            </form.AppField>

            <form.AppField name="criteria">
              {(field) => (
                <div className="flex items-end gap-2">
                  <field.SelectField
                    type="col"
                    label="Criteria (optional)"
                    items={[...criteriaOptions]}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="slim"
                    onClick={() => {
                      field.handleChange("");
                    }}
                  >
                    Clear
                  </Button>
                </div>
              )}
            </form.AppField>

            <fieldset className="flex flex-col gap-2">
              <Label className="font-semibold">Type Of Data (optional)</Label>
              <div className="nested-form flex flex-col gap-2">
                <form.AppField name="typeOfData.ja">
                  {(field) => <field.TextField type="col" label="Japanese" />}
                </form.AppField>
                <form.AppField name="typeOfData.en">
                  {(field) => <field.TextField type="col" label="English" />}
                </form.AppField>
              </div>
            </fieldset>

            <form.AppField name="experiments" mode="array">
              {(experimentsField) => (
                <fieldset className="flex flex-col gap-2">
                  <Label className="font-semibold">
                    Experiments (optional)
                  </Label>
                  <div className="flex flex-col gap-3">
                    {experimentsField.state.value?.map(
                      (_: unknown, i: number) => (
                        <div key={i} className="relative rounded border p-3">
                          <button
                            type="button"
                            className="absolute top-2 right-2"
                            onClick={() => {
                              experimentsField.removeValue(i);
                            }}
                          >
                            <Trash2 className="text-danger size-4" />
                          </button>

                          <fieldset className="flex flex-col gap-2">
                            <Label className="text-sm font-semibold">
                              Header
                            </Label>
                            <div className="nested-form flex flex-col gap-2">
                              <form.AppField
                                name={
                                  `experiments[${i}].header.ja.text` as AnyName
                                }
                              >
                                {(field) => (
                                  <field.TextAreaField label="Header Japanese" />
                                )}
                              </form.AppField>
                              <form.AppField
                                name={
                                  `experiments[${i}].header.en.text` as AnyName
                                }
                              >
                                {(field) => (
                                  <field.TextAreaField label="Header English" />
                                )}
                              </form.AppField>
                            </div>
                          </fieldset>

                          <form.AppField
                            name={`experiments[${i}].dataEntries` as AnyName}
                            mode="array"
                          >
                            {(dataEntriesField) => (
                              <fieldset className="mt-3 flex flex-col gap-2">
                                <Label className="text-sm font-semibold">
                                  Data Entries
                                </Label>
                                {dataEntriesField.state.value?.map(
                                  (_: unknown, j: number) => (
                                    <div key={j} className="rounded border p-2">
                                      <div className="flex items-center gap-1">
                                        <form.AppField
                                          name={
                                            `experiments[${i}].dataEntries[${j}].key` as AnyName
                                          }
                                        >
                                          {(field) => (
                                            <field.TextField
                                              type="col"
                                              label="Data Key"
                                            />
                                          )}
                                        </form.AppField>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            dataEntriesField.removeValue(j);
                                          }}
                                        >
                                          <Trash2 className="text-danger size-4" />
                                        </button>
                                      </div>
                                      <div className="grid gap-2 pt-2 md:grid-cols-2">
                                        <form.AppField
                                          name={
                                            `experiments[${i}].dataEntries[${j}].value.ja.text` as AnyName
                                          }
                                        >
                                          {(field) => (
                                            <field.TextAreaField label="Value JA" />
                                          )}
                                        </form.AppField>
                                        <form.AppField
                                          name={
                                            `experiments[${i}].dataEntries[${j}].value.en.text` as AnyName
                                          }
                                        >
                                          {(field) => (
                                            <field.TextAreaField label="Value EN" />
                                          )}
                                        </form.AppField>
                                      </div>
                                    </div>
                                  ),
                                )}
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="slim"
                                  className="self-start"
                                  onClick={() => {
                                    dataEntriesField.pushValue({
                                      key: "",
                                      value: {
                                        ja: createEmptyTextValue(),
                                        en: createEmptyTextValue(),
                                      },
                                    });
                                  }}
                                >
                                  Add Data Entry
                                </Button>
                              </fieldset>
                            )}
                          </form.AppField>

                          <fieldset className="mt-3 flex flex-col gap-2">
                            <Label className="text-sm font-semibold">
                              Footers
                            </Label>
                            {(["ja", "en"] as const).map((lang) => (
                              <form.AppField
                                key={lang}
                                name={
                                  `experiments[${i}].footers.${lang}` as AnyName
                                }
                                mode="array"
                              >
                                {(footersField) => (
                                  <div className="flex flex-col gap-1">
                                    <Label className="text-xs uppercase">
                                      {lang}
                                    </Label>
                                    {footersField.state.value?.map(
                                      (_: unknown, j: number) => (
                                        <div
                                          key={j}
                                          className="flex items-center gap-1"
                                        >
                                          <form.AppField
                                            name={
                                              `experiments[${i}].footers.${lang}[${j}].text` as AnyName
                                            }
                                          >
                                            {(field) => (
                                              <field.TextAreaField
                                                label={`Footer ${lang.toUpperCase()}`}
                                              />
                                            )}
                                          </form.AppField>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              footersField.removeValue(j);
                                            }}
                                          >
                                            <Trash2 className="text-danger size-4" />
                                          </button>
                                        </div>
                                      ),
                                    )}
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="slim"
                                      className="self-start"
                                      onClick={() => {
                                        footersField.pushValue(
                                          createEmptyTextValue(),
                                        );
                                      }}
                                    >
                                      Add {lang.toUpperCase()} Footer
                                    </Button>
                                  </div>
                                )}
                              </form.AppField>
                            ))}
                          </fieldset>
                        </div>
                      ),
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="slim"
                      className="self-start"
                      onClick={() => {
                        experimentsField.pushValue(createEmptyExperiment());
                      }}
                    >
                      Add Experiment
                    </Button>
                  </div>
                </fieldset>
              )}
            </form.AppField>

            <DialogFooter className="sticky bottom-0 bg-white pt-4 border-t">
              <form.Subscribe selector={(s) => s.canSubmit}>
                {(canSubmit) => (
                  <Button type="submit" disabled={!canSubmit || isPending}>
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
