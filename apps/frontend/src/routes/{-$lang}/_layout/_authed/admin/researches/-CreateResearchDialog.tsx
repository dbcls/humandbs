import type { CreateResearchRequest } from "@humandbs/backend/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";

import { useAppForm } from "@/components/form-context/FormContext";
import {
  ArrayField,
  BilingualTextValueField,
  GrantField,
  ModifiedTag,
  PersonField,
  PublicationField,
  ResearchProjectField,
  TextValueArrayField,
  UrlArrayField,
  useFieldModified,
} from "@/components/form-context/fields";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

function TabModifiedTag({ fieldName }: { fieldName: string }) {
  const { isModified } = useFieldModified(fieldName, defaultValues);
  return <ModifiedTag isModified={isModified} />;
}

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
        <Button variant="accent" className="text-center">
          Add New
        </Button>
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

            <Tabs defaultValue="general" className="flex-1">
              <TabsList className="w-full flex-wrap h-auto">
                <TabsTrigger value="general" className="gap-1">
                  General <TabModifiedTag fieldName="title" />
                </TabsTrigger>
                <TabsTrigger value="summary" className="gap-1">
                  Summary <TabModifiedTag fieldName="summary" />
                </TabsTrigger>
                <TabsTrigger value="dataProvider" className="gap-1">
                  Data Provider <TabModifiedTag fieldName="dataProvider" />
                </TabsTrigger>
                <TabsTrigger value="researchProject" className="gap-1">
                  Research Project{" "}
                  <TabModifiedTag fieldName="researchProject" />
                </TabsTrigger>
                <TabsTrigger value="grants" className="gap-1">
                  Grants <TabModifiedTag fieldName="grant" />
                </TabsTrigger>
                <TabsTrigger value="publications" className="gap-1">
                  Publications <TabModifiedTag fieldName="relatedPublication" />
                </TabsTrigger>
                <TabsTrigger value="releaseNote" className="gap-1">
                  Release Note <TabModifiedTag fieldName="initialReleaseNote" />
                </TabsTrigger>
              </TabsList>

              {/* General Tab */}
              <TabsContent value="general" className="flex flex-col gap-4">
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
                      {(field) => (
                        <field.TextField type="col" label="Japanese" />
                      )}
                    </form.AppField>
                    <form.AppField name="title.en">
                      {(field) => (
                        <field.TextField type="col" label="English" />
                      )}
                    </form.AppField>
                  </div>
                </fieldset>

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
              </TabsContent>

              {/* Summary Tab */}
              <TabsContent value="summary" className="flex flex-col gap-3">
                <BilingualTextValueField
                  form={form}
                  baseName="summary.aims"
                  label="Aims"
                />
                <BilingualTextValueField
                  form={form}
                  baseName="summary.methods"
                  label="Methods"
                />
                <BilingualTextValueField
                  form={form}
                  baseName="summary.targets"
                  label="Targets"
                />
                <UrlArrayField
                  form={form}
                  baseName="summary.url"
                  label="URLs"
                />
                <TextValueArrayField
                  form={form}
                  baseName="summary.footers"
                  label="Footers"
                />
              </TabsContent>

              {/* Data Provider Tab */}
              <TabsContent value="dataProvider">
                <ArrayField
                  form={form}
                  name="dataProvider"
                  icon="\uD83D\uDC64"
                  defaultItem={() => ({
                    name: {
                      ja: { text: "", rawHtml: "" },
                      en: { text: "", rawHtml: "" },
                    },
                    email: "",
                    orcid: "",
                    organization: {
                      name: {
                        ja: { text: "", rawHtml: "" },
                        en: { text: "", rawHtml: "" },
                      },
                      address: { country: "" },
                    },
                    datasetIds: [],
                    researchTitle: { ja: "", en: "" },
                    periodOfDataUse: null,
                  })}
                  getItemTitle={(item) =>
                    (item as { name?: { en?: { text?: string } } })?.name?.en
                      ?.text || "New Person"
                  }
                  renderItem={(i) => (
                    <PersonField
                      form={form}
                      baseName={`dataProvider[${i}]`}
                      withDatasetIds
                    />
                  )}
                />
              </TabsContent>

              {/* Research Project Tab */}
              <TabsContent value="researchProject">
                <ArrayField
                  form={form}
                  name="researchProject"
                  defaultItem={() => ({
                    name: {
                      ja: { text: "", rawHtml: "" },
                      en: { text: "", rawHtml: "" },
                    },
                    url: {
                      ja: { text: "", url: "" },
                      en: { text: "", url: "" },
                    },
                  })}
                  getItemTitle={(item) =>
                    (item as { name?: { en?: { text?: string } } })?.name?.en
                      ?.text || "New Project"
                  }
                  renderItem={(i) => (
                    <ResearchProjectField
                      form={form}
                      baseName={`researchProject[${i}]`}
                    />
                  )}
                />
              </TabsContent>

              {/* Grants Tab */}
              <TabsContent value="grants">
                <ArrayField
                  form={form}
                  name="grant"
                  icon="\uD83C\uDF93"
                  defaultItem={() => ({
                    id: [],
                    title: { ja: "", en: "" },
                    agency: { name: { ja: "", en: "" } },
                  })}
                  getItemTitle={(item) =>
                    (item as { title?: { en?: string } })?.title?.en ||
                    "New Grant"
                  }
                  renderItem={(i) => (
                    <GrantField form={form} baseName={`grant[${i}]`} />
                  )}
                />
              </TabsContent>

              {/* Publications Tab */}
              <TabsContent value="publications">
                <ArrayField
                  form={form}
                  name="relatedPublication"
                  defaultItem={() => ({
                    title: { ja: "", en: "" },
                    doi: "",
                    datasetIds: [],
                  })}
                  getItemTitle={(item) =>
                    (item as { title?: { en?: string } })?.title?.en ||
                    "New Publication"
                  }
                  renderItem={(i) => (
                    <PublicationField
                      form={form}
                      baseName={`relatedPublication[${i}]`}
                    />
                  )}
                />
              </TabsContent>

              {/* Release Note Tab */}
              <TabsContent value="releaseNote" className="flex flex-col gap-2">
                <BilingualTextValueField
                  form={form}
                  baseName="initialReleaseNote"
                  label="Initial Release Note"
                />
              </TabsContent>
            </Tabs>

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
