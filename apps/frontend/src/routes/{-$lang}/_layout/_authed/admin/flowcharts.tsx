import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, GitBranch, Plus, RotateCcw, Save, Trash2 } from "lucide-react";

import { Card } from "@/components/Card";
import { LocaleInlineEditor } from "@/components/LocaleInlineEditor";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
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
// FlowchartEditor
// ---------------------------------------------------------------------------

interface FlowchartDraft {
  nameEn: string;
  nameJa: string;
  slug: string;
  status: (typeof NAVIGATION_FLOWCHART_STATUS)[keyof typeof NAVIGATION_FLOWCHART_STATUS];
}

function FlowchartEditor({
  record,
  onDeleted,
}: {
  record: NavigationFlowchartRecord;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const { openConfirmation } = useConfirmationStore();

  const [draft, setDraft] = useState<FlowchartDraft>({
    nameEn: record.nameEn,
    nameJa: record.nameJa,
    slug: record.slug ?? "",
    status: record.status,
  });
  const [revision, setRevision] = useState(record.revision);
  const [errors, setErrors] = useState<Partial<FlowchartDraft>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Track the slug uniqueness error separately (checked on blur)
  const [slugConflictError, setSlugConflictError] = useState<string | null>(null);
  const { data: allFlowcharts = [] } = useQuery(getNavigationFlowchartsQueryOptions());

  // Keep track of the original slug to detect clearing an entry point
  const originalSlugRef = useRef(record.slug);

  const { mutateAsync: saveFlowchart, isPending: isSaving } = useMutation({
    mutationFn: (d: FlowchartDraft) =>
      $saveNavigationFlowchartConfig({
        data: {
          id: record.id,
          nameEn: d.nameEn,
          nameJa: d.nameJa,
          slug: d.slug.trim() || null,
          status: d.status,
          config: record.config,
          expectedRevision: revision,
        },
      }),
  });

  const { mutateAsync: deleteFlowchart, isPending: isDeleting } = useMutation({
    mutationFn: () => $deleteNavigationFlowchart({ data: { id: record.id } }),
  });

  function validateDraft(d: FlowchartDraft) {
    const errs: Partial<FlowchartDraft> = {};
    if (!d.nameEn.trim()) errs.nameEn = "English name is required.";
    if (!d.nameJa.trim()) errs.nameJa = "Japanese name is required.";
    return errs;
  }

  function checkSlugUniqueness(slug: string) {
    const trimmed = slug.trim();
    if (!trimmed) {
      setSlugConflictError(null);
      return;
    }
    const conflict = allFlowcharts.find(
      (fc) => fc.id !== record.id && fc.slug === trimmed,
    );
    setSlugConflictError(
      conflict ? `Slug "${trimmed}" is already used by "${conflict.nameEn}".` : null,
    );
  }

  async function commitSave(d: FlowchartDraft) {
    setMessage(null);
    setError(null);

    const errs = validateDraft(d);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    if (slugConflictError) return;

    const result = await saveFlowchart(d);
    if (!result.ok) {
      if (result.code === "CONFLICT") {
        setError(
          "This flowchart was modified by someone else. Reload the page to get the latest version.",
        );
      } else {
        setError("Failed to save.");
      }
      return;
    }

    setRevision(result.data.revision);
    originalSlugRef.current = result.data.slug;
    setMessage("Saved.");
    await queryClient.invalidateQueries({ queryKey: ["navigation-flowcharts"] });
  }

  async function handleSave() {
    // If the slug is being cleared and the flowchart was previously an entry point,
    // ask for confirmation first.
    const isRemovingSlug =
      originalSlugRef.current !== null && draft.slug.trim() === "";

    if (isRemovingSlug) {
      openConfirmation({
        title: "Remove entry point?",
        description: `This flowchart is currently accessible at "${originalSlugRef.current}". Clearing the slug will make it a child-only flowchart and remove its public URL. Are you sure?`,
        actionLabel: "Remove slug and save",
        onAction: () => commitSave(draft),
      });
    } else {
      await commitSave(draft);
    }
  }

  function handleReset() {
    setDraft({
      nameEn: record.nameEn,
      nameJa: record.nameJa,
      slug: record.slug ?? "",
      status: record.status,
    });
    setErrors({});
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
              .map(
                (d) =>
                  `• ${d.flowchartNameEn} → ${d.stepTitleEn} → ${d.optionTitleEn}`,
              )
              .join("\n");
            setError(
              `Cannot delete — this flowchart is referenced by:\n${list}\n\nRemove those references first.`,
            );
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

  const isDirty =
    draft.nameEn !== record.nameEn ||
    draft.nameJa !== record.nameJa ||
    draft.slug !== (record.slug ?? "") ||
    draft.status !== record.status;

  return (
    <Card className="flex flex-1 flex-col gap-0 overflow-y-auto" caption={record.nameEn}>
      <div className="flex flex-col gap-6 p-5">
        {/* Status messages */}
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

        {/* Name */}
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-gray-700">Name</h3>
          <div className="flex flex-col gap-1.5">
            <FieldRow label="EN">
              <LocaleInlineEditor
                value={{ en: draft.nameEn, ja: draft.nameJa }}
                onChange={({ en, ja }) => {
                  setDraft((p) => ({ ...p, nameEn: en, nameJa: ja }));
                  setErrors((p) => ({ ...p, nameEn: undefined, nameJa: undefined }));
                }}
                displayClassName="text-sm font-medium"
                required
              />
            </FieldRow>
            {errors.nameEn && <FieldError>{errors.nameEn}</FieldError>}
            {errors.nameJa && <FieldError>{errors.nameJa}</FieldError>}
          </div>
        </div>

        {/* Slug */}
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-gray-700">
            Slug{" "}
            <span className="font-normal text-gray-400">
              (optional — leave blank for child flowchart)
            </span>
          </h3>
          <input
            type="text"
            value={draft.slug}
            onChange={(e) => {
              setDraft((p) => ({ ...p, slug: e.target.value }));
              setSlugConflictError(null);
            }}
            onBlur={() => checkSlugUniqueness(draft.slug)}
            placeholder="/path/to/flowchart"
            className={cn(
              "rounded border px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-blue-400",
              slugConflictError ? "border-red-400" : "border-gray-200",
            )}
          />
          {slugConflictError && <FieldError>{slugConflictError}</FieldError>}
          {draft.slug.trim() && !slugConflictError && (
            <p className="flex items-center gap-1 text-xs text-blue-600">
              <span className="rounded bg-blue-100 px-1.5 py-0.5 font-medium">entry point</span>
              This flowchart will be accessible at{" "}
              <code className="font-mono">{draft.slug.trim()}</code>
            </p>
          )}
        </div>

        {/* Status */}
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium text-gray-700">Published</h3>
          <Switch
            checked={draft.status === NAVIGATION_FLOWCHART_STATUS.PUBLISHED}
            onCheckedChange={(checked) =>
              setDraft((p) => ({
                ...p,
                status: checked
                  ? NAVIGATION_FLOWCHART_STATUS.PUBLISHED
                  : NAVIGATION_FLOWCHART_STATUS.DRAFT,
              }))
            }
          />
          <span className="text-xs text-gray-500">
            {draft.status === NAVIGATION_FLOWCHART_STATUS.PUBLISHED ? "Published" : "Draft"}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isDeleting || (!isDirty && !slugConflictError === false)}
          >
            <Save className="size-3.5" />
            {isSaving ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={!isDirty || isSaving}
          >
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

        {/* Steps placeholder */}
        <div className="rounded border border-dashed border-gray-200 p-4 text-center text-sm text-gray-400">
          Steps editor coming in Phase 5
        </div>
      </div>
    </Card>
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
