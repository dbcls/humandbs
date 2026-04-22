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
  Home,
  Plus,
  Trash2,
} from "lucide-react";

import { Card } from "@/components/Card";
import { LangSwitcherPill } from "@/components/LanguageSwitcher";
import { LocaleInlineEditor } from "@/components/LocaleInlineEditor";
import {
  Breadcrumbs,
  NavigationChartInner,
  type BreadcrumbItem,
  type FlowchartAnswers,
} from "@/components/NavigationChart";
import { TrashButton } from "@/components/TrashButton";
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
import { deepEqual } from "@/components/form-context/fields/useFieldModified";
import { ListItem } from "@/components/ListItem";
import { StatusTag } from "@/components/StatusTag";
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
  const queryClient = useQueryClient();
  const { openConfirmation } = useConfirmationStore();
  const { data: allFlowcharts = [] } = useQuery(
    getNavigationFlowchartsQueryOptions(),
  );

  const { mutateAsync: deleteFlowchart } = useMutation({
    mutationFn: (id: string) => $deleteNavigationFlowchart({ data: { id } }),
  });

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

  function handleDeleteFlowchart(id: string) {
    const fc = allFlowcharts.find((f) => f.id === id);
    openConfirmation({
      title: "Delete flowchart?",
      description: `Are you sure you want to delete "${fc?.nameEn ?? id}"? This cannot be undone.`,
      actionLabel: "Delete",
      onAction: async () => {
        const result = await deleteFlowchart(id);
        if (!result.ok) {
          if (result.code === "HAS_DEPENDENTS") {
            const list = result.deps
              .map(
                (d) =>
                  `• ${d.flowchartNameEn} → ${d.stepTitleEn} → ${d.optionTitleEn}`,
              )
              .join("\n");
            alert(
              `Cannot delete — referenced by:\n${list}\n\nRemove references first.`,
            );
          }
          return;
        }
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: ["navigation-flowcharts"],
          }),
          queryClient.invalidateQueries({ queryKey: ["navigation-flowchart"] }),
        ]);
        if (selectedId === id) handleDeleted();
      },
    });
  }

  return (
    <>
      <Card
        className="w-cms-list-panel flex h-full flex-col"
        caption="Flowcharts"
      >
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
          <FlowchartList
            selectedId={selectedId}
            onSelect={handleSelect}
            onDelete={handleDeleteFlowchart}
          />
        </div>
      </Card>

      {mode === "create" ? (
        <CreateFlowchartPanel key="create" onCreated={handleCreated} />
      ) : mode === "edit" && selectedId ? (
        <EditFlowchartPanel key={selectedId} id={selectedId} />
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
  onDelete,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { data: flowcharts = [] } = useQuery(
    getNavigationFlowchartsQueryOptions(),
  );

  if (flowcharts.length === 0) {
    return <p className="px-1 text-sm text-gray-400">No flowcharts yet.</p>;
  }

  // Build grouped list: each entry point followed by its direct children.
  // Flowcharts not reachable from any entry point appear at the end.
  const entryPoints = flowcharts.filter((fc) => fc.isEntryPoint);
  const byId = Object.fromEntries(flowcharts.map((fc) => [fc.id, fc]));
  const referencedIds = new Set(
    entryPoints.flatMap((ep) => ep.linkedFlowchartIds),
  );
  const orphans = flowcharts.filter(
    (fc) => !fc.isEntryPoint && !referencedIds.has(fc.id),
  );

  return (
    <ul className="flex flex-col gap-0.5">
      {entryPoints.map((ep) => (
        <li key={ep.id} className="flex flex-col gap-0.5">
          <ListItem
            isActive={selectedId === ep.id}
            onClick={() => onSelect(ep.id)}
          >
            <Home className="size-3.5 shrink-0 text-blue-400 group-data-[active=true]:text-white/70" />
            <FlowchartListItemContent fc={ep} />
            <TrashButton
              onClick={(e) => {
                e.stopPropagation();
                onDelete(ep.id);
              }}
            />
          </ListItem>
          {ep.linkedFlowchartIds.length > 0 && (
            <ul className="ml-3 flex flex-col gap-0.5 border-l-2 border-gray-200 pl-2">
              {ep.linkedFlowchartIds.map((childId) => {
                const child = byId[childId];
                if (!child) return null;
                return (
                  <ListItem
                    key={child.id}
                    isActive={selectedId === child.id}
                    onClick={() => onSelect(child.id)}
                  >
                    <FlowchartListItemContent fc={child} />
                    <TrashButton
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(child.id);
                      }}
                    />
                  </ListItem>
                );
              })}
            </ul>
          )}
        </li>
      ))}
      {orphans.map((fc) => (
        <ListItem
          key={fc.id}
          isActive={selectedId === fc.id}
          onClick={() => onSelect(fc.id)}
        >
          <FlowchartListItemContent fc={fc} subtitle="unlinked" />
          <TrashButton
            onClick={(e) => {
              e.stopPropagation();
              onDelete(fc.id);
            }}
          />
        </ListItem>
      ))}
    </ul>
  );
}

function FlowchartListItemContent({
  fc,
  subtitle,
}: {
  fc: NavigationFlowchartSummary;
  subtitle?: string;
}) {
  return (
    <div className="min-w-0 flex-1">
      {subtitle && (
        <div className="text-foreground-light group-data-[active=true]:text-white/80 mb-1 truncate text-xs">
          {subtitle}
        </div>
      )}
      <ul className="space-y-0.5">
        <li className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm">{fc.nameEn}</span>
          <StatusTag status={fc.status} />
        </li>
        <li className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm text-gray-500 group-data-[active=true]:text-white/70">
            {fc.nameJa}
          </span>
        </li>
      </ul>
    </div>
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
function CreateFlowchartPanel({
  onCreated,
}: {
  onCreated: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [nameEn, setNameEn] = useState("");
  const [nameJa, setNameJa] = useState("");
  const [errors, setErrors] = useState<{ nameEn?: string; nameJa?: string }>(
    {},
  );
  const [serverError, setServerError] = useState<string | null>(null);

  const { mutateAsync: create, isPending } = useMutation({
    mutationFn: () =>
      $createNavigationFlowchart({
        data: {
          nameEn: nameEn.trim(),
          nameJa: nameJa.trim(),
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
      await queryClient.invalidateQueries({
        queryKey: ["navigation-flowcharts"],
      });
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
                if (errors.nameEn)
                  setErrors((p) => ({ ...p, nameEn: undefined }));
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
                if (errors.nameJa)
                  setErrors((p) => ({ ...p, nameJa: undefined }));
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

        <div className="flex gap-2">
          <Button type="button" onClick={handleSave} disabled={isPending}>
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
function EditFlowchartPanel({ id }: { id: string }) {
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
        <div className="p-5 text-sm text-red-600">
          Failed to load flowchart.
        </div>
      </Card>
    );
  }

  return <FlowchartEditor record={record} />;
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
  isEntryPoint: boolean;
  status: (typeof NAVIGATION_FLOWCHART_STATUS)[keyof typeof NAVIGATION_FLOWCHART_STATUS];
}

/**
 * Main editor for a single flowchart record. Manages local drafts for both the
 * metadata (name, isEntryPoint, status) and the bilingual step config. Uses
 * optimistic locking (`revision`) to detect concurrent edits.
 *
 * Save flow:
 * 1. Validates EN/JA name are non-empty.
 * 2. Validates that every step has at least 2 options.
 * 3. If isEntryPoint is being enabled, warns that any existing entry point will
 *    be demoted (the server enforces only one entry point at a time).
 * 4. Sends the full config + expectedRevision to the server; handles CONFLICT.
 *
 * Delete flow: checks for dependent flowcharts (options in other flowcharts
 * that link to this one) and surfaces them before allowing deletion.
 */
function FlowchartEditor({ record }: { record: NavigationFlowchartRecord }) {
  const queryClient = useQueryClient();
  const { openConfirmation } = useConfirmationStore();
  const { data: allFlowcharts = [] } = useQuery(
    getNavigationFlowchartsQueryOptions(),
  );

  const [meta, setMeta] = useState<FlowchartMeta>({
    nameEn: record.nameEn,
    nameJa: record.nameJa,
    isEntryPoint: record.isEntryPoint,
    status: record.status,
  });
  const [configDraft, setConfigDraft] = useState<NavigationFlowchartConfig>(
    record.config,
  );
  const [revision, setRevision] = useState(record.revision);
  const [metaErrors, setMetaErrors] = useState<Partial<FlowchartMeta>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [previewLang, setPreviewLang] = useState<"en" | "ja">("ja");

  // Tracks the last-saved values so isDirty can compare against them.
  const savedMetaRef = useRef<FlowchartMeta>({
    nameEn: record.nameEn,
    nameJa: record.nameJa,
    isEntryPoint: record.isEntryPoint,
    status: record.status,
  });
  const savedConfigRef = useRef<NavigationFlowchartConfig>(record.config);

  const { mutateAsync: saveFlowchart, isPending: isSaving } = useMutation({
    mutationFn: (payload: {
      meta: FlowchartMeta;
      config: NavigationFlowchartConfig;
    }) =>
      $saveNavigationFlowchartConfig({
        data: {
          id: record.id,
          nameEn: payload.meta.nameEn,
          nameJa: payload.meta.nameJa,
          isEntryPoint: payload.meta.isEntryPoint,
          status: payload.meta.status,
          config: payload.config,
          expectedRevision: revision,
        },
      }),
  });

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

    const invalidStepIds = validateSteps(configDraft);
    if (invalidStepIds.length > 0) {
      setError(
        "Each step must have at least 2 options. Check highlighted steps.",
      );
      return;
    }

    const result = await saveFlowchart({
      meta: currentMeta,
      config: configDraft,
    });
    if (!result.ok) {
      setError(
        result.code === "CONFLICT"
          ? "This flowchart was modified by someone else. Reload to get the latest version."
          : "Failed to save.",
      );
      return;
    }

    setRevision(result.data.revision);
    savedMetaRef.current = currentMeta;
    savedConfigRef.current = configDraft;
    setMessage("Saved.");
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["navigation-flowcharts"] }),
      queryClient.invalidateQueries({ queryKey: ["navigation-flowchart"] }),
    ]);
  }

  async function handleSave() {
    const isPromotingToEntryPoint = meta.isEntryPoint && !record.isEntryPoint;
    const existingEntryPoint = allFlowcharts.find(
      (fc) => fc.isEntryPoint && fc.id !== record.id,
    );

    if (isPromotingToEntryPoint && existingEntryPoint) {
      openConfirmation({
        title: "Change entry point?",
        description: `"${existingEntryPoint.nameEn}" is currently the entry point. Setting this flowchart as entry point will demote it. Continue?`,
        actionLabel: "Set as entry point",
        onAction: () => commitSave(meta),
      });
    } else {
      await commitSave(meta);
    }
  }

  function handleReset() {
    setMeta(savedMetaRef.current);
    setConfigDraft(savedConfigRef.current);
    setMetaErrors({});
    setMessage(null);
    setError(null);
  }

  const invalidStepIds = validateSteps(configDraft);
  const otherFlowcharts = allFlowcharts.filter((fc) => fc.id !== record.id);

  const isDirty =
    !deepEqual(meta, savedMetaRef.current) ||
    !deepEqual(configDraft, savedConfigRef.current);

  return (
    <Card
      className="flex h-full flex-1 flex-col overflow-hidden"
      caption={
        <>
          {record.nameEn}
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm font-normal text-gray-500">
            Preview
            <Switch
              checked={preview}
              onCheckedChange={setPreview}
              className="data-[state=checked]:bg-secondary"
            />
          </label>
        </>
      }
      captionClassName="flex items-center"
      containerClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      {preview ? (
        <FlowchartPreview
          record={record}
          configDraft={configDraft}
          allFlowcharts={allFlowcharts}
          lang={previewLang}
          onLangChange={setPreviewLang}
        />
      ) : (
        <>
          {/* Sticky action bar */}
          <div className="flex items-center justify-between px-5 pt-5">
            <div className="flex items-center gap-3">
              <Switch
                checked={meta.status === NAVIGATION_FLOWCHART_STATUS.PUBLISHED}
                onCheckedChange={(checked) =>
                  setMeta((p) => ({
                    ...p,
                    status: checked
                      ? NAVIGATION_FLOWCHART_STATUS.PUBLISHED
                      : NAVIGATION_FLOWCHART_STATUS.DRAFT,
                  }))
                }
              />
              <span className="text-xs text-gray-500">
                {meta.status === NAVIGATION_FLOWCHART_STATUS.PUBLISHED
                  ? "Published"
                  : "Draft"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleReset}
                disabled={!isDirty || isSaving}
              >
                Reset
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={!isDirty || isSaving}
              >
                {isSaving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>

          {message && (
            <div className="mx-5 mt-4 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              {message}
            </div>
          )}
          {error && (
            <div className="mx-5 mt-4 whitespace-pre-wrap rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Scrollable content */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-6 px-5 pt-5 pb-5">
              {/* Flowchart name */}
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium text-gray-700">Name</h3>
                <LocaleInlineEditor
                  value={{ en: meta.nameEn, ja: meta.nameJa }}
                  onChange={({ en, ja }) => {
                    setMeta((p) => ({ ...p, nameEn: en, nameJa: ja }));
                    setMetaErrors((p) => ({
                      ...p,
                      nameEn: undefined,
                      nameJa: undefined,
                    }));
                  }}
                  displayClassName="text-sm font-medium"
                  required
                />
                {metaErrors.nameEn && (
                  <FieldError>{metaErrors.nameEn}</FieldError>
                )}
                {metaErrors.nameJa && (
                  <FieldError>{metaErrors.nameJa}</FieldError>
                )}
              </div>

              {/* Entry point */}
              <div className="flex items-center gap-3">
                <Switch
                  checked={meta.isEntryPoint}
                  onCheckedChange={(checked) =>
                    setMeta((p) => ({ ...p, isEntryPoint: checked }))
                  }
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">
                    Entry point
                  </span>
                  <p className="text-xs text-gray-400">
                    The entry point flowchart is loaded on the public navigation
                    page. Only one flowchart can be the entry point.
                  </p>
                </div>
              </div>

              {/* Steps */}
              <StepList
                config={configDraft}
                onChange={setConfigDraft}
                invalidStepIds={invalidStepIds}
                otherFlowcharts={otherFlowcharts}
              />
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// FlowchartPreview — interactive preview with child flowchart navigation
// ---------------------------------------------------------------------------

/**
 * Self-contained preview panel for a flowchart editor.
 *
 * - The root flowchart uses `configDraft` so unsaved changes are reflected.
 * - Child flowcharts are fetched from the DB via the admin query.
 * - Maintains a navigation stack so breadcrumbs work just like the public page.
 * - `linkedFlowchartNames` is resolved from `allFlowcharts` for the current level.
 */
function FlowchartPreview({
  record,
  configDraft,
  allFlowcharts,
  lang,
  onLangChange,
}: {
  record: NavigationFlowchartRecord;
  configDraft: NavigationFlowchartConfig;
  allFlowcharts: NavigationFlowchartSummary[];
  lang: "en" | "ja";
  onLangChange: (l: "en" | "ja") => void;
}) {
  // Stack of IDs navigated into: empty = showing root, ["childId"] = showing child, etc.
  const [childStack, setChildStack] = useState<string[]>([]);
  const [answers, setAnswers] = useState<FlowchartAnswers>({});

  const currentId =
    childStack.length > 0 ? childStack[childStack.length - 1] : null;

  // Fetch current child if we've navigated into one
  const { data: childRecord } = useQuery({
    ...getNavigationFlowchartByIdQueryOptions(currentId ?? ""),
    enabled: !!currentId,
  });

  // Build the data for the current level
  const currentConfig = currentId ? childRecord?.config : configDraft;
  const currentFlowchartId = currentId ?? record.id;
  const currentSlug = currentFlowchartId;
  const currentData = currentConfig
    ? lang === "ja"
      ? currentConfig.ja
      : currentConfig.en
    : null;

  // linkedFlowchartNames for the current level
  const linkedFlowchartNames: Record<string, string> = {};
  for (const fc of allFlowcharts) {
    linkedFlowchartNames[fc.id] = lang === "ja" ? fc.nameJa : fc.nameEn;
  }
  // Also include the current record itself in case it's referenced
  linkedFlowchartNames[record.id] =
    lang === "ja" ? record.nameJa : record.nameEn;

  // Build breadcrumb items. Index 0 is always the root record.
  const breadcrumbItems: BreadcrumbItem[] = [
    {
      slug: record.id,
      nameEn: record.nameEn,
      nameJa: record.nameJa,
      onClick:
        childStack.length > 0
          ? () => {
              setChildStack([]);
            }
          : undefined,
    },
    ...childStack.map((childId, i) => {
      const fc = allFlowcharts.find((f) => f.id === childId);
      return {
        slug: childId,
        nameEn: fc?.nameEn ?? childId,
        nameJa: fc?.nameJa ?? childId,
        onClick:
          i < childStack.length - 1
            ? () => setChildStack((prev) => prev.slice(0, i + 1))
            : undefined,
      };
    }),
  ];

  function handleAnswerChange(
    slug: string,
    stepId: string,
    optionId: string,
    clearStepIds?: string[],
  ) {
    setAnswers((prev) => {
      const prevSlug = prev[slug] ?? {};
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(prevSlug)) {
        if (!clearStepIds?.includes(k)) next[k] = v;
      }
      next[stepId] = optionId;
      return { ...prev, [slug]: next };
    });
  }

  function handleNavigateToChild(childId: string) {
    setChildStack((prev) => [...prev, childId]);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 px-5 pt-4 pb-2">
        <LangSwitcherPill value={lang} onChange={onLangChange} />
      </div>
      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto">
        <div className="min-w-max px-5 pb-5">
          <Breadcrumbs items={breadcrumbItems} locale={lang} />
          {currentData ? (
            <NavigationChartInner
              flowchartId={currentFlowchartId}
              slug={currentSlug}
              data={currentData}
              locale={lang}
              answers={answers}
              linkedFlowchartNames={linkedFlowchartNames}
              onAnswerChange={handleAnswerChange}
              onNavigateToChild={handleNavigateToChild}
            />
          ) : (
            <div className="py-8 text-center text-sm text-gray-400">
              Loading…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StepList — dnd-kit sortable step cards
// ---------------------------------------------------------------------------

const STEP_TYPE = "flowchart-step";

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

  function handleUpdateStep(
    id: string,
    patch: Partial<NavigationFlowchartStep>,
  ) {
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
          const newOrder = (next.steps as string[]).map((sid) =>
            sid.replace("step-", ""),
          );
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

  function handleUpdateOption(
    optId: string,
    patch: Partial<NavigationFlowchartOption>,
  ) {
    onUpdate({
      options: step.options.map((o) =>
        o.id === optId ? { ...o, ...patch } : o,
      ),
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
          className="cursor-pointer text-gray-400 hover:text-gray-600"
          onClick={() => setExpanded((p) => !p)}
        >
          {expanded ? (
            <ChevronDown className="size-3.5 shrink-0" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0" />
          )}
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <LocaleInlineEditor
            value={{ en: step.titleEn, ja: step.titleJa }}
            onChange={({ en, ja }) => onUpdate({ titleEn: en, titleJa: ja })}
            placeholder="Step title"
            displayClassName="text-sm font-medium"
            displayLocale="ja"
          />
          {isInvalid && (
            <span className="ml-1 shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-600">
              needs ≥2 options
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onDelete}
          disabled={!canDelete}
          title={
            canDelete
              ? "Delete step"
              : "Cannot delete — another option references this step"
          }
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

const OPTION_TYPE_PREFIX = "flowchart-option-";

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
      <div className="overflow-x-auto pb-1">
        <DragDropProvider
          key={listKey}
          onDragEnd={(event) => {
            if (!event.operation.target) return;
            const optIds = options.map((o) => "opt-" + o.id);
            const record: Record<string, string[]> = { opts: optIds };
            const next = move(record, event);
            if (!next) return;
            const newOrder = (next.opts as string[]).map((oid) =>
              oid.replace("opt-", ""),
            );
            const byId = Object.fromEntries(options.map((o) => [o.id, o]));
            onReorder(newOrder.map((id) => byId[id]));
          }}
        >
          <div className="flex flex-row gap-2">
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
            <Button
              type="button"
              variant="dashed"
              className="self-start w-fit"
              onClick={() => {
                const newOpt: NavigationFlowchartOption = {
                  id: crypto.randomUUID(),
                  titleEn: "",
                  titleJa: "",
                };
                onReorder([...options, newOpt]);
              }}
            >
              <Plus className="size-3" />
              Add option
            </Button>
          </div>
        </DragDropProvider>
      </div>
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
        "flex w-64 shrink-0 flex-col gap-2 rounded border border-gray-100 bg-gray-50 p-2 transition-opacity",
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
        <div className="min-w-0 flex-1">
          <LocaleInlineEditor
            value={{ en: option.titleEn, ja: option.titleJa }}
            onChange={({ en, ja }) => onUpdate({ titleEn: en, titleJa: ja })}
            placeholder="Option label"
            displayClassName="text-xs"
            displayLocale="ja"
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
      <div className="flex flex-col gap-1.5">
        <Select
          value={destType}
          onValueChange={(v) => handleDestChange(v as DestType)}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder="Destination…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="next-step">Next step</SelectItem>
            <SelectItem value="child-flowchart">Child flowchart</SelectItem>
            <SelectItem value="external-link">External link</SelectItem>
            <SelectItem value="none">None</SelectItem>
          </SelectContent>
        </Select>

        {destType === "next-step" && (
          <Select
            value={option.nextStep ?? ""}
            onValueChange={(v) =>
              onUpdate({
                nextStep: v,
                linkedFlowchartId: undefined,
                link: undefined,
                linkTextEn: undefined,
                linkTextJa: undefined,
              })
            }
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
            onValueChange={(v) =>
              onUpdate({
                linkedFlowchartId: v,
                nextStep: undefined,
                link: undefined,
                linkTextEn: undefined,
                linkTextJa: undefined,
              })
            }
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
              onChange={(e) =>
                onUpdate({
                  link: e.target.value,
                  nextStep: undefined,
                  linkedFlowchartId: undefined,
                })
              }
              placeholder="https://…"
              className="rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-400"
            />
            <LocaleInlineEditor
              value={{
                en: option.linkTextEn ?? "",
                ja: option.linkTextJa ?? "",
              }}
              onChange={({ en, ja }) =>
                onUpdate({ linkTextEn: en, linkTextJa: ja })
              }
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

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-6 shrink-0 text-xs font-medium uppercase text-gray-500">
        {label}
      </span>
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
