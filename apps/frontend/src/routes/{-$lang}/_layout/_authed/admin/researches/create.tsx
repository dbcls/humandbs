import { Card } from "@/components/Card";
import { AddressForm } from "@/components/form-context/AddressForm";
import { useAppForm } from "@/components/form-context/FormContext";
import { TrashButton } from "@/components/TrashButton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { i18n } from "@/lib/i18n-config";
import { ResearchSchema } from "@humandbs/backend/types";
import { createFileRoute } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import z from "zod";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_authed/admin/researches/create"
)({
  component: RouteComponent,
});

function RouteComponent() {
  const form = useAppForm({
    defaultValues,
    validators: { onSubmit: ResearchFormSchema },
  });

  const [accordion, setAccordion] = useState<string>("1");
  const [dataProvValues, setDataProvValues] = useState<string[]>([]);

  return (
    <Card
      className="relative flex h-full flex-1 flex-col"
      caption="Create research"
      containerClassName="h-full"
    >
      <section className="absolute inset-0 flex flex-col gap-5 overflow-auto">
        <form.AppForm>
          <section className="flex flex-col gap-4">
            <div className="flex gap-3">
              <form.AppField name="humId">
                {(field) => (
                  <field.TextField
                    type="col"
                    label="HumID"
                    afterField={
                      <Button variant={"outline"} size={"slim"}>
                        Next available
                      </Button>
                    }
                  />
                )}
              </form.AppField>

              <form.AppField name="url">
                {(field) => <field.TextField type="col" label="URL" />}
              </form.AppField>

              <form.AppField name="lang">
                {(field) => (
                  <field.SelectField
                    type="col"
                    label="Language"
                    items={i18n.locales as unknown as string[]}
                  />
                )}
              </form.AppField>
            </div>
            <form.AppField name="title">
              {(field) => <field.TextField type="col" label="Title" />}
            </form.AppField>
            <section>
              <p>Summary</p>
              <div className="nested-form flex flex-col gap-5">
                <form.AppField name="summary.aims">
                  {(field) => <field.TextAreaField label="Aims" />}
                </form.AppField>
                <form.AppField name="summary.methods">
                  {(field) => <field.TextAreaField label="Methods" />}
                </form.AppField>
                <form.AppField name="summary.targets">
                  {(field) => <field.TextAreaField label="Targets" />}
                </form.AppField>
                <form.AppField name="summary.url" mode="array">
                  {(field) => {
                    return (
                      <>
                        <p>URLs</p>
                        {field.state.value.length > 0 ? (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHeader>
                                  <Label>URL</Label>
                                </TableHeader>
                                <TableHead>
                                  <Label>Text</Label>
                                </TableHead>
                                <TableHead></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {field.state.value.map((_, i) => {
                                return (
                                  <TableRow key={`url-${i}`}>
                                    <TableCell>
                                      <form.AppField
                                        key={i}
                                        name={`summary.url[${i}].url`}
                                      >
                                        {(subField) => (
                                          <subField.TextField className="w-full" />
                                        )}
                                      </form.AppField>
                                    </TableCell>
                                    <TableCell>
                                      <form.AppField
                                        key={i}
                                        name={`summary.url[${i}].text`}
                                      >
                                        {(subField) => <subField.TextField />}
                                      </form.AppField>
                                    </TableCell>
                                    <TableCell>
                                      <Button
                                        variant={"plain"}
                                        onClick={() => field.removeValue(i)}
                                      >
                                        <Trash2 className="text-danger size-5" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        ) : null}

                        <Button
                          variant={"outline"}
                          className="self-start"
                          onClick={() => field.pushValue({ url: "", text: "" })}
                        >
                          Add URL
                        </Button>
                      </>
                    );
                  }}
                </form.AppField>
              </div>
            </section>

            <form.AppField mode="array" name="dataProvider">
              {(field) => {
                return (
                  <Accordion
                    onValueChange={setAccordion}
                    value={accordion}
                    type="single"
                    collapsible
                  >
                    <AccordionItem value="1" className="border-none">
                      <AccordionTrigger className="text-base">
                        <p>Data provider(s) info</p>
                      </AccordionTrigger>
                      <AccordionContent asChild>
                        <Accordion
                          type="multiple"
                          value={dataProvValues}
                          onValueChange={setDataProvValues}
                        >
                          {field.state.value.map((val, i) => {
                            return (
                              <AccordionItem
                                key={`provider-${i}-${val.name}`}
                                value={`provider-${i}-${val.name}`}
                                className="flex flex-col gap-4 px-8 py-3"
                              >
                                <AccordionTrigger>
                                  <form.Subscribe
                                    selector={(state) =>
                                      state.values.dataProvider[i].name
                                    }
                                  >
                                    {(name) => (
                                      <>
                                        <span>
                                          {name || `Data provider ${i + 1}`}
                                        </span>
                                        <span
                                          role="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            field.removeValue(i);
                                          }}
                                        >
                                          <Trash2 className="text-danger size-5 cursor-pointer" />
                                        </span>
                                      </>
                                    )}
                                  </form.Subscribe>
                                </AccordionTrigger>
                                <AccordionContent className="nested-form flex flex-col gap-4 pl-5">
                                  <div className="flex gap-5">
                                    <form.AppField
                                      name={`dataProvider[${i}].name`}
                                    >
                                      {(subField) => (
                                        <subField.TextField
                                          className="flex-1"
                                          label="Name"
                                          type="col"
                                        />
                                      )}
                                    </form.AppField>
                                    <form.AppField
                                      name={`dataProvider[${i}].email`}
                                    >
                                      {(subField) => (
                                        <subField.TextField
                                          label="Email"
                                          type="col"
                                        />
                                      )}
                                    </form.AppField>
                                    <form.AppField
                                      name={`dataProvider[${i}].orcid`}
                                    >
                                      {(subField) => (
                                        <subField.TextField
                                          label="ORCID"
                                          type="col"
                                        />
                                      )}
                                    </form.AppField>
                                  </div>
                                  <form.AppField
                                    name={`dataProvider[${i}].researchTitle`}
                                  >
                                    {(subField) => (
                                      <subField.TextField
                                        label="Research Title"
                                        type="inline"
                                      />
                                    )}
                                  </form.AppField>

                                  <div className="flex flex-col gap-5">
                                    <Label>Organization</Label>
                                    <div className="nested-form flex flex-col gap-4">
                                      <div className="flex gap-5">
                                        <form.AppField
                                          name={`dataProvider[${i}].organization.name`}
                                        >
                                          {(field) => (
                                            <field.TextField
                                              className="flex-1"
                                              label="Name"
                                              type="col"
                                            />
                                          )}
                                        </form.AppField>
                                        <form.AppField
                                          name={`dataProvider[${i}].organization.type`}
                                        >
                                          {(field) => (
                                            <field.SelectField
                                              label="Type"
                                              type="col"
                                              items={[
                                                "institution",
                                                "company",
                                                "government",
                                                "non-profit",
                                                "consortium",
                                                "agency",
                                                "other",
                                              ]}
                                            />
                                          )}
                                        </form.AppField>
                                      </div>
                                      <div className="flex gap-3">
                                        <form.AppField
                                          name={`dataProvider[${i}].organization.abbreviation`}
                                        >
                                          {(field) => (
                                            <field.TextField
                                              label="Abbreviation"
                                              type="col"
                                              className="flex-1"
                                            />
                                          )}
                                        </form.AppField>
                                        <form.AppField
                                          name={`dataProvider[${i}].organization.url`}
                                        >
                                          {(field) => (
                                            <field.TextField
                                              label="URL"
                                              type="col"
                                              className="flex-1"
                                            />
                                          )}
                                        </form.AppField>
                                        <form.AppField
                                          name={`dataProvider[${i}].organization.rorId`}
                                        >
                                          {(field) => (
                                            <field.TextField
                                              label="RORID"
                                              type="col"
                                              className="flex-1"
                                            />
                                          )}
                                        </form.AppField>
                                      </div>
                                      <AddressForm
                                        form={form}
                                        title="Address"
                                        fields={`dataProvider[${i}].organization.address`}
                                      />
                                    </div>
                                  </div>

                                  <form.AppField
                                    mode="array"
                                    name={`dataProvider[${i}].datasetIds`}
                                  >
                                    {(subField) => {
                                      return (
                                        <>
                                          <Label>Dataset Ids</Label>
                                          <ul className="nested-form flex flex-col gap-4">
                                            {subField.state.value?.map(
                                              (_, j) => {
                                                return (
                                                  <li
                                                    key={`provider-${i}-datasetIds-${j}`}
                                                    className="flex items-center gap-1"
                                                  >
                                                    <form.AppField
                                                      name={`dataProvider[${i}].datasetIds[${j}]`}
                                                    >
                                                      {(field) => (
                                                        <field.TextField />
                                                      )}
                                                    </form.AppField>
                                                    <TrashButton
                                                      onClick={() =>
                                                        subField.removeValue(j)
                                                      }
                                                    />
                                                  </li>
                                                );
                                              }
                                            )}
                                            <li>
                                              <Button
                                                variant={"outline"}
                                                className="self-start"
                                                onClick={() =>
                                                  subField.pushValue("")
                                                }
                                              >
                                                Add new datasetID
                                              </Button>
                                            </li>
                                          </ul>
                                        </>
                                      );
                                    }}
                                  </form.AppField>
                                </AccordionContent>
                              </AccordionItem>
                            );
                          })}
                        </Accordion>
                      </AccordionContent>
                    </AccordionItem>
                    <Button
                      variant={"outline"}
                      className="mt-5"
                      onClick={() => {
                        field.pushValue({
                          name: "",
                          email: "",
                        });
                        setAccordion("1");
                      }}
                    >
                      Add data provider
                    </Button>
                  </Accordion>
                );
              }}
            </form.AppField>
          </section>
        </form.AppForm>
        <div className="flex flex-row-reverse gap-4">
          <Button variant={"accent"} size={"lg"}>
            Save
          </Button>
        </div>
      </section>
    </Card>
  );
}

const ResearchFormSchema = ResearchSchema.omit({
  controlledAccessUser: true,
});

type FormDataType = z.infer<typeof ResearchFormSchema>;

const defaultValues: FormDataType = {
  humId: "",
  lang: "ja",
  title: "",
  url: "",
  dataProvider: [],
  researchProject: [],
  grant: [],
  relatedPublication: [],
  summary: {
    aims: "",
    methods: "",
    targets: "",
    url: [],
  },
  versions: [],
};
