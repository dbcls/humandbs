import { Card } from "@/components/Card";
import { GrantField } from "@/components/form-context/fields/GrantField";
import { PersonField } from "@/components/form-context/fields/PersonField";
import { ResearchProjectField } from "@/components/form-context/fields/ResearchProjectField";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Locale } from "@/config/i18n";
import { getResearchQueryOptions } from "@/serverFunctions/researches";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useId, useMemo, useState } from "react";

import {
  useAppForm,
  withFieldGroup,
} from "@/components/form-context/FormContext";
import { ResearchDetailSchema } from "@humandbs/backend/types";
import { z } from "zod";

export function ResearchDetails({
  humId,
  lang,
}: {
  humId: string;
  lang: Locale;
}) {
  const { data } = useSuspenseQuery(getResearchQueryOptions({ humId, lang }));
  const researchValues = data.data;

  console.log("researchValues", researchValues);
  const { _seq_no, _primary_term } = data.meta;
  const [error, setError] = useState<string | null>(null);
  const [isConflict, setIsConflict] = useState(false);

  const [editingHumId, setEditingHumId] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: researchValues,
    onSubmit: async ({ value }) => {
      // await mutateAsync({
      //   body: {
      //     title: value.title,
      //     summary: value.summary,
      //     dataProvider: value.dataProvider,
      //     researchProject: value.researchProject,
      //     grant: value.grant,
      //     relatedPublication: value.relatedPublication,
      //     controlledAccessUser: value.controlledAccessUser,
      //     _seq_no: seqNo,
      //     _primary_term: primaryTerm,
      //   },
      //   uids: normalizedUids,
      // });
    },
  });

  return (
    <>
      <Card
        className="flex h-full flex-1 flex-col"
        caption={researchValues.humId}
        containerClassName="flex flex-1 flex-col overflow-auto"
      >
        <Tabs defaultValue="basic">
          <TabsList>
            <TabsTrigger value="title">Title</TabsTrigger>

            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="datasets">Datasets</TabsTrigger>
            <TabsTrigger value="dataProvider">Data Provider</TabsTrigger>
            <TabsTrigger value="researchProject">Research Project</TabsTrigger>
            <TabsTrigger value="grant">Grant</TabsTrigger>
          </TabsList>
          <TabsContent value="title">
            <form.AppField name="title">
              {(field) => <field.BilingualTextField />}
            </form.AppField>
          </TabsContent>
          <TabsContent value="summary">
            <div>Summary </div>
            <SummaryForm form={form} fields="summary" />
          </TabsContent>
          <TabsContent value="dataProvider">
            <DataProviderArrayField form={form} />
          </TabsContent>
          <TabsContent value="researchProject">
            <ResearchProjectArrayField form={form} />
          </TabsContent>
          <TabsContent value="grant">
            <GrantArrayField form={form} />
          </TabsContent>
        </Tabs>
      </Card>
    </>
  );
}

const summarySchema = z.object({ ...ResearchDetailSchema.shape.summary.shape });

type SummaryFields = z.infer<typeof summarySchema>;

const SummaryForm = withFieldGroup({
  defaultValues: {} as SummaryFields,
  render: function Render({ group }) {
    return (
      <div>
        <group.AppField name="aims">
          {(field) => <field.BilingualTextValueField label={"Aims"} />}
        </group.AppField>
        <group.AppField name="methods">
          {(field) => <field.BilingualTextValueField label={"Methods"} />}
        </group.AppField>
        <group.AppField name="targets">
          {(field) => <field.BilingualTextValueField label={"Targets"} />}
        </group.AppField>
        <group.AppField name="url">
          {(field) => <field.BilingualURLArrayField label={"URLs"} />}
        </group.AppField>
      </div>
    );
  },
});

const dataProviderSchema = z.object({
  ...ResearchDetailSchema.shape.dataProvider.element.shape,
});

type Person = z.infer<typeof dataProviderSchema>;

const DataProviderItemForm = withFieldGroup({
  defaultValues: {} as Person,
  render: function Render({ group }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return <PersonField form={group as any} baseName="" />;
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DataProviderArrayField({ form }: { form: any }) {
  return (
    <form.Field name="dataProvider" mode="array">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {(field: any) => (
        <DataProviderSortableList form={form} field={field} />
      )}
    </form.Field>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DataProviderSortableList({ form, field }: { form: any; field: any }) {
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const items: Person[] = field.state.value ?? [];
  const itemIds = useMemo(
    () => items.map((_: unknown, i: number) => `${dndId}-${i}`),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items.length, dndId],
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = itemIds.indexOf(String(active.id));
      const newIndex = itemIds.indexOf(String(over.id));
      field.setValue(arrayMove([...items], oldIndex, newIndex));
    }
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-semibold">Data Providers</legend>
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {items.map((item, i) => (
            <SortableItem
              key={itemIds[i]}
              id={itemIds[i]}
              index={i}
              title={item?.name?.en?.text ?? item?.name?.ja?.text ?? ""}
              onRemove={() => field.removeValue(i)}
            >
              <DataProviderItemForm
                form={form}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                fields={`dataProvider[${i}]` as any}
              />
            </SortableItem>
          ))}
        </SortableContext>
      </DndContext>
      <button
        type="button"
        onClick={() =>
          field.pushValue({
            name: {
              ja: { text: "", rawHtml: "" },
              en: { text: "", rawHtml: "" },
            },
            email: null,
            orcid: null,
            organization: null,
          })
        }
        className="w-full rounded border border-dashed py-2 text-sm text-gray-500 hover:bg-gray-50"
      >
        + Add
      </button>
    </fieldset>
  );
}

const researchProjectSchema = z.object({
  ...ResearchDetailSchema.shape.researchProject.element.shape,
});

type ResearchProject = z.infer<typeof researchProjectSchema>;

const ResearchProjectItemForm = withFieldGroup({
  defaultValues: {} as ResearchProject,
  render: function Render({ group }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return <ResearchProjectField form={group as any} baseName="" />;
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ResearchProjectArrayField({ form }: { form: any }) {
  return (
    <form.Field name="researchProject" mode="array">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {(field: any) => (
        <ResearchProjectSortableList form={form} field={field} />
      )}
    </form.Field>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ResearchProjectSortableList({ form, field }: { form: any; field: any }) {
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const items: ResearchProject[] = field.state.value ?? [];
  const itemIds = useMemo(
    () => items.map((_: unknown, i: number) => `${dndId}-${i}`),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items.length, dndId],
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = itemIds.indexOf(String(active.id));
      const newIndex = itemIds.indexOf(String(over.id));
      field.setValue(arrayMove([...items], oldIndex, newIndex));
    }
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-semibold">Research Projects</legend>
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {items.map((item, i) => (
            <SortableItem
              key={itemIds[i]}
              id={itemIds[i]}
              index={i}
              title={item?.name?.en?.text ?? item?.name?.ja?.text ?? ""}
              onRemove={() => field.removeValue(i)}
            >
              <ResearchProjectItemForm
                form={form}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                fields={`researchProject[${i}]` as any}
              />
            </SortableItem>
          ))}
        </SortableContext>
      </DndContext>
      <button
        type="button"
        onClick={() =>
          field.pushValue({
            name: { ja: { text: "", rawHtml: "" }, en: { text: "", rawHtml: "" } },
            url: null,
          })
        }
        className="w-full rounded border border-dashed py-2 text-sm text-gray-500 hover:bg-gray-50"
      >
        + Add
      </button>
    </fieldset>
  );
}

const grantSchema = z.object({
  ...ResearchDetailSchema.shape.grant.element.shape,
});

type Grant = z.infer<typeof grantSchema>;

const GrantItemForm = withFieldGroup({
  defaultValues: {} as Grant,
  render: function Render({ group }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return <GrantField form={group as any} baseName="" />;
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function GrantArrayField({ form }: { form: any }) {
  return (
    <form.Field name="grant" mode="array">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {(field: any) => <GrantSortableList form={form} field={field} />}
    </form.Field>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function GrantSortableList({ form, field }: { form: any; field: any }) {
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const items: Grant[] = field.state.value ?? [];
  const itemIds = useMemo(
    () => items.map((_: unknown, i: number) => `${dndId}-${i}`),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items.length, dndId],
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = itemIds.indexOf(String(active.id));
      const newIndex = itemIds.indexOf(String(over.id));
      field.setValue(arrayMove([...items], oldIndex, newIndex));
    }
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-semibold">Grants</legend>
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {items.map((item, i) => (
            <SortableItem
              key={itemIds[i]}
              id={itemIds[i]}
              index={i}
              title={item?.title?.en ?? item?.title?.ja ?? ""}
              onRemove={() => field.removeValue(i)}
            >
              <GrantItemForm
                form={form}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                fields={`grant[${i}]` as any}
              />
            </SortableItem>
          ))}
        </SortableContext>
      </DndContext>
      <button
        type="button"
        onClick={() =>
          field.pushValue({
            id: [],
            title: { ja: "", en: "" },
            agency: { name: { ja: "", en: "" } },
          })
        }
        className="w-full rounded border border-dashed py-2 text-sm text-gray-500 hover:bg-gray-50"
      >
        + Add
      </button>
    </fieldset>
  );
}

function SortableItem({
  id,
  index,
  title,
  onRemove,
  children,
}: {
  id: string;
  index: number;
  title: string;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="rounded border bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <button
          type="button"
          className="cursor-grab touch-none text-gray-400 hover:text-gray-600"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <span className="flex-1 text-sm font-medium">
          #{index + 1} {title}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="text-gray-400 hover:text-red-500"
        >
          ✕
        </button>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}
