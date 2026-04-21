import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { move } from "@dnd-kit/helpers";
import { createFileRoute } from "@tanstack/react-router";
import { type Ref, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  GitBranch,
  GripVertical,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";

import { Card } from "@/components/Card";
import { LocaleInlineEditor } from "@/components/LocaleInlineEditor";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { TextareaAutosize } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NAVIGATION_FLOWCHART_STATUS } from "@/db/schema";
import {
  $createNavigationFlowchart,
  $deleteNavigationFlowchart,
  $saveNavigationFlowchartConfig,
  getNavigationFlowchartByIdQueryOptions,
  getNavigationFlowchartsQueryOptions,
} from "@/serverFunctions/navigationFlowchartAdmin";
import type {
  NavigationFlowchartRecord,
  NavigationFlowchartSummary,
} from "@/repositories/navigationFlowchart";
import type {
  NavigationFlowchartConfig,
  NavigationFlowchartOption,
  NavigationFlowchartStep,
} from "@/config/navigation-flowchart";
import { cn } from "@/lib/utils";
import useConfirmationStore from "@/stores/confirmationStore";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_authed/admin/flowcharts",
)({
  component: RouteComponent,
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(getNavigationFlowchartsQueryOptions()),
});

type EditorMode = "select" | "create" | "edit";

function RouteComponent() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>("select");

  function handleSelect(id: string) {
    setSelectedId(id);
    setMode("edit");
  }

  function handleNewFlowchart() {
    setSelectedId(null);
    setMode("create");
  }

  function handleCreated(id: string) {
    setSelectedId(id);
    setMode("edit");
  }

  function handleDeleted() {
    setSelectedId(null);
    setMode("select");
  }

  return (
    <>
      <Card className="w-cms-list-panel flex h-full flex-col" caption="Flowcharts">
        <div className="flex flex-col gap-2">
          <div className="px-1">
            <Button
              type="button"
              variant="outline"
              className="w-full gap-1.5"
              onClick={handleNewFlowchart}
            >
              <Plus className="size-3.5" />
              New Flowchart
            </Button>
          </div>
          <FlowchartList selectedId={selectedId} onSelect={handleSelect} />
        </div>
      </Card>

      {mode === "create" ? (
        <CreateFlowchartPanel key="create" onCreated={handleCreated} />
      ) : mode === "edit" && selectedId ? (
        <EditFlowchartPanel
          key={selectedId}
          id={selectedId}
          onDeleted={handleDeleted}
        />
      ) : (
        <Card className="flex flex-1 items-center justify-center text-gray-400">
          <div className="flex flex-col items-center gap-3">
            <GitBranch className="size-10 opacity-30" />
            <p className="text-sm">Select a flowchart to edit</p>
          </div>
        </Card>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// FlowchartList
// ---------------------------------------------------------------------------

/**
 * Scrollable sidebar list of all flowcharts. Highlights the currently selected
 * entry. Each item shows the EN name, published/draft badge, and an "entry
 * point" badge when the flowchart has a public slug.
 */
function FlowchartList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { data: flowcharts = [] } = useQuery(getNavigationFlowchartsQueryOptions());

  if (flowcharts.length === 0) {
    return <p className="px-1 text-sm text-gray-400">No flowcharts yet.</p>;
  }

  return (
    <div className="flex flex-col gap-0.5">
      {flowcharts.map((fc) => (
        <FlowchartListItem
          key={fc.id}
          flowchart={fc}
          isSelected={selectedId === fc.id}
          onSelect={() => onSelect(fc.id)}
        />
      ))}
    </div>
  );
}

function FlowchartListItem({
  flowchart,
  isSelected,
  onSelect,
}: {
  flowchart: NavigationFlowchartSummary;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const isPublished = flowchart.status === NAVIGATION_FLOWCHART_STATUS.PUBLISHED;

  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex w-full flex-col gap-1 rounded-md px-3 py-2 text-left text-sm transition-colors",
        isSelected ? "bg-hover text-accent-foreground" : "hover:bg-hover/50",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-medium">{flowchart.nameEn}</span>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-xs font-medium",
            isPublished ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500",
          )}
        >
          {isPublished ? "published" : "draft"}
        </span>
        {flowchart.slug && (
          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
            entry point
          </span>
        )}
      </div>
      <span className="text-xs text-gray-400">{flowchart.slug ?? "child flowchart"}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// CreateFlowchartPanel
// ---------------------------------------------------------------------------

/**
 * Panel for creating a new flowchart record. Collects EN/JA name and an
 * optional slug. Leaving the slug blank creates a child-only flowchart that
 * can only be reached via a linked option in another flowchart.
 */
function CreateFlowchartPanel({ onCreated }: { onCreated: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [nameEn, setNameEn] = useState("");
  const [nameJa, setNameJa] = useState("");
  const [slug, setSlug] = useState("");
  const [errors, setErrors] = useState<{ nameEn?: string; nameJa?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const { mutateAsync: create, isPending } = useMutation({
    mutationFn: () =>
      $createNavigationFlowchart({
        data: {
          nameEn: nameEn.trim(),
          nameJa: nameJa.trim(),
          slug: slug.trim() || null,
        },
      }),
  });

  async function handleSave() {
    const newErrors: typeof errors = {};
    if (!nameEn.trim()) newErrors.nameEn = "English name is required.";
    if (!nameJa.trim()) newErrors.nameJa = "Japanese name is required.";
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setServerError(null);
    try {
      const created = await create();
      await queryClient.invalidateQueries({ queryKey: ["navigation-flowcharts"] });
      onCreated(created.id);
    } catch {
      setServerError("Failed to create flowchart.");
    }
  }

  return (
    <Card className="flex flex-1 flex-col gap-0" caption="New Flowchart">
      <div className="flex flex-col gap-5 p-5">
        {serverError && (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {serverError}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium text-gray-700">Name</h3>
          <FieldRow label="EN">
            <input
              type="text"
              value={nameEn}
              onChange={(e) => {
                setNameEn(e.target.value);
                if (errors.nameEn) setErrors((p) => ({ ...p, nameEn: undefined }));
              }}
              placeholder="English name"
              className={cn(
                "flex-1 rounded border px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-blue-400",
                errors.nameEn ? "border-red-400" : "border-gray-200",
              )}
            />
          </FieldRow>
          {errors.nameEn && <FieldError>{errors.nameEn}</FieldError>}
          <FieldRow label="JA">
            <input
              type="text"
              value={nameJa}
              onChange={(e) => {
                setNameJa(e.target.value);
                if (errors.nameJa) setErrors((p) => ({ ...p, nameJa: undefined }));
              }}
              placeholder="Japanese name"
              className={cn(
                "flex-1 rounded border px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-blue-400",
                errors.nameJa ? "border-red-400" : "border-gray-200",
              )}
            />
          </FieldRow>
          {errors.nameJa && <FieldError>{errors.nameJa}</FieldError>}
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-gray-700">
            Slug{" "}
            <span className="font-normal text-gray-400">(optional — leave blank for child flowchart)</span>
          </h3>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="/path/to/flowchart"
            className="rounded border border-gray-200 px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>

        <div className="flex gap-2">
          <Button type="button" onClick={handleSave} disabled={isPending}>
            <Save className="size-3.5" />
            Create
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// EditFlowchartPanel
// ---------------------------------------------------------------------------

/**
 * Fetches a flowchart by ID and renders either a loading skeleton, an error
 * state, or the full `FlowchartEditor` once data is available.
 */
function EditFlowchartPanel({
  id,
  onDeleted,
}: {
  id: string;
  onDeleted: () => void;
}) {
  const {
    data: record,
    isPending,
    isError,
  } = useQuery(getNavigationFlowchartByIdQueryOptions(id));

  if (isPending) {
    return (
      <Card className="flex flex-1 flex-col gap-0">
        <div className="flex flex-col gap-3 p-5">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </Card>
    );
  }

  if (isError || !record) {
    return (
      <Card className="flex flex-1 flex-col gap-0">
        <div className="p-5 text-sm text-red-600">Failed to load flowchart.</div>
      </Card>
    );
  }

  return <FlowchartEditor record={record} onDeleted={onDeleted} />;
}

// ---------------------------------------------------------------------------
// FlowchartEditor — metadata fields + step list
// ---------------------------------------------------------------------------

/**
 * Local state shape for the non-config metadata fields (name, slug, status).
 * Kept separate from the config draft so metadata saves and step edits don't
 * interfere with each other.
 */
interface FlowchartMeta {
  nameEn: string;
  nameJa: string;
  slug: string;
  status: (typeof NAVIGATION_FLOWCHART_STATUS)[keyof typeof NAVIGATION_FLOWCHART_STATUS];
}

/**
 * Main editor for a single flowchart record. Manages local drafts for both the
 * metadata (name, slug, status) and the bilingual step config. Uses optimistic
 * locking (`revision`) to detect concurrent edits.
 *
 * Save flow:
 * 1. Validates EN/JA name and slug uniqueness.
 * 2. Validates that every step has at least 2 options.
 * 3. If the slug is being removed from an existing entry point, prompts for
 *    confirmation before proceeding.
 * 4. Sends the full config + expectedRevision to the server; handles CONFLICT.
 *
 * Delete flow: checks for dependent flowcharts (options in other flowcharts
 * that link to this one) and surfaces them before allowing deletion.
 */
function FlowchartEditor({
  record,
  onDeleted,
}: {
  record: NavigationFlowchartRecord;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const { openConfirmation } = useConfirmationStore();
  const { data: allFlowcharts = [] } = useQuery(getNavigationFlowchartsQueryOptions());

  const [meta, setMeta] = useState<FlowchartMeta>({
    nameEn: record.nameEn,
    nameJa: record.nameJa,
    slug: record.slug ?? "",
    status: record.status,
  });
  const [configDraft, setConfigDraft] = useState<NavigationFlowchartConfig>(record.config);
  const [revision, setRevision] = useState(record.revision);
  const [metaErrors, setMetaErrors] = useState<Partial<FlowchartMeta>>({});
  const [slugConflictError, setSlugConflictError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const originalSlugRef = useRef(record.slug);

  const { mutateAsync: saveFlowchart, isPending: isSaving } = useMutation({
    mutationFn: (payload: { meta: FlowchartMeta; config: NavigationFlowchartConfig }) =>
      $saveNavigationFlowchartConfig({
        data: {
          id: record.id,
          nameEn: payload.meta.nameEn,
          nameJa: payload.meta.nameJa,
          slug: payload.meta.slug.trim() || null,
          status: payload.meta.status,
          config: payload.config,
          expectedRevision: revision,
        },
      }),
  });

  const { mutateAsync: deleteFlowchart, isPending: isDeleting } = useMutation({
    mutationFn: () => $deleteNavigationFlowchart({ data: { id: record.id } }),
  });

  /** Client-side uniqueness check against already-loaded flowchart list. */
  function checkSlugUniqueness(slug: string) {
    const trimmed = slug.trim();
    if (!trimmed) { setSlugConflictError(null); return; }
    const conflict = allFlowcharts.find((fc) => fc.id !== record.id && fc.slug === trimmed);
    setSlugConflictError(
      conflict ? `Slug "${trimmed}" is already used by "${conflict.nameEn}".` : null,
    );
  }

  /** Returns IDs of EN steps that have fewer than 2 options (invalid for publishing). */
  function validateSteps(config: NavigationFlowchartConfig) {
    return config.en.steps.filter((s) => s.options.length < 2).map((s) => s.id);
  }

  async function commitSave(currentMeta: FlowchartMeta) {
    setMessage(null);
    setError(null);

    const errs: Partial<FlowchartMeta> = {};
    if (!currentMeta.nameEn.trim()) errs.nameEn = "English name is required.";
    if (!currentMeta.nameJa.trim()) errs.nameJa = "Japanese name is required.";
    setMetaErrors(errs);
    if (Object.keys(errs).length > 0) return;
    if (slugConflictError) return;

    const invalidStepIds = validateSteps(configDraft);
    if (invalidStepIds.length > 0) {
      setError("Each step must have at least 2 options. Check highlighted steps.");
      return;
    }

    const result = await saveFlowchart({ meta: currentMeta, config: configDraft });
    if (!result.ok) {
      setError(
        result.code === "CONFLICT"
          ? "This flowchart was modified by someone else. Reload to get the latest version."
          : "Failed to save.",
      );
      return;
    }

    setRevision(result.data.revision);
    originalSlugRef.current = result.data.slug;
    setMessage("Saved.");
    await queryClient.invalidateQueries({ queryKey: ["navigation-flowcharts"] });
  }

  async function handleSave() {
    const isRemovingSlug = originalSlugRef.current !== null && meta.slug.trim() === "";
    if (isRemovingSlug) {
      openConfirmation({
        title: "Remove entry point?",
        description: `This flowchart is currently at "${originalSlugRef.current}". Clearing the slug makes it child-only. Continue?`,
        actionLabel: "Remove slug and save",
        onAction: () => commitSave(meta),
      });
    } else {
      await commitSave(meta);
    }
  }

  function handleReset() {
    setMeta({ nameEn: record.nameEn, nameJa: record.nameJa, slug: record.slug ?? "", status: record.status });
    setConfigDraft(record.config);
    setMetaErrors({});
    setSlugConflictError(null);
    setMessage(null);
    setError(null);
  }

  async function handleDelete() {
    openConfirmation({
      title: "Delete flowchart?",
      description: `Are you sure you want to delete "${record.nameEn}"? This cannot be undone.`,
      actionLabel: "Delete",
      onAction: async () => {
        const result = await deleteFlowchart();
        if (!result.ok) {
          if (result.code === "HAS_DEPENDENTS") {
            const list = result.deps
              .map((d) => `• ${d.flowchartNameEn} → ${d.stepTitleEn} → ${d.optionTitleEn}`)
              .join("\n");
            setError(`Cannot delete — referenced by:\n${list}\n\nRemove references first.`);
          } else {
            setError("Failed to delete.");
          }
          return;
        }
        await queryClient.invalidateQueries({ queryKey: ["navigation-flowcharts"] });
        onDeleted();
      },
    });
  }

  const invalidStepIds = validateSteps(configDraft);
  const otherFlowcharts = allFlowcharts.filter((fc) => fc.id !== record.id);

  return (
    <Card className="flex flex-1 flex-col gap-0 overflow-y-auto" caption={record.nameEn}>
      <div className="flex flex-col gap-6 p-5">
        {message && (
          <div className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            {message}
          </div>
        )}
        {error && (
          <div className="whitespace-pre-wrap rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Flowchart name */}
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-gray-700">Name</h3>
          <LocaleInlineEditor
            value={{ en: meta.nameEn, ja: meta.nameJa }}
            onChange={({ en, ja }) => {
              setMeta((p) => ({ ...p, nameEn: en, nameJa: ja }));
              setMetaErrors((p) => ({ ...p, nameEn: undefined, nameJa: undefined }));
            }}
            displayClassName="text-sm font-medium"
            required
          />
          {metaErrors.nameEn && <FieldError>{metaErrors.nameEn}</FieldError>}
          {metaErrors.nameJa && <FieldError>{metaErrors.nameJa}</FieldError>}
        </div>

        {/* Slug */}
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-gray-700">
            Slug <span className="font-normal text-gray-400">(optional)</span>
          </h3>
          <input
            type="text"
            value={meta.slug}
            onChange={(e) => { setMeta((p) => ({ ...p, slug: e.target.value })); setSlugConflictError(null); }}
            onBlur={() => checkSlugUniqueness(meta.slug)}
            placeholder="/path/to/flowchart"
            className={cn(
              "rounded border px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-blue-400",
              slugConflictError ? "border-red-400" : "border-gray-200",
            )}
          />
          {slugConflictError && <FieldError>{slugConflictError}</FieldError>}
          {meta.slug.trim() && !slugConflictError && (
            <p className="text-xs text-blue-600">
              <span className="rounded bg-blue-100 px-1.5 py-0.5 font-medium">entry point</span>
              {" "}at <code className="font-mono">{meta.slug.trim()}</code>
            </p>
          )}
        </div>

        {/* Status */}
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium text-gray-700">Published</h3>
          <Switch
            checked={meta.status === NAVIGATION_FLOWCHART_STATUS.PUBLISHED}
            onCheckedChange={(checked) =>
              setMeta((p) => ({
                ...p,
                status: checked ? NAVIGATION_FLOWCHART_STATUS.PUBLISHED : NAVIGATION_FLOWCHART_STATUS.DRAFT,
              }))
            }
          />
          <span className="text-xs text-gray-500">
            {meta.status === NAVIGATION_FLOWCHART_STATUS.PUBLISHED ? "Published" : "Draft"}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button type="button" onClick={handleSave} disabled={isSaving || isDeleting}>
            <Save className="size-3.5" />
            {isSaving ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="outline" onClick={handleReset} disabled={isSaving}>
            <RotateCcw className="size-3.5" />
            Reset
          </Button>
          <div className="flex-1" />
          <Button
            type="button"
            variant="outline"
            className="text-red-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600"
            onClick={handleDelete}
            disabled={isSaving || isDeleting}
          >
            <Trash2 className="size-3.5" />
            {isDeleting ? "Deleting…" : "Delete"}
          </Button>
        </div>

        {/* Steps */}
        <StepList
          config={configDraft}
          onChange={setConfigDraft}
          invalidStepIds={invalidStepIds}
          otherFlowcharts={otherFlowcharts}
        />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// StepList — dnd-kit sortable step cards
// ---------------------------------------------------------------------------

/**
 * Drag-and-drop sortable list of steps. Uses dnd-kit with prefixed IDs
 * (`"step-" + step.id`) so the `move()` helper matches sortable registrations
 * correctly; prefixes are stripped after reordering.
 *
 * EN steps are authoritative for order; JA steps are kept in sync by ID lookup
 * inside `updateSteps`.
 */
function StepList({
  config,
  onChange,
  invalidStepIds,
  otherFlowcharts,
}: {
  config: NavigationFlowchartConfig;
  onChange: (c: NavigationFlowchartConfig) => void;
  invalidStepIds: string[];
  otherFlowcharts: NavigationFlowchartSummary[];
}) {
  const steps = config.en.steps;

  /** Applies a new EN step order and rebuilds the JA array to match, preserving JA content. */
  function updateSteps(newEnSteps: NavigationFlowchartStep[]) {
    const jaById = Object.fromEntries(config.ja.steps.map((s) => [s.id, s]));
    const newJaSteps = newEnSteps.map((s) => jaById[s.id] ?? s);
    onChange({ en: { steps: newEnSteps }, ja: { steps: newJaSteps } });
  }

  function handleAddStep() {
    const newStep: NavigationFlowchartStep = {
      id: crypto.randomUUID(),
      titleEn: "",
      titleJa: "",
      textEn: "",
      textJa: "",
      options: [],
    };
    updateSteps([...steps, newStep]);
  }

  function handleDeleteStep(id: string) {
    updateSteps(steps.filter((s) => s.id !== id));
  }

  function handleUpdateStep(id: string, patch: Partial<NavigationFlowchartStep>) {
    const newEnSteps = steps.map((s) => (s.id === id ? { ...s, ...patch } : s));

    // For the JA side, apply non-options fields directly (bilingual text/title
    // fields are included in the patch). For `options`, preserve JA option
    // objects but reorder them to match the EN order — never replace JA options
    // wholesale with EN objects.
    const newJaSteps = config.ja.steps.map((s) => {
      if (s.id !== id) return s;
      if (!patch.options) return { ...s, ...patch };
      const jaById = Object.fromEntries(s.options.map((o) => [o.id, o]));
      const { options: _enOptions, ...rest } = patch;
      const reorderedJaOptions = patch.options
        .map((enOpt) => jaById[enOpt.id] ?? enOpt)
        .map((jaOpt, i) => {
          // Carry over any structural fields (nextStep, linkedFlowchartId, link,
          // linkTextEn/Ja) that may have been edited on the EN side.
          const enOpt = patch.options![i];
          if (!enOpt) return jaOpt;
          return {
            ...jaOpt,
            nextStep: enOpt.nextStep,
            linkedFlowchartId: enOpt.linkedFlowchartId,
            link: enOpt.link,
            linkTextEn: enOpt.linkTextEn,
            linkTextJa: enOpt.linkTextJa ?? jaOpt.linkTextJa,
          };
        });
      return { ...s, ...rest, options: reorderedJaOptions };
    });

    onChange({ en: { steps: newEnSteps }, ja: { steps: newJaSteps } });
  }

  /** A step cannot be deleted while any option in this flowchart points to it as a nextStep target. */
  function canDeleteStep(stepId: string) {
    return !steps.some((s) => s.options.some((o) => o.nextStep === stepId));
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium text-gray-700">Steps</h3>
      <DragDropProvider
        onDragEnd={(event) => {
          if (!event.operation.target) return;
          const stepIds = steps.map((s) => "step-" + s.id);
          const record: Record<string, string[]> = { steps: stepIds };
          const next = move(record, event);
          if (!next) return;
          const newOrder = (next.steps as string[]).map((sid) => sid.replace("step-", ""));
          const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
          updateSteps(newOrder.map((id) => byId[id]));
        }}
      >
        <div className="flex flex-col gap-2">
          {steps.map((step, index) => (
            <StepCard
              key={step.id}
              step={step}
              index={index}
              jaStep={config.ja.steps.find((s) => s.id === step.id)}
              isInvalid={invalidStepIds.includes(step.id)}
              canDelete={canDeleteStep(step.id)}
              allSteps={steps}
              otherFlowcharts={otherFlowcharts}
              onUpdate={(patch) => handleUpdateStep(step.id, patch)}
              onDelete={() => handleDeleteStep(step.id)}
            />
          ))}
        </div>
      </DragDropProvider>
      <Button type="button" variant="dashed" onClick={handleAddStep}>
        <Plus className="size-3.5" />
        Add step
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StepCard
// ---------------------------------------------------------------------------

/**
 * Collapsible card for a single step. Contains:
 * - Drag handle (dnd-kit `useSortable`)
 * - Inline bilingual title editor
 * - Validation badge when fewer than 2 options exist
 * - EN/JA body text textareas
 * - `OptionList` for managing answer options
 *
 * Propagates all mutations up via `onUpdate(patch)` so the parent `StepList`
 * can keep EN and JA configs in sync.
 */
function StepCard({
  step,
  index,
  jaStep,
  isInvalid,
  canDelete,
  allSteps,
  otherFlowcharts,
  onUpdate,
  onDelete,
}: {
  step: NavigationFlowchartStep;
  index: number;
  jaStep?: NavigationFlowchartStep;
  isInvalid: boolean;
  canDelete: boolean;
  allSteps: NavigationFlowchartStep[];
  otherFlowcharts: NavigationFlowchartSummary[];
  onUpdate: (patch: Partial<NavigationFlowchartStep>) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const { ref, handleRef, isDragSource } = useSortable({
    id: "step-" + step.id,
    index,
    type: STEP_TYPE,
    accept: [STEP_TYPE],
    data: { type: STEP_TYPE },
  });

  function handleAddOption() {
    const newOpt: NavigationFlowchartOption = {
      id: crypto.randomUUID(),
      titleEn: "",
      titleJa: "",
    };
    onUpdate({ options: [...step.options, newOpt] });
  }

  function handleDeleteOption(optId: string) {
    onUpdate({ options: step.options.filter((o) => o.id !== optId) });
  }

  function handleUpdateOption(optId: string, patch: Partial<NavigationFlowchartOption>) {
    onUpdate({
      options: step.options.map((o) => (o.id === optId ? { ...o, ...patch } : o)),
    });
  }

  function handleReorderOptions(newOptions: NavigationFlowchartOption[]) {
    onUpdate({ options: newOptions });
  }

  return (
    <div
      ref={ref as Ref<HTMLDivElement>}
      className={cn(
        "rounded-md border bg-white shadow-sm transition-opacity",
        isDragSource ? "opacity-40" : "",
        isInvalid ? "border-red-300" : "border-gray-200",
      )}
    >
      {/* Card header */}
      <div className="flex items-center gap-1.5 px-3 py-2">
        <button
          type="button"
          ref={handleRef as Ref<HTMLButtonElement>}
          className="cursor-grab touch-none text-gray-400 hover:text-gray-600"
        >
          <GripVertical className="size-4 shrink-0" />
        </button>
        <button
          type="button"
          className="flex flex-1 items-center gap-1 text-left"
          onClick={() => setExpanded((p) => !p)}
        >
          {expanded ? (
            <ChevronDown className="size-3.5 shrink-0 text-gray-400" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-gray-400" />
          )}
          <LocaleInlineEditor
            value={{ en: step.titleEn, ja: step.titleJa }}
            onChange={({ en, ja }) => onUpdate({ titleEn: en, titleJa: ja })}
            placeholder="Step title"
            displayClassName="text-sm font-medium"
          />
          {isInvalid && (
            <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-600">
              needs ≥2 options
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={!canDelete}
          title={canDelete ? "Delete step" : "Cannot delete — another option references this step"}
          className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="flex flex-col gap-4 border-t border-gray-100 px-3 py-3">
          {/* Body text */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-gray-500">Body text</span>
            <div className="flex gap-2">
              <div className="flex flex-1 flex-col gap-1">
                <span className="text-xs text-gray-400">EN</span>
                <TextareaAutosize
                  minRows={3}
                  value={step.textEn}
                  onChange={(e) => onUpdate({ textEn: e.target.value })}
                  placeholder="English body text"
                  className="w-full resize-none rounded border border-gray-200 px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <span className="text-xs text-gray-400">JA</span>
                <TextareaAutosize
                  minRows={3}
                  value={jaStep?.textJa ?? step.textJa}
                  onChange={(e) => onUpdate({ textJa: e.target.value })}
                  placeholder="Japanese body text"
                  className="w-full resize-none rounded border border-gray-200 px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
            </div>
          </div>

          {/* Options */}
          <OptionList
            options={step.options}
            allSteps={allSteps}
            currentStepId={step.id}
            otherFlowcharts={otherFlowcharts}
            onUpdate={handleUpdateOption}
            onDelete={handleDeleteOption}
            onReorder={handleReorderOptions}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// OptionList + OptionRow
// ---------------------------------------------------------------------------

/**
 * Each step owns its own drag-and-drop context so options can only be reordered
 * within their parent step. The `optionType` is prefixed with the step ID to
 * prevent cross-step drops.
 */
function OptionList({
  options,
  allSteps,
  currentStepId,
  otherFlowcharts,
  onUpdate,
  onDelete,
  onReorder,
}: {
  options: NavigationFlowchartOption[];
  allSteps: NavigationFlowchartStep[];
  currentStepId: string;
  otherFlowcharts: NavigationFlowchartSummary[];
  onUpdate: (id: string, patch: Partial<NavigationFlowchartOption>) => void;
  onDelete: (id: string) => void;
  onReorder: (newOptions: NavigationFlowchartOption[]) => void;
}) {
  const listKey = options.map((o) => o.id).join(",");
  const optionType = OPTION_TYPE_PREFIX + currentStepId;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-gray-500">Options</span>
      <DragDropProvider
        key={listKey}
        onDragEnd={(event) => {
          if (!event.operation.target) return;
          const optIds = options.map((o) => "opt-" + o.id);
          const record: Record<string, string[]> = { opts: optIds };
          const next = move(record, event);
          if (!next) return;
          const newOrder = (next.opts as string[]).map((oid) => oid.replace("opt-", ""));
          const byId = Object.fromEntries(options.map((o) => [o.id, o]));
          onReorder(newOrder.map((id) => byId[id]));
        }}
      >
        <div className="flex flex-col gap-1.5">
          {options.map((opt, idx) => (
            <OptionRow
              key={opt.id}
              option={opt}
              index={idx}
              optionType={optionType}
              allSteps={allSteps}
              currentStepId={currentStepId}
              otherFlowcharts={otherFlowcharts}
              onUpdate={(patch) => onUpdate(opt.id, patch)}
              onDelete={() => onDelete(opt.id)}
            />
          ))}
        </div>
      </DragDropProvider>
      <button
        type="button"
        onClick={() => {
          const newOpt: NavigationFlowchartOption = {
            id: crypto.randomUUID(),
            titleEn: "",
            titleJa: "",
          };
          onReorder([...options, newOpt]);
        }}
        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
      >
        <Plus className="size-3" />
        Add option
      </button>
    </div>
  );
}

type DestType = "next-step" | "child-flowchart" | "external-link" | "none";

/**
 * Derives the current destination type of an option from its config fields.
 * `link` is checked with an explicit null/undefined guard because an empty
 * string means "external link selected but URL not yet typed".
 */
function getDestType(opt: NavigationFlowchartOption): DestType {
  if (opt.nextStep) return "next-step";
  if (opt.linkedFlowchartId) return "child-flowchart";
  // link can be an empty string when the user just selected "External link"
  // but hasn't typed a URL yet — treat null/undefined as unset, string as set.
  if (opt.link !== undefined && opt.link !== null) return "external-link";
  return "none";
}

/**
 * Single editable option row with:
 * - Drag handle (dnd-kit `useSortable`, scoped to parent step via `optionType`)
 * - Inline bilingual title editor
 * - Radio buttons for destination type (next step / child flowchart / external link)
 * - Context-sensitive sub-form for the selected destination type
 *
 * Changing the destination type clears all previously set dest fields before
 * seeding a default for the new type, so `getDestType()` resolves correctly.
 */
function OptionRow({
  option,
  index,
  optionType,
  allSteps,
  currentStepId,
  otherFlowcharts,
  onUpdate,
  onDelete,
}: {
  option: NavigationFlowchartOption;
  index: number;
  optionType: string;
  allSteps: NavigationFlowchartStep[];
  currentStepId: string;
  otherFlowcharts: NavigationFlowchartSummary[];
  onUpdate: (patch: Partial<NavigationFlowchartOption>) => void;
  onDelete: () => void;
}) {
  const { ref, handleRef, isDragSource } = useSortable({
    id: "opt-" + option.id,
    index,
    type: optionType,
    accept: [optionType],
    data: { type: optionType },
  });

  const destType = getDestType(option);

  /** Clears all destination fields then seeds a sensible default for the newly selected type. */
  function handleDestChange(newType: DestType) {
    // Clear all dest fields first, then seed a placeholder for the new type
    // so that getDestType() returns the correct value immediately.
    const base: Partial<NavigationFlowchartOption> = {
      nextStep: undefined,
      linkedFlowchartId: undefined,
      link: undefined,
      linkTextEn: undefined,
      linkTextJa: undefined,
    };
    if (newType === "next-step") {
      onUpdate({ ...base, nextStep: otherSteps[0]?.id ?? "" });
    } else if (newType === "child-flowchart") {
      onUpdate({ ...base, linkedFlowchartId: otherFlowcharts[0]?.id ?? "" });
    } else if (newType === "external-link") {
      onUpdate({ ...base, link: "" });
    } else {
      onUpdate(base);
    }
  }

  const otherSteps = allSteps.filter((s) => s.id !== currentStepId);

  return (
    <div
      ref={ref as Ref<HTMLDivElement>}
      className={cn(
        "flex flex-col gap-2 rounded border border-gray-100 bg-gray-50 p-2 transition-opacity",
        isDragSource ? "opacity-40" : "",
      )}
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          ref={handleRef as Ref<HTMLButtonElement>}
          className="cursor-grab touch-none text-gray-400 hover:text-gray-500"
        >
          <GripVertical className="size-3.5" />
        </button>
        <div className="flex-1">
          <LocaleInlineEditor
            value={{ en: option.titleEn, ja: option.titleJa }}
            onChange={({ en, ja }) => onUpdate({ titleEn: en, titleJa: ja })}
            placeholder="Option label"
            displayClassName="text-xs"
          />
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
        >
          <Trash2 className="size-3" />
        </button>
      </div>

      {/* Destination selector */}
      <div className="flex flex-col gap-1.5 pl-5">
        <div className="flex items-center gap-3">
          {(["next-step", "child-flowchart", "external-link"] as const).map((t) => (
            <label key={t} className="flex cursor-pointer items-center gap-1 text-xs text-gray-600">
              <input
                type="radio"
                name={"dest-" + option.id}
                checked={destType === t}
                onChange={() => handleDestChange(t)}
                className="accent-blue-600"
              />
              {t === "next-step" ? "Next step" : t === "child-flowchart" ? "Child flowchart" : "External link"}
            </label>
          ))}
        </div>

        {destType === "next-step" && (
          <Select
            value={option.nextStep ?? ""}
            onValueChange={(v) => onUpdate({ nextStep: v, linkedFlowchartId: undefined, link: undefined, linkTextEn: undefined, linkTextJa: undefined })}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder="Select step…" />
            </SelectTrigger>
            <SelectContent>
              {otherSteps.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.titleEn || s.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {destType === "child-flowchart" && (
          <Select
            value={option.linkedFlowchartId ?? ""}
            onValueChange={(v) => onUpdate({ linkedFlowchartId: v, nextStep: undefined, link: undefined, linkTextEn: undefined, linkTextJa: undefined })}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder="Select flowchart…" />
            </SelectTrigger>
            <SelectContent>
              {otherFlowcharts.map((fc) => (
                <SelectItem key={fc.id} value={fc.id}>
                  {fc.nameEn}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {destType === "external-link" && (
          <div className="flex flex-col gap-1.5">
            <input
              type="text"
              value={option.link ?? ""}
              onChange={(e) => onUpdate({ link: e.target.value, nextStep: undefined, linkedFlowchartId: undefined })}
              placeholder="https://…"
              className="rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-400"
            />
            <LocaleInlineEditor
              value={{ en: option.linkTextEn ?? "", ja: option.linkTextJa ?? "" }}
              onChange={({ en, ja }) => onUpdate({ linkTextEn: en, linkTextJa: ja })}
              placeholder="Link label"
              displayClassName="text-xs"
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-6 shrink-0 text-xs font-medium uppercase text-gray-500">{label}</span>
      {children}
    </div>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1 text-xs text-red-600">
      <AlertCircle className="size-3 shrink-0" />
      {children}
    </div>
  );
}
