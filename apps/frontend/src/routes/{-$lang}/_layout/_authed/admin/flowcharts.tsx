import { move } from "@dnd-kit/helpers";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { evaluate } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
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
import { useLocale } from "use-intl";

import type { Ref } from "react";
import { useRef, useState } from "react";

import { Card } from "@/components/Card";
import { CollapsibleCard } from "@/components/CollapsibleCard";
import { deepEqual } from "@/components/form-context/fields/useFieldModified";
import { LangSwitcherPill } from "@/components/LanguageSwitcher";
import { ListItem } from "@/components/ListItem";
import { LocaleInlineEditor } from "@/components/LocaleInlineEditor";
import type { BreadcrumbItem, FlowchartAnswers } from "@/components/NavigationChart";
import { Breadcrumbs, NavigationChartInner } from "@/components/NavigationChart";
import { StatusTag } from "@/components/StatusTag";
import { TrashButton } from "@/components/TrashButton";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { TextareaAutosize } from "@/components/ui/textarea";
import type {
    NavigationFlowchartConfig,
    NavigationFlowchartOption,
    NavigationFlowchartStep,
} from "@/config/navigation-flowchart";
import { NAVIGATION_FLOWCHART_STATUS } from "@/db/schema";
import { cn } from "@/lib/utils";
import type {
    NavigationFlowchartRecord,
    NavigationFlowchartSummary,
} from "@/repositories/navigationFlowchart";
import {
    $createNavigationFlowchart,
    $deleteNavigationFlowchart,
    $saveNavigationFlowchartConfig,
    getNavigationFlowchartByIdQueryOptions,
    getNavigationFlowchartsQueryOptions,
} from "@/serverFunctions/navigationFlowchartAdmin";
import useConfirmationStore from "@/stores/confirmationStore";

import { AdminStatusMessage } from "./-components/AdminStatusMessage";
import { NoItemsMessage } from "./-components/NoItemsMessage";
import { NoSelectedItemMessage } from "./-components/NoSelectedItemMessage";

export const Route = createFileRoute("/{-$lang}/_layout/_authed/admin/flowcharts")({
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
  const { data: allFlowcharts = [] } = useQuery(getNavigationFlowchartsQueryOptions());

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
              .map((d) => `• ${d.flowchartNameEn} → ${d.stepTitleEn} → ${d.optionTitleEn}`)
              .join("\n");
            alert(`Cannot delete — referenced by:\n${list}\n\nRemove references first.`);
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
      <CollapsibleCard title="Flowcharts">
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
      </CollapsibleCard>

      {mode === "create" ? (
        <CreateFlowchartPanel key="create" onCreated={handleCreated} />
      ) : mode === "edit" && selectedId ? (
        <EditFlowchartPanel key={selectedId} id={selectedId} />
      ) : (
        <NoSelectedItemMessage icon={<GitBranch />} />
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
  const { data: flowcharts = [] } = useQuery(getNavigationFlowchartsQueryOptions());

  if (flowcharts.length === 0) {
    return <p className="px-1 text-gray-400 text-sm">No flowcharts yet.</p>;
  }

  // Build grouped list: each entry point followed by directly linked flowcharts.
  // Flowcharts not reachable from any entry point appear at the end.
  const entryPoints = flowcharts.filter((fc) => fc.isEntryPoint);
  const byId = Object.fromEntries(flowcharts.map((fc) => [fc.id, fc]));
  const referencedIds = new Set(entryPoints.flatMap((ep) => ep.linkedFlowchartIds));
  const orphans = flowcharts.filter((fc) => !fc.isEntryPoint && !referencedIds.has(fc.id));

  if (entryPoints.length === 0) {
    return (
      <NoItemsMessage>
        No entry point flowchart found. Create a flowchart and set it as the entry point to get
        started.
      </NoItemsMessage>
    );
  }

  return (
    <ul className="flex flex-col gap-0.5">
      {entryPoints.map((ep) => (
        <li key={ep.id} className="flex flex-col gap-0.5">
          <ListItem isActive={selectedId === ep.id} onClick={() => onSelect(ep.id)}>
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
            <ul className="ml-3 flex flex-col gap-0.5 border-gray-200 border-l-2 pl-2">
              {ep.linkedFlowchartIds.map((linkedId) => {
                const linked = byId[linkedId];
                if (!linked) return null;
                return (
                  <ListItem
                    key={linked.id}
                    isActive={selectedId === linked.id}
                    onClick={() => onSelect(linked.id)}
                  >
                    <FlowchartListItemContent fc={linked} />
                    <TrashButton
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(linked.id);
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
        <ListItem key={fc.id} isActive={selectedId === fc.id} onClick={() => onSelect(fc.id)}>
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
        <div className="mb-1 truncate text-foreground-light text-xs group-data-[active=true]:text-white/80">
          {subtitle}
        </div>
      )}
      <ul className="space-y-0.5">
        <li className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm">{fc.nameEn}</span>
          <StatusTag status={fc.status} />
        </li>
        <li className="flex min-w-0 items-center gap-2">
          <span className="truncate text-gray-500 text-sm group-data-[active=true]:text-white/70">
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
 * optional slug. Leaving the slug blank creates a flowchart that can only be
 * reached via a linked option in another flowchart.
 */
function CreateFlowchartPanel({ onCreated }: { onCreated: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [nameEn, setNameEn] = useState("");
  const [nameJa, setNameJa] = useState("");
  const [errors, setErrors] = useState<{ nameEn?: string; nameJa?: string }>({});
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
        {serverError && <AdminStatusMessage>{serverError}</AdminStatusMessage>}

        <div className="flex flex-col gap-3">
          <h3 className="font-medium text-gray-700 text-sm">Name</h3>
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
  const { data: record, isPending, isError } = useQuery(getNavigationFlowchartByIdQueryOptions(id));

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
        <div className="p-5 text-red-600 text-sm">Failed to load flowchart.</div>
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
  const { data: allFlowcharts = [] } = useQuery(getNavigationFlowchartsQueryOptions());

  const [meta, setMeta] = useState<FlowchartMeta>({
    nameEn: record.nameEn,
    nameJa: record.nameJa,
    isEntryPoint: record.isEntryPoint,
    status: record.status,
  });
  const [configDraft, setConfigDraft] = useState<NavigationFlowchartConfig>(record.config);
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
    mutationFn: (payload: { meta: FlowchartMeta; config: NavigationFlowchartConfig }) =>
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

  function isValidUrl(url: string) {
    try {
      return !!new URL(url);
    } catch {
      return false;
    }
  }

  /** Returns a map of stepId → error reason for all invalid steps. */
  function validateSteps(config: NavigationFlowchartConfig) {
    const result: Record<string, "too-few-options" | "invalid-url"> = {};
    for (const s of config.steps) {
      if (s.options.length < 2) {
        result[s.id] = "too-few-options";
      } else if (
        s.options.some(
          (o) => (o.link && !isValidUrl(o.link)) || (o.linkEn && !isValidUrl(o.linkEn)),
        )
      ) {
        result[s.id] = "invalid-url";
      }
    }
    return result;
  }

  async function commitSave(currentMeta: FlowchartMeta) {
    setMessage(null);
    setError(null);

    const errs: Partial<FlowchartMeta> = {};
    if (!currentMeta.nameEn.trim()) errs.nameEn = "English name is required.";
    if (!currentMeta.nameJa.trim()) errs.nameJa = "Japanese name is required.";
    setMetaErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const stepErrors = validateSteps(configDraft);
    if (Object.keys(stepErrors).length > 0) {
      setError(
        "Some steps have errors (too few options or invalid URLs). Check highlighted steps.",
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
    const existingEntryPoint = allFlowcharts.find((fc) => fc.isEntryPoint && fc.id !== record.id);

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

  const stepErrors = validateSteps(configDraft);
  const invalidStepIds = Object.keys(stepErrors);
  const otherFlowcharts = allFlowcharts.filter((fc) => fc.id !== record.id);

  const isDirty =
    !deepEqual(meta, savedMetaRef.current) || !evaluate(configDraft, savedConfigRef.current);

  const lang = useLocale();
  return (
    <Card
      className="flex h-full flex-1 flex-col overflow-hidden"
      caption={
        <>
          {record.nameEn}
          <label className="ml-auto flex cursor-pointer items-center gap-2 font-normal text-gray-500 text-sm">
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
              <span className="text-gray-500 text-xs">
                {meta.status === NAVIGATION_FLOWCHART_STATUS.PUBLISHED ? "Published" : "Draft"}
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
              <Button type="button" onClick={handleSave} disabled={!isDirty || isSaving}>
                {isSaving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>

          {message ? (
            <AdminStatusMessage variant="success" className="mx-5 mt-4">
              {message}
            </AdminStatusMessage>
          ) : null}
          {error ? (
            <AdminStatusMessage className="mx-5 mt-4" preserveWhitespace>
              {error}
            </AdminStatusMessage>
          ) : null}

          {/* Scrollable content */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-6 px-5 pt-5 pb-5">
              {/* Flowchart name */}
              <div className="flex flex-col gap-2">
                <h3 className="font-medium text-gray-700 text-sm">Name</h3>
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
                  className="font-medium text-sm"
                  required
                />
                {metaErrors.nameEn && <FieldError>{metaErrors.nameEn}</FieldError>}
                {metaErrors.nameJa && <FieldError>{metaErrors.nameJa}</FieldError>}
              </div>

              {/* Entry point */}
              <div className="flex items-center gap-3">
                <Switch
                  checked={meta.isEntryPoint}
                  onCheckedChange={(checked) => setMeta((p) => ({ ...p, isEntryPoint: checked }))}
                />
                <div>
                  <span className="font-medium text-gray-700 text-sm">Entry point</span>
                  <p className="text-gray-400 text-xs">
                    The entry point flowchart is loaded on the public navigation page. Only one
                    flowchart can be the entry point.
                  </p>
                </div>
              </div>

              {/* Steps */}
              <StepList
                config={configDraft}
                onChange={setConfigDraft}
                stepErrors={stepErrors}
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
// FlowchartPreview — interactive preview with linked flowchart navigation
// ---------------------------------------------------------------------------

/**
 * Self-contained preview panel for a flowchart editor.
 *
 * - The root flowchart uses `configDraft` so unsaved changes are reflected.
 * - Linked flowcharts are fetched from the DB via the admin query.
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
  // Stack of linked flowchart IDs navigated into; empty means showing root.
  const [linkedStack, setLinkedStack] = useState<string[]>([]);
  const [answers, setAnswers] = useState<FlowchartAnswers>({});

  const currentId = linkedStack.length > 0 ? linkedStack[linkedStack.length - 1] : null;

  // Fetch current linked flowchart if we've navigated into one
  const { data: linkedRecord } = useQuery({
    ...getNavigationFlowchartByIdQueryOptions(currentId ?? ""),
    enabled: !!currentId,
  });

  // Build the data for the current level
  const currentConfig = currentId ? linkedRecord?.config : configDraft;
  const currentFlowchartId = currentId ?? record.id;
  const currentSlug = currentFlowchartId;
  const currentData = currentConfig ?? null;

  // linkedFlowchartNames for the current level
  const linkedFlowchartNames: Record<string, string> = {};
  for (const fc of allFlowcharts) {
    linkedFlowchartNames[fc.id] = lang === "ja" ? fc.nameJa : fc.nameEn;
  }
  // Also include the current record itself in case it's referenced
  linkedFlowchartNames[record.id] = lang === "ja" ? record.nameJa : record.nameEn;

  // Build breadcrumb items. Index 0 is always the root record.
  const breadcrumbItems: BreadcrumbItem[] = [
    {
      slug: record.id,
      nameEn: record.nameEn,
      nameJa: record.nameJa,
      onClick:
        linkedStack.length > 0
          ? () => {
              setLinkedStack([]);
            }
          : undefined,
    },
    ...linkedStack.map((linkedId, i) => {
      const fc = allFlowcharts.find((f) => f.id === linkedId);
      return {
        slug: linkedId,
        nameEn: fc?.nameEn ?? linkedId,
        nameJa: fc?.nameJa ?? linkedId,
        onClick:
          i < linkedStack.length - 1
            ? () => setLinkedStack((prev) => prev.slice(0, i + 1))
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

  function handleNavigateToFlowchart(flowchartId: string) {
    setLinkedStack((prev) => [...prev, flowchartId]);
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
              onNavigateToFlowchart={handleNavigateToFlowchart}
            />
          ) : (
            <div className="py-8 text-center text-gray-400 text-sm">Loading…</div>
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
 * Steps are stored as one canonical graph with localized labels on each node.
 */
function StepList({
  config,
  onChange,
  stepErrors,
  otherFlowcharts,
}: {
  config: NavigationFlowchartConfig;
  onChange: (c: NavigationFlowchartConfig) => void;
  stepErrors: Record<string, "too-few-options" | "invalid-url">;
  otherFlowcharts: NavigationFlowchartSummary[];
}) {
  const steps = config.steps;

  function updateSteps(newSteps: NavigationFlowchartStep[]) {
    onChange({ steps: newSteps });
  }

  function handleAddStep() {
    const newStep: NavigationFlowchartStep = {
      id: crypto.randomUUID(),
      title: { en: "", ja: "" },
      text: { en: "", ja: "" },
      options: [],
    };
    updateSteps([...steps, newStep]);
  }

  function handleDeleteStep(id: string) {
    updateSteps(steps.filter((s) => s.id !== id));
  }

  function handleUpdateStep(id: string, patch: Partial<NavigationFlowchartStep>) {
    updateSteps(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  /** A step cannot be deleted while any option in this flowchart points to it as a nextStep target. */
  function canDeleteStep(stepId: string) {
    return !steps.some((s) => s.options.some((o) => o.nextStep === stepId));
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-medium text-gray-700 text-sm">Steps</h3>
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
              invalidReason={stepErrors[step.id]}
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
  invalidReason,
  canDelete,
  allSteps,
  otherFlowcharts,
  onUpdate,
  onDelete,
}: {
  step: NavigationFlowchartStep;
  index: number;
  invalidReason?: "too-few-options" | "invalid-url";
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
      title: { en: "", ja: "" },
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

  const lang = useLocale();

  return (
    <div
      ref={ref as Ref<HTMLDivElement>}
      className={cn(
        "rounded-md border bg-white shadow-sm transition-opacity",
        isDragSource ? "opacity-40" : "",
        invalidReason ? "border-red-300" : "border-gray-200",
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
            value={step.title}
            onChange={(title) => onUpdate({ title })}
            placeholder="Step title"
            className="font-medium text-sm"
          />
          {invalidReason && (
            <span className="ml-1 shrink-0 rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-600 text-xs">
              {invalidReason === "invalid-url" ? "invalid URL" : "needs ≥2 options"}
            </span>
          )}
        </div>
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
        <div className="flex flex-col gap-4 border-gray-100 border-t px-3 py-3">
          {/* Body text */}
          <div className="flex flex-col gap-1.5">
            <span className="font-medium text-gray-500 text-xs">Body text</span>
            <div className="flex gap-2">
              <div className="flex flex-1 flex-col gap-1">
                <span className="text-gray-400 text-xs">EN</span>
                <TextareaAutosize
                  minRows={3}
                  value={step.text.en}
                  onChange={(e) => onUpdate({ text: { ...step.text, en: e.target.value } })}
                  placeholder="English body text"
                  className="w-full resize-none rounded border border-gray-200 px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <span className="text-gray-400 text-xs">JA</span>
                <TextareaAutosize
                  minRows={3}
                  value={step.text.ja}
                  onChange={(e) => onUpdate({ text: { ...step.text, ja: e.target.value } })}
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
      <span className="font-medium text-gray-500 text-xs">Options</span>
      <div className="overflow-x-auto pb-1">
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
              className="w-fit self-start"
              onClick={() => {
                const newOpt: NavigationFlowchartOption = {
                  id: crypto.randomUUID(),
                  title: { en: "", ja: "" },
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

type DestType = "next-step" | "linked-flowchart" | "external-link" | "none";

/**
 * Derives the current destination type of an option from its config fields.
 * `link` is checked with an explicit null/undefined guard because an empty
 * string means "external link selected but URL not yet typed".
 */
function getDestType(opt: NavigationFlowchartOption): DestType {
  if (opt.nextStep) return "next-step";
  if (opt.linkedFlowchartId) return "linked-flowchart";
  // link can be an empty string when the user just selected "External link"
  // but hasn't typed a URL yet — treat null/undefined as unset, string as set.
  if (opt.link !== undefined && opt.link !== null) return "external-link";
  return "none";
}

/**
 * Single editable option row with:
 * - Drag handle (dnd-kit `useSortable`, scoped to parent step via `optionType`)
 * - Inline bilingual title editor
 * - Radio buttons for destination type (next step / linked flowchart / external link)
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
      linkText: undefined,
    };
    if (newType === "next-step") {
      onUpdate({ ...base, nextStep: otherSteps[0]?.id ?? "" });
    } else if (newType === "linked-flowchart") {
      onUpdate({ ...base, linkedFlowchartId: otherFlowcharts[0]?.id ?? "" });
    } else if (newType === "external-link") {
      onUpdate({ ...base, link: "" });
    } else {
      onUpdate(base);
    }
  }

  const otherSteps = allSteps.filter((s) => s.id !== currentStepId);

  const lang = useLocale();

  return (
    <div
      ref={ref as Ref<HTMLDivElement>}
      className={cn(
        "flex w-96 shrink-0 flex-col gap-4 rounded border border-gray-100 bg-gray-50 p-4 transition-opacity",
        { "opacity-40": isDragSource },
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

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <LocaleInlineEditor
            value={option.title}
            onChange={(title) => onUpdate({ title })}
            placeholder="Option label"
            className="min-w-0 flex-1 text-xs"
          />
          <LocaleInlineEditor
            value={option.description ?? { en: "", ja: "" }}
            onChange={(description) => onUpdate({ description })}
            placeholder="Sub-label (optional)"
            className="min-w-0 flex-1 text-gray-400 text-xs"
          />
        </div>

        <button
          type="button"
          onClick={onDelete}
          className="shrink-0 place-self-start rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
        >
          <Trash2 className="size-3" />
        </button>
      </div>

      {/* Destination selector */}
      <div className="flex flex-col gap-1.5">
        <Select value={destType} onValueChange={(v) => handleDestChange(v as DestType)}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder="Destination…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="next-step">Next step</SelectItem>
            <SelectItem value="linked-flowchart">Linked flowchart</SelectItem>
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
                linkText: undefined,
              })
            }
          >
            <SelectTrigger className="max-w-full text-xs data-[size=default]:h-fit">
              <SelectValue placeholder="Select step…" />
            </SelectTrigger>
            <SelectContent>
              {otherSteps.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <div className="text-left">
                    {s.title.ja && <p>{s.title.ja}</p>}
                    <p>{s.title.en || s.id}</p>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {destType === "linked-flowchart" && (
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-col gap-0.5">
              <span className="font-medium text-2xs text-gray-400 uppercase">Flowchart</span>
              <Select
                value={option.linkedFlowchartId ?? ""}
                onValueChange={(v) =>
                  onUpdate({
                    linkedFlowchartId: v,
                    linkedStepId: undefined,
                    nextStep: undefined,
                    link: undefined,
                    linkText: undefined,
                  })
                }
              >
                <SelectTrigger className="max-w-full data-[size=default]:h-fit">
                  <SelectValue placeholder="Select flowchart…" />
                </SelectTrigger>
                <SelectContent>
                  {otherFlowcharts.map((fc) => (
                    <SelectItem key={fc.id} value={fc.id}>
                      <div className="text-left [&>p]:text-xs">
                        {fc.nameJa && <p>{fc.nameJa}</p>}
                        <p>{fc.nameEn || fc.id}</p>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {option.linkedFlowchartId && (
              <div className="flex flex-col gap-0.5">
                <span className="font-medium text-2xs text-gray-400 uppercase">Starting step</span>
                <LinkedFlowchartStepSelector
                  flowchartId={option.linkedFlowchartId}
                  value={option.linkedStepId}
                  onChange={(linkedStepId) => onUpdate({ linkedStepId })}
                />
              </div>
            )}
          </div>
        )}

        {destType === "external-link" && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="font-medium text-2xs text-gray-400 uppercase">URL</span>
              {(["ja", "en"] as const).map((locale) => (
                <div key={locale} className="flex min-w-0 items-center gap-2">
                  <span className="w-6 shrink-0 font-medium text-gray-400 text-xs uppercase">
                    {locale}
                  </span>
                  <input
                    type="text"
                    value={(locale === "ja" ? option.link : option.linkEn) ?? ""}
                    onChange={(e) =>
                      onUpdate(
                        locale === "ja"
                          ? {
                              link: e.target.value,
                              nextStep: undefined,
                              linkedFlowchartId: undefined,
                            }
                          : { linkEn: e.target.value },
                      )
                    }
                    placeholder="https://…"
                    className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="font-medium text-2xs text-gray-400 uppercase">Label</span>
              <LocaleInlineEditor
                value={{
                  en: option.linkText?.en ?? "",
                  ja: option.linkText?.ja ?? "",
                }}
                onChange={(linkText) => onUpdate({ linkText })}
                placeholder="Link label"
                className="text-xs"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function LinkedFlowchartStepSelector({
  flowchartId,
  value,
  onChange,
}: {
  flowchartId: string;
  value: string | undefined;
  onChange: (stepId: string | undefined) => void;
}) {
  const { data } = useQuery(getNavigationFlowchartByIdQueryOptions(flowchartId));
  const steps = data?.config.steps ?? [];

  return (
    <Select
      value={value ?? "__none__"}
      onValueChange={(v) => onChange(v === "__none__" ? undefined : v)}
    >
      <SelectTrigger className="max-w-full data-[size=default]:h-fit">
        <SelectValue placeholder="Start from beginning…" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">Start from beginning</SelectItem>
        {steps.map((s, idx) => (
          <SelectItem key={s.id} value={s.id}>
            <div className="text-left [&>p]:text-xs">
              {s.title.ja && <p>{s.title.ja}</p>}
              <p>{s.title.en || `Step ${idx + 1}`}</p>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-6 shrink-0 font-medium text-gray-500 text-xs uppercase">{label}</span>
      {children}
    </div>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1 text-red-600 text-xs">
      <AlertCircle className="size-3 shrink-0" />
      {children}
    </div>
  );
}
