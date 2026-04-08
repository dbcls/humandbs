import { DragDropProvider, DragOverlay, useDroppable } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { move } from "@dnd-kit/helpers";
import { CollisionPriority } from "@dnd-kit/abstract";
import { createFileRoute, useRouteContext, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { GripVertical, Plus, Trash2, Check, X, Link2 } from "lucide-react";

import { Card } from "@/components/Card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type NavigationItem,
  type NavigationGroup,
  type NavPriority,
  type SiteNavigationConfig,
} from "@/config/site-navigation";
import { type Locale } from "@/config/i18n";
import { siteNavigationConfigSchema } from "@/config/site-navigation.schema";
import {
  $resetSiteNavigationConfig,
  $saveSiteNavigationConfig,
  getSiteNavigationConfigQueryOptions,
} from "@/serverFunctions/siteNavigation";
import {
  $getDocuments,
  getDocumentsQueryOptions,
  type DocumentsListItemResponse,
} from "@/serverFunctions/document";
import { deepEqual } from "@/components/form-context/fields/useFieldModified";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_authed/admin/navigation",
)({
  component: RouteComponent,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NavbarColumn = {
  parent: NavigationItem;
  children: NavigationItem[];
};

type FooterGroupWithItems = {
  group: NavigationGroup;
  items: NavigationItem[];
};

// Record<groupId, itemIds[]> shape expected by move() for multi-list
type ItemsRecord = Record<string, string[]>;

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------

function getItemLabel(item: NavigationItem): string {
  if (item.label) {
    return (
      item.label["en"] ??
      item.label["ja"] ??
      item.contentId ??
      item.url ??
      item.id
    );
  }
  return item.contentId ?? item.url ?? item.id;
}

function getDocumentLabel(doc: DocumentsListItemResponse, lang?: Locale): string {
  if (lang) {
    const currentTranslation = doc.translations.find((t) => t.lang === lang);
    if (currentTranslation?.statuses.published) {
      return currentTranslation.statuses.published;
    }
    if (currentTranslation?.statuses.draft) {
      return currentTranslation.statuses.draft;
    }
  }

  for (const t of doc.translations) {
    if (t.statuses.published) return t.statuses.published;
  }
  for (const t of doc.translations) {
    if (t.statuses.draft) return t.statuses.draft;
  }
  return doc.contentId;
}

function getFooterEditorItemLabel(
  item: NavigationItem,
  documentTitleByContentId: Map<string, string>,
): string {
  if (item.type === "document" && item.contentId) {
    return documentTitleByContentId.get(item.contentId) ?? item.contentId;
  }

  return getItemLabel(item);
}

// ---------------------------------------------------------------------------
// Route component
// ---------------------------------------------------------------------------

function RouteComponent() {
  const { lang } = useRouteContext({ from: "/{-$lang}/_layout" });
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    data,
    error: queryError,
    isError,
    isPending,
    refetch,
  } = useQuery(getSiteNavigationConfigQueryOptions());
  const { data: documents = [] } = useQuery(getDocumentsQueryOptions());
  const [draft, setDraft] = useState<SiteNavigationConfig | null>(null);
  const [revision, setRevision] = useState<number>(1);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!data || draft) return;
    setDraft(data.config);
    setRevision(data.revision);
  }, [data, draft]);

  const { mutateAsync: saveConfig, isPending: isSaving } = useMutation({
    mutationFn: async (config: SiteNavigationConfig) =>
      $saveSiteNavigationConfig({
        data: { config, expectedRevision: revision },
      }),
  });

  const { mutateAsync: resetConfig, isPending: isResetting } = useMutation({
    mutationFn: async () =>
      $resetSiteNavigationConfig({ data: { expectedRevision: revision } }),
  });

  if (isPending) {
    return (
      <Card className="flex h-full flex-1 flex-col" caption="Site Navigation">
        <div className="flex flex-col gap-3 p-5">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card className="flex h-full flex-1 flex-col" caption="Site Navigation">
        <div className="flex flex-col gap-4 p-5">
          <div>
            <p className="text-sm font-medium text-danger">
              Failed to load site navigation config.
            </p>
            <p className="text-foreground-light mt-1 text-sm">
              {queryError instanceof Error
                ? queryError.message
                : "The CMS config request did not complete successfully."}
            </p>
          </div>
          <div>
            <Button type="button" variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  if (!draft) {
    return (
      <Card className="flex h-full flex-1 flex-col" caption="Site Navigation">
        <div className="flex flex-col gap-3 p-5">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </Card>
    );
  }

  const isDirty = !deepEqual(draft, data.config);

  async function refreshNavigation() {
    await queryClient.invalidateQueries({ queryKey: ["site-navigation"] });
    await router.invalidate();
  }

  async function handleSave() {
    if (!draft) return;
    setMessage(null);
    setError(null);
    const validation = siteNavigationConfigSchema.safeParse(draft);
    if (!validation.success) {
      setError(
        validation.error.issues[0]?.message ?? "Navigation config is invalid.",
      );
      return;
    }
    const result = await saveConfig(draft);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDraft(result.data.config);
    setRevision(result.data.revision);
    setMessage("Navigation saved.");
    await refreshNavigation();
  }

  async function handleReset() {
    setMessage(null);
    setError(null);
    const result = await resetConfig();
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDraft(result.data.config);
    setRevision(result.data.revision);
    setMessage("Navigation reset to default.");
    await refreshNavigation();
  }

  function updateDraft(
    updater: (current: SiteNavigationConfig) => SiteNavigationConfig,
  ) {
    setDraft((current) => (current ? updater(current) : current));
  }

  // ---------------------------------------------------------------------------
  // Navbar commit handlers
  // ---------------------------------------------------------------------------

  function commitNavbarColumns(columns: NavbarColumn[]) {
    updateDraft((current) => {
      const newItems = current.items.map((item) => {
        if (!item.navbar) return item;

        const colIndex = columns.findIndex((c) => c.parent.id === item.id);
        if (colIndex >= 0) {
          return {
            ...item,
            navbar: {
              ...item.navbar,
              order: (colIndex + 1) * 10,
              parentItemId: undefined,
            },
          };
        }

        for (const col of columns) {
          const childIndex = col.children.findIndex((ch) => ch.id === item.id);
          if (childIndex >= 0) {
            return {
              ...item,
              navbar: {
                ...item.navbar,
                order: (childIndex + 1) * 10,
                parentItemId: col.parent.id,
              },
            };
          }
        }

        return item;
      });
      return { ...current, items: newItems };
    });
  }

  // ---------------------------------------------------------------------------
  // Footer commit handlers
  // ---------------------------------------------------------------------------

  function commitFooterGroups(groups: FooterGroupWithItems[]) {
    updateDraft((current) => {
      // Build new group list preserving all groups (including those not in the
      // drag-drop view, i.e. empty groups that were filtered out)
      const updatedGroupIds = new Set(groups.map((g) => g.group.id));
      const unchangedGroups = current.zones.footer.groups.filter(
        (g) => !updatedGroupIds.has(g.id),
      );

      const updatedGroups = groups.map((g, idx) => ({
        ...g.group,
        order: (idx + 1) * 10,
        items: g.items.map((item, itemIdx) => ({
          id: item.id,
          order: (itemIdx + 1) * 10,
        })),
      }));

      return {
        ...current,
        zones: {
          ...current.zones,
          footer: {
            groups: [...updatedGroups, ...unchangedGroups],
          },
        },
      };
    });
  }

  function addFooterGroup(label: { en: string; ja: string }) {
    const id = crypto.randomUUID();
    const maxOrder = Math.max(
      0,
      ...(draft?.zones.footer.groups.map((g) => g.order) ?? [0]),
    );
    updateDraft((current) => ({
      ...current,
      zones: {
        ...current.zones,
        footer: {
          groups: [
            ...current.zones.footer.groups,
            {
              id,
              label,
              order: maxOrder + 10,
              enabled: true,
              items: [],
            },
          ],
        },
      },
    }));
  }

  function renameFooterGroup(
    groupId: string,
    label: { en: string; ja: string },
  ) {
    updateDraft((current) => ({
      ...current,
      zones: {
        ...current.zones,
        footer: {
          groups: current.zones.footer.groups.map((g) =>
            g.id === groupId ? { ...g, label } : g,
          ),
        },
      },
    }));
  }

  function deleteFooterGroup(groupId: string) {
    updateDraft((current) => ({
      ...current,
      zones: {
        ...current.zones,
        footer: {
          groups: current.zones.footer.groups.filter((g) => g.id !== groupId),
        },
      },
      // Items that were in the deleted group remain in config.items (unassigned)
    }));
  }

  function toggleFooterGroupEnabled(groupId: string, enabled: boolean) {
    updateDraft((current) => ({
      ...current,
      zones: {
        ...current.zones,
        footer: {
          groups: current.zones.footer.groups.map((g) =>
            g.id === groupId ? { ...g, enabled } : g,
          ),
        },
      },
    }));
  }

  function assignDocumentToGroup(contentId: string, groupId: string) {
    updateDraft((current) => {
      // Find existing NavigationItem for this document, or create one
      const existingItem = current.items.find(
        (i) => i.type === "document" && i.contentId === contentId,
      );
      const itemId = existingItem?.id ?? crypto.randomUUID();

      let newItems = existingItem
        ? current.items
        : [
            ...current.items,
            { id: itemId, type: "document" as const, contentId },
          ];

      // Remove from any group that currently has this item
      const newGroups = current.zones.footer.groups.map((g) => {
        const hasItem = g.items.some((ref) => ref.id === itemId);
        if (!hasItem) return g;
        return { ...g, items: g.items.filter((ref) => ref.id !== itemId) };
      });

      // Add to target group
      const targetGroups = newGroups.map((g) => {
        if (g.id !== groupId) return g;
        return {
          ...g,
          items: [...g.items, { id: itemId, order: (g.items.length + 1) * 10 }],
        };
      });

      return {
        ...current,
        items: newItems,
        zones: {
          ...current.zones,
          footer: { groups: targetGroups },
        },
      };
    });
  }

  function addLinkItemToGroup(
    groupId: string,
    url: string,
    label: { en: string; ja: string },
  ) {
    const id = crypto.randomUUID();
    updateDraft((current) => {
      const newItem: NavigationItem = { id, type: "link", url, label };
      const newGroups = current.zones.footer.groups.map((g) => {
        if (g.id !== groupId) return g;
        return {
          ...g,
          items: [...g.items, { id, order: (g.items.length + 1) * 10 }],
        };
      });
      return {
        ...current,
        items: [...current.items, newItem],
        zones: {
          ...current.zones,
          footer: { groups: newGroups },
        },
      };
    });
  }

  function updateNavbarItemEnabled(id: string, enabled: boolean) {
    updateDraft((current) => ({
      ...current,
      items: current.items.map((entry) =>
        entry.id === id && entry.navbar
          ? { ...entry, navbar: { ...entry.navbar, enabled } }
          : entry,
      ),
    }));
  }

  function updateNavbarItemPriority(id: string, priority: NavPriority) {
    updateDraft((current) => ({
      ...current,
      items: current.items.map((entry) =>
        entry.id === id && entry.navbar
          ? { ...entry, navbar: { ...entry.navbar, priority } }
          : entry,
      ),
    }));
  }

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const itemById = new Map(draft.items.map((i) => [i.id, i]));

  const topLevelNavbarItems = draft.items
    .filter((item) => item.navbar && !item.navbar.parentItemId)
    .slice()
    .sort((a, b) => (a.navbar?.order ?? 0) - (b.navbar?.order ?? 0));

  const navbarColumns: NavbarColumn[] = topLevelNavbarItems.map((parent) => ({
    parent,
    children: draft.items
      .filter((item) => item.navbar?.parentItemId === parent.id)
      .slice()
      .sort((a, b) => (a.navbar?.order ?? 0) - (b.navbar?.order ?? 0)),
  }));

  const sortedFooterGroups = draft.zones.footer.groups
    .slice()
    .sort((a, b) => a.order - b.order);

  const footerGroups: FooterGroupWithItems[] = sortedFooterGroups.map(
    (group) => ({
      group,
      items: group.items
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((ref) => itemById.get(ref.id))
        .filter((item): item is NavigationItem => item !== undefined),
    }),
  );

  return (
    <Card
      className="flex h-full flex-1 flex-col"
      caption="Site Navigation"
      containerClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between px-5 pt-5">
        <div>
          <p className="text-sm font-medium">
            Shared structure for both locales
          </p>
          <p className="text-foreground-light text-sm">
            Labels come from document titles and item labels. This editor
            changes ordering, visibility, priority, and footer grouping.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={isResetting || isSaving}
          >
            {isResetting ? "Resetting…" : "Reset to default"}
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || isSaving || isResetting}
          >
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {message ? (
        <div className="mx-5 mt-4 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="mx-5 mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-5 px-5 pt-5 pb-5">
          {/* Navbar preview */}
          <section className="rounded-md border border-gray-200 p-4">
            <h2 className="text-base font-medium">Navbar</h2>
            <p className="text-foreground-light mt-1 text-sm">
              Drag columns to reorder. Drag child items between columns to
              reparent.
            </p>
            <div className="mt-4">
              <NavbarPreview
                columns={navbarColumns}
                onCommit={commitNavbarColumns}
                onToggleEnabled={updateNavbarItemEnabled}
                onChangePriority={updateNavbarItemPriority}
              />
            </div>
          </section>

          {/* Footer preview */}
          <section className="rounded-md border border-gray-200 p-4">
            <h2 className="text-base font-medium">Footer</h2>
            <p className="text-foreground-light mt-1 text-sm">
              Drag group columns to reorder. Drag items between columns to
              reassign. Click a group header to rename it.
            </p>
            <div className="mt-4">
              <FooterPreview
                groups={footerGroups}
                allItems={draft.items}
                documents={documents}
                lang={lang}
                onCommit={commitFooterGroups}
                onToggleGroupEnabled={toggleFooterGroupEnabled}
                onRenameGroup={renameFooterGroup}
                onDeleteGroup={deleteFooterGroup}
                onAddGroup={addFooterGroup}
                onAssignDocument={assignDocumentToGroup}
                onAddLinkToGroup={addLinkItemToGroup}
              />
            </div>
          </section>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Navbar preview — multi-sortable-list using @dnd-kit/react v1
// ---------------------------------------------------------------------------

const NAVBAR_COLUMN_TYPE = "navbar-column";
const NAVBAR_ITEM_TYPE = "navbar-item";

function NavbarPreview({
  columns: columnsProp,
  onCommit,
  onToggleEnabled,
  onChangePriority,
}: {
  columns: NavbarColumn[];
  onCommit: (columns: NavbarColumn[]) => void;
  onToggleEnabled: (id: string, enabled: boolean) => void;
  onChangePriority: (id: string, priority: NavPriority) => void;
}) {
  const [columns, setColumns] = useState<NavbarColumn[]>(columnsProp);
  const isDraggingRef = useRef(false);
  const snapshotRef = useRef<NavbarColumn[]>(columnsProp);

  const [draggingColumnId, setDraggingColumnId] = useState<string | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);

  useEffect(() => {
    if (!isDraggingRef.current) {
      setColumns(columnsProp);
    }
  }, [columnsProp]);

  const draggingColumn = draggingColumnId
    ? (columns.find((c) => c.parent.id === draggingColumnId) ?? null)
    : null;
  const draggingItem = draggingItemId
    ? (columns
        .flatMap((c) => c.children)
        .find((ch) => ch.id === draggingItemId) ?? null)
    : null;

  function buildItemsRecord(cols: NavbarColumn[]): ItemsRecord {
    const record: ItemsRecord = {
      _columns: cols.map((c) => c.parent.id),
    };
    for (const col of cols) {
      record[col.parent.id] = col.children.map((ch) => ch.id);
    }
    return record;
  }

  function applyItemsRecord(
    record: ItemsRecord,
    prevCols: NavbarColumn[],
  ): NavbarColumn[] {
    const columnOrder = record["_columns"] as string[];
    const parentById = new Map(prevCols.map((c) => [c.parent.id, c.parent]));
    const childById = new Map(
      prevCols.flatMap((c) => c.children.map((ch) => [ch.id, ch])),
    );

    return columnOrder.map((colId) => ({
      parent: parentById.get(colId)!,
      children: (record[colId] ?? [])
        .map((childId) => childById.get(childId)!)
        .filter(Boolean),
    }));
  }

  return (
    <DragDropProvider
      onDragStart={(event) => {
        isDraggingRef.current = true;
        snapshotRef.current = columns;
        const src = event.operation.source;
        if (!src) return;
        if (src.data?.type === NAVBAR_COLUMN_TYPE) {
          setDraggingColumnId(String(src.id));
        } else if (src.data?.type === NAVBAR_ITEM_TYPE) {
          setDraggingItemId(String(src.id));
        }
      }}
      onDragOver={(event) => {
        const src = event.operation.source;
        if (!src) return;
        setColumns((prev) => {
          const record = buildItemsRecord(prev);
          const next = move(record, event);
          return applyItemsRecord(next as ItemsRecord, prev);
        });
      }}
      onDragEnd={(event) => {
        setDraggingColumnId(null);
        setDraggingItemId(null);
        isDraggingRef.current = false;

        if (event.canceled) {
          setColumns(snapshotRef.current);
          return;
        }

        setColumns((finalCols) => {
          onCommit(finalCols);
          return finalCols;
        });
      }}
    >
      <div className="flex flex-wrap gap-4">
        {columns.map((col, colIndex) => (
          <NavbarColumnCard
            key={col.parent.id}
            col={col}
            colIndex={colIndex}
            isDragging={draggingColumnId === col.parent.id}
            onToggleEnabled={onToggleEnabled}
            onChangePriority={onChangePriority}
          />
        ))}
      </div>

      <DragOverlay>
        {draggingColumn ? (
          <NavbarColumnOverlay col={draggingColumn} />
        ) : draggingItem ? (
          <NavbarItemOverlay item={draggingItem} />
        ) : null}
      </DragOverlay>
    </DragDropProvider>
  );
}

function NavbarColumnCard({
  col,
  colIndex,
  isDragging,
  onToggleEnabled,
  onChangePriority,
}: {
  col: NavbarColumn;
  colIndex: number;
  isDragging: boolean;
  onToggleEnabled: (id: string, enabled: boolean) => void;
  onChangePriority: (id: string, priority: NavPriority) => void;
}) {
  const { ref: columnDropRef, isDropTarget: isColumnDropTarget } = useDroppable(
    {
      id: col.parent.id + "-droppable",
      collisionPriority: CollisionPriority.Low,
    },
  );

  const { ref: columnSortRef, handleRef: columnHandleRef } = useSortable({
    id: col.parent.id,
    index: colIndex,
    type: NAVBAR_COLUMN_TYPE,
    accept: [NAVBAR_COLUMN_TYPE],
    data: { type: NAVBAR_COLUMN_TYPE },
  });

  const enabled = col.parent.navbar?.enabled ?? true;
  const priority = col.parent.navbar?.priority ?? "important";
  const isHomeItem =
    col.parent.type === "document" && col.parent.contentId === "home";

  return (
    <div
      ref={(el) => {
        columnSortRef(el);
        columnDropRef(el);
      }}
      className={[
        "min-w-32 max-w-96 shrink-0 rounded-md bg-white shadow-sm ring-1 ring-gray-200 transition-opacity",
        isDragging ? "opacity-40" : "",
        !enabled ? "opacity-50" : "",
        isColumnDropTarget && !isDragging ? "ring-2 ring-blue-400" : "",
      ].join(" ")}
    >
      <div className="flex flex-col gap-2 border-b border-gray-100 px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            ref={columnHandleRef as React.Ref<HTMLButtonElement>}
            className="cursor-grab touch-none text-gray-400 hover:text-gray-600"
          >
            <GripVertical className="size-4 shrink-0" />
          </button>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {getItemLabel(col.parent)}
          </span>
          <Switch
            checked={enabled}
            disabled={isHomeItem}
            onCheckedChange={(checked) =>
              onToggleEnabled(col.parent.id, checked)
            }
            className="shrink-0 scale-75"
          />
        </div>
        <Select
          value={priority}
          onValueChange={(value) =>
            onChangePriority(col.parent.id, value as NavPriority)
          }
        >
          <SelectTrigger className="h-7 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="important">Important</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="optional">Optional</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <ul className="flex flex-col gap-1 p-2">
        {col.children.map((child, childIndex) => (
          <NavbarChildItem
            key={child.id}
            item={child}
            childIndex={childIndex}
            groupId={col.parent.id}
            onToggleEnabled={onToggleEnabled}
          />
        ))}
        {col.children.length === 0 && (
          <li className="text-foreground-light px-2 py-3 text-xs">
            No sub-items
          </li>
        )}
      </ul>
    </div>
  );
}

function NavbarChildItem({
  item,
  childIndex,
  groupId,
  onToggleEnabled,
}: {
  item: NavigationItem;
  childIndex: number;
  groupId: string;
  onToggleEnabled: (id: string, enabled: boolean) => void;
}) {
  const { ref, handleRef, isDragSource } = useSortable({
    id: item.id,
    index: childIndex,
    type: NAVBAR_ITEM_TYPE,
    accept: [NAVBAR_ITEM_TYPE],
    group: groupId,
    data: { type: NAVBAR_ITEM_TYPE },
  });

  const enabled = item.navbar?.enabled ?? true;

  return (
    <li
      ref={ref as React.Ref<HTMLLIElement>}
      className={[
        "flex items-start gap-1 rounded px-1 py-1 hover:bg-gray-50",
        isDragSource ? "opacity-40" : "",
        !enabled ? "opacity-50" : "",
      ].join(" ")}
    >
      <button
        type="button"
        ref={handleRef as React.Ref<HTMLButtonElement>}
        className="cursor-grab touch-none text-gray-400 hover:text-gray-600"
      >
        <GripVertical className="size-3 shrink-0" />
      </button>
      <span className="min-w-0 flex-1 whitespace-normal break-words text-xs">
        {getItemLabel(item)}
      </span>
      <Switch
        checked={enabled}
        onCheckedChange={(checked) => onToggleEnabled(item.id, checked)}
        className="shrink-0 scale-75"
      />
    </li>
  );
}

// ---------------------------------------------------------------------------
// Navbar drag overlay clones
// ---------------------------------------------------------------------------

function NavbarColumnOverlay({ col }: { col: NavbarColumn }) {
  const enabled = col.parent.navbar?.enabled ?? true;
  const priority = col.parent.navbar?.priority ?? "important";

  return (
    <div
      className={[
        "flex-shrink-0 rounded-md bg-white shadow-lg ring-2 ring-blue-300",
        !enabled ? "opacity-50" : "",
      ].join(" ")}
    >
      <div className="flex flex-col gap-2 border-b border-gray-100 px-3 py-2">
        <div className="flex items-center gap-1">
          <GripVertical className="size-4 shrink-0 text-gray-400" />
          <span className="min-w-0 truncate text-sm font-semibold">
            {getItemLabel(col.parent)}
          </span>
        </div>
        <div className="rounded-md border border-gray-200 px-2 py-1 text-xs capitalize text-gray-500">
          {priority}
        </div>
      </div>
      <ul className="flex flex-col gap-1 p-2">
        {col.children.map((child) => (
          <li
            key={child.id}
            className="flex items-start gap-1 rounded px-1 py-1"
          >
            <GripVertical className="size-3 shrink-0 text-gray-400" />
            <span className="min-w-0 flex-1 whitespace-normal break-words text-xs">
              {getItemLabel(child)}
            </span>
          </li>
        ))}
        {col.children.length === 0 && (
          <li className="text-foreground-light px-2 py-3 text-xs">
            No sub-items
          </li>
        )}
      </ul>
    </div>
  );
}

function NavbarItemOverlay({ item }: { item: NavigationItem }) {
  const enabled = item.navbar?.enabled ?? true;
  return (
    <li
      className={[
        "flex items-start gap-1 rounded bg-white px-1 py-1 shadow-lg ring-2 ring-blue-300",
        !enabled ? "opacity-50" : "",
      ].join(" ")}
    >
      <GripVertical className="size-3 shrink-0 text-gray-400" />
      <span className="min-w-0 flex-1 whitespace-normal break-words text-xs">
        {getItemLabel(item)}
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Footer preview — two-panel layout with document pool + drag-drop groups
// ---------------------------------------------------------------------------

const FOOTER_GROUP_TYPE = "footer-group";
const FOOTER_ITEM_TYPE = "footer-item";
const FOOTER_UNASSIGNED_DOC_TYPE = "footer-unassigned-doc";
const FOOTER_UNASSIGNED_POOL_ID = "__footer-pool__";

function FooterPreview({
  groups: groupsProp,
  allItems,
  documents,
  lang,
  onCommit,
  onToggleGroupEnabled,
  onRenameGroup,
  onDeleteGroup,
  onAddGroup,
  onAssignDocument,
  onAddLinkToGroup,
}: {
  groups: FooterGroupWithItems[];
  allItems: NavigationItem[];
  documents: DocumentsListItemResponse[];
  lang: Locale;
  onCommit: (groups: FooterGroupWithItems[]) => void;
  onToggleGroupEnabled: (groupId: string, enabled: boolean) => void;
  onRenameGroup: (groupId: string, label: { en: string; ja: string }) => void;
  onDeleteGroup: (groupId: string) => void;
  onAddGroup: (label: { en: string; ja: string }) => void;
  onAssignDocument: (contentId: string, groupId: string) => void;
  onAddLinkToGroup: (
    groupId: string,
    url: string,
    label: { en: string; ja: string },
  ) => void;
}) {
  const [groups, setGroups] = useState<FooterGroupWithItems[]>(groupsProp);
  const isDraggingRef = useRef(false);
  const snapshotRef = useRef<FooterGroupWithItems[]>(groupsProp);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabelEn, setNewLabelEn] = useState("");
  const [newLabelJa, setNewLabelJa] = useState("");

  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [draggingDocContentId, setDraggingDocContentId] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (!isDraggingRef.current) {
      setGroups(groupsProp);
    }
  }, [groupsProp]);

  const draggingGroup = draggingGroupId
    ? (groups.find((g) => g.group.id === draggingGroupId) ?? null)
    : null;
  const draggingItem = draggingItemId
    ? (groups.flatMap((g) => g.items).find((i) => i.id === draggingItemId) ??
      null)
    : null;

  // Compute which item IDs are assigned to any group
  const assignedItemIds = new Set(
    groups.flatMap((g) => g.items.map((i) => i.id)),
  );

  // For each document, find its NavigationItem if it exists
  const docItemMap = new Map<string, NavigationItem>(
    allItems
      .filter((i) => i.type === "document" && i.contentId)
      .map((i) => [i.contentId!, i]),
  );

  // Unassigned link items: type === "link" and not currently in any group
  const unassignedLinkItems = allItems.filter(
    (i) => i.type === "link" && !assignedItemIds.has(i.id),
  );
  const documentTitleByContentId = new Map(
    documents.map((doc) => [doc.contentId, getDocumentLabel(doc, lang)]),
  );

  function buildItemsRecord(gs: FooterGroupWithItems[]): ItemsRecord {
    const record: ItemsRecord = {
      _groups: gs.map((g) => g.group.id),
    };
    for (const { group, items } of gs) {
      record[group.id] = items.map((i) => i.id);
    }
    return record;
  }

  function applyItemsRecord(
    record: ItemsRecord,
    prevGroups: FooterGroupWithItems[],
  ): FooterGroupWithItems[] {
    const groupOrder = record["_groups"] as string[];
    const groupById = new Map(prevGroups.map((g) => [g.group.id, g.group]));
    const itemById = new Map(
      prevGroups.flatMap((g) => g.items.map((i) => [i.id, i])),
    );

    return groupOrder.map((groupId) => ({
      group: groupById.get(groupId)!,
      items: (record[groupId] ?? [])
        .map((itemId) => itemById.get(itemId)!)
        .filter(Boolean),
    }));
  }

  function handleAddGroup() {
    const en = newLabelEn.trim();
    const ja = newLabelJa.trim();
    if (!en) return;
    onAddGroup({ en, ja: ja || en });
    setNewLabelEn("");
    setNewLabelJa("");
    setShowAddForm(false);
  }

  function cancelAddGroup() {
    setNewLabelEn("");
    setNewLabelJa("");
    setShowAddForm(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <DragDropProvider
        onDragStart={(event) => {
          isDraggingRef.current = true;
          snapshotRef.current = groups;
          const src = event.operation.source;
          if (!src) return;
          if (src.data?.type === FOOTER_GROUP_TYPE) {
            setDraggingGroupId(String(src.id));
          } else if (src.data?.type === FOOTER_ITEM_TYPE) {
            setDraggingItemId(String(src.id));
          } else if (src.data?.type === FOOTER_UNASSIGNED_DOC_TYPE) {
            setDraggingDocContentId(String(src.data.contentId));
          }
        }}
        onDragOver={(event) => {
          const src = event.operation.source;
          if (!src) return;
          // Only use move() for footer-item and footer-group drag types
          if (
            src.data?.type === FOOTER_ITEM_TYPE ||
            src.data?.type === FOOTER_GROUP_TYPE
          ) {
            setGroups((prev) => {
              const record = buildItemsRecord(prev);
              const next = move(record, event);
              return applyItemsRecord(next as ItemsRecord, prev);
            });
          }
        }}
        onDragEnd={(event) => {
          const src = event.operation.source;
          const dest = event.operation.target;

          setDraggingGroupId(null);
          setDraggingItemId(null);
          setDraggingDocContentId(null);
          isDraggingRef.current = false;

          if (event.canceled) {
            setGroups(snapshotRef.current);
            return;
          }

          // Handle unassigned doc dropped onto a group
          if (src?.data?.type === FOOTER_UNASSIGNED_DOC_TYPE) {
            const contentId = String(src.data.contentId);
            // Find group from dest id (strip -droppable suffix if needed)
            if (dest) {
              const destId = String(dest.id);
              const groupId = destId.endsWith("-droppable")
                ? destId.slice(0, -"-droppable".length)
                : destId;
              // Only commit if it's a real group id
              const isGroup = snapshotRef.current.some(
                (g) => g.group.id === groupId,
              );
              if (isGroup) {
                onAssignDocument(contentId, groupId);
              }
            }
            setGroups(snapshotRef.current);
            return;
          }

          // Handle footer-item dragged to pool (unassign)
          if (src?.data?.type === FOOTER_ITEM_TYPE && dest) {
            const destId = String(dest.id);
            if (
              destId === FOOTER_UNASSIGNED_POOL_ID ||
              destId === FOOTER_UNASSIGNED_POOL_ID + "-droppable"
            ) {
              // Remove item from whichever group it's in
              setGroups((finalGroups) => {
                const itemId = String(src.id);
                const updated = finalGroups.map((g) => ({
                  ...g,
                  items: g.items.filter((i) => i.id !== itemId),
                }));
                onCommit(updated);
                return updated;
              });
              return;
            }
          }

          setGroups((finalGroups) => {
            onCommit(finalGroups);
            return finalGroups;
          });
        }}
      >
        <div className="flex gap-4">
          {/* Left panel: available documents + unassigned links */}
          <FooterUnassignedPool
            documents={documents}
            lang={lang}
            docItemMap={docItemMap}
            assignedItemIds={assignedItemIds}
            unassignedLinkItems={unassignedLinkItems}
            groups={groups}
          />

          {/* Right panel: group columns */}
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <div className="flex flex-wrap gap-4">
              {groups.map((g, groupIndex) => (
                <FooterGroupColumn
                  key={g.group.id}
                  g={g}
                  groupIndex={groupIndex}
                  documentTitleByContentId={documentTitleByContentId}
                  isDragging={draggingGroupId === g.group.id}
                  onToggleGroupEnabled={onToggleGroupEnabled}
                  onRenameGroup={onRenameGroup}
                  onDeleteGroup={onDeleteGroup}
                  onAddLinkToGroup={onAddLinkToGroup}
                />
              ))}
            </div>
          </div>
        </div>

        <DragOverlay>
          {draggingGroup ? (
            <FooterGroupOverlay
              g={draggingGroup}
              documentTitleByContentId={documentTitleByContentId}
            />
          ) : draggingItem ? (
            <FooterItemOverlay
              item={draggingItem}
              documentTitleByContentId={documentTitleByContentId}
            />
          ) : draggingDocContentId ? (
            <FooterDocOverlay
              label={
                documents.find((d) => d.contentId === draggingDocContentId)
                  ? getDocumentLabel(
                      documents.find(
                        (d) => d.contentId === draggingDocContentId,
                      )!,
                      lang,
                    )
                  : draggingDocContentId
              }
            />
          ) : null}
        </DragOverlay>
      </DragDropProvider>

      {/* Add group */}
      {showAddForm ? (
        <div className="rounded-md border border-gray-200 bg-white p-3 shadow-sm">
          <p className="mb-2 text-xs font-medium text-gray-600">New group</p>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <label className="w-8 shrink-0 text-xs text-gray-500">EN</label>
              <input
                type="text"
                value={newLabelEn}
                onChange={(e) => setNewLabelEn(e.target.value)}
                placeholder="English name"
                className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-400"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddGroup();
                  if (e.key === "Escape") cancelAddGroup();
                }}
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="w-8 shrink-0 text-xs text-gray-500">JA</label>
              <input
                type="text"
                value={newLabelJa}
                onChange={(e) => setNewLabelJa(e.target.value)}
                placeholder="Japanese name"
                className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-400"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddGroup();
                  if (e.key === "Escape") cancelAddGroup();
                }}
              />
            </div>
            <div className="flex items-center gap-1 pt-1">
              <Button
                type="button"
                size="slim"
                onClick={handleAddGroup}
                disabled={!newLabelEn.trim()}
                className="h-7 text-xs"
              >
                <Check className="mr-1 size-3" />
                Add
              </Button>
              <Button
                type="button"
                size="slim"
                variant="outline"
                onClick={cancelAddGroup}
                className="h-7 text-xs"
              >
                <X className="mr-1 size-3" />
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="slim"
          className="w-fit text-xs"
          onClick={() => setShowAddForm(true)}
        >
          <Plus className="mr-1 size-3" />
          Add group
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Footer unassigned pool (left panel)
// ---------------------------------------------------------------------------

function FooterUnassignedPool({
  documents,
  lang,
  docItemMap,
  assignedItemIds,
  unassignedLinkItems,
  groups,
}: {
  documents: DocumentsListItemResponse[];
  lang: Locale;
  docItemMap: Map<string, NavigationItem>;
  assignedItemIds: Set<string>;
  unassignedLinkItems: NavigationItem[];
  groups: FooterGroupWithItems[];
}) {
  const { ref: poolDropRef, isDropTarget: isPoolDropTarget } = useDroppable({
    id: FOOTER_UNASSIGNED_POOL_ID + "-droppable",
    collisionPriority: CollisionPriority.Low,
  });

  // Build a map: itemId -> group name
  const itemGroupName = new Map<string, string>();
  for (const g of groups) {
    for (const item of g.items) {
      itemGroupName.set(
        item.id,
        g.group.label["en"] ?? g.group.label["ja"] ?? "",
      );
    }
  }

  return (
    <div
      ref={poolDropRef}
      className={[
        "flex h-[min(36rem,calc(100vh-18rem))] min-h-[300px] w-72 shrink-0 flex-col rounded-md border border-gray-200 bg-gray-50 p-3 transition-colors lg:w-80",
        isPoolDropTarget ? "border-blue-300 bg-blue-50" : "",
      ].join(" ")}
    >
      <p className="mb-2 text-xs font-semibold uppercase text-gray-500">
        Available documents
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <ul className="flex flex-col gap-1">
          {documents.map((doc) => {
            const navItem = docItemMap.get(doc.contentId);
            const isAssigned = navItem ? assignedItemIds.has(navItem.id) : false;
            const groupName = navItem ? itemGroupName.get(navItem.id) : undefined;
            return (
              <FooterPoolDocCard
              key={doc.contentId}
              doc={doc}
              lang={lang}
              isAssigned={isAssigned}
              groupName={groupName}
            />
            );
          })}
          {documents.length === 0 && (
            <li className="text-foreground-light py-2 text-xs">No documents</li>
          )}
        </ul>

        {unassignedLinkItems.length > 0 && (
          <>
            <p className="mb-2 mt-3 text-xs font-semibold uppercase text-gray-500">
              Unassigned links
            </p>
            <ul className="flex flex-col gap-1">
              {unassignedLinkItems.map((item, idx) => (
                <FooterPoolItemCard key={item.id} item={item} index={idx} />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function FooterPoolDocCard({
  doc,
  lang,
  isAssigned,
  groupName,
}: {
  doc: DocumentsListItemResponse;
  lang: Locale;
  isAssigned: boolean;
  groupName: string | undefined;
}) {
  const { ref, isDragSource } = useSortable({
    id: "pool-doc-" + doc.contentId,
    index: 0,
    type: FOOTER_UNASSIGNED_DOC_TYPE,
    disabled: isAssigned,
    data: { type: FOOTER_UNASSIGNED_DOC_TYPE, contentId: doc.contentId },
  });

  const label = getDocumentLabel(doc, lang);

  return (
    <li
      ref={ref as React.Ref<HTMLLIElement>}
      className={[
        "flex items-start gap-1.5 rounded px-2 py-1.5 text-xs transition-colors",
        isAssigned
          ? "cursor-not-allowed opacity-50"
          : "cursor-grab bg-white shadow-sm ring-1 ring-gray-200 hover:bg-gray-50",
        isDragSource ? "opacity-30" : "",
      ].join(" ")}
      title={isAssigned ? `Assigned to: ${groupName ?? "a group"}` : undefined}
    >
      <GripVertical className="mt-0.5 size-3 shrink-0 text-gray-400" />
      <span className="min-w-0 flex-1 break-words">{label}</span>
      {isAssigned && (
        <span className="ml-auto shrink-0 rounded bg-gray-200 px-1 py-0.5 text-[10px] text-gray-500">
          {groupName ?? "assigned"}
        </span>
      )}
    </li>
  );
}

function FooterPoolItemCard({
  item,
  index,
}: {
  item: NavigationItem;
  index: number;
}) {
  const { ref, isDragSource } = useSortable({
    id: item.id,
    index,
    type: FOOTER_ITEM_TYPE,
    accept: [FOOTER_ITEM_TYPE],
    data: { type: FOOTER_ITEM_TYPE },
  });

  return (
    <li
      ref={ref as React.Ref<HTMLLIElement>}
      className={[
        "flex cursor-grab items-start gap-1.5 rounded bg-white px-2 py-1.5 text-xs shadow-sm ring-1 ring-gray-200 hover:bg-gray-50",
        isDragSource ? "opacity-30" : "",
      ].join(" ")}
    >
      <Link2 className="mt-0.5 size-3 shrink-0 text-gray-400" />
      <span className="min-w-0 flex-1 break-words">{getItemLabel(item)}</span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Footer group column with inline rename + add link
// ---------------------------------------------------------------------------

function FooterGroupColumn({
  g,
  groupIndex,
  documentTitleByContentId,
  isDragging,
  onToggleGroupEnabled,
  onRenameGroup,
  onDeleteGroup,
  onAddLinkToGroup,
}: {
  g: FooterGroupWithItems;
  groupIndex: number;
  documentTitleByContentId: Map<string, string>;
  isDragging: boolean;
  onToggleGroupEnabled: (groupId: string, enabled: boolean) => void;
  onRenameGroup: (groupId: string, label: { en: string; ja: string }) => void;
  onDeleteGroup: (groupId: string) => void;
  onAddLinkToGroup: (
    groupId: string,
    url: string,
    label: { en: string; ja: string },
  ) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editEn, setEditEn] = useState("");
  const [editJa, setEditJa] = useState("");
  const [showAddLink, setShowAddLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkEn, setLinkEn] = useState("");
  const [linkJa, setLinkJa] = useState("");
  const editFormRef = useRef<HTMLDivElement | null>(null);
  const editEnInputRef = useRef<HTMLInputElement | null>(null);

  const { ref: groupDropRef, isDropTarget } = useDroppable({
    id: g.group.id + "-droppable",
    collisionPriority: CollisionPriority.Low,
  });

  const { ref: groupSortRef, handleRef: groupHandleRef } = useSortable({
    id: g.group.id,
    index: groupIndex,
    type: FOOTER_GROUP_TYPE,
    accept: [FOOTER_GROUP_TYPE],
    data: { type: FOOTER_GROUP_TYPE },
  });

  const groupLabel = g.group.label["en"] ?? g.group.label["ja"] ?? "";

  function startEditing() {
    setEditEn(g.group.label["en"] ?? "");
    setEditJa(g.group.label["ja"] ?? "");
    setIsEditing(true);
  }

  function confirmEdit() {
    const en = editEn.trim();
    const ja = editJa.trim();
    if (!en) return;
    onRenameGroup(g.group.id, { en, ja: ja || en });
    setIsEditing(false);
  }

  function cancelEdit() {
    setIsEditing(false);
  }

  useEffect(() => {
    if (!isEditing) return;

    const input = editEnInputRef.current;
    if (input) {
      input.focus();
      input.select();
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (editFormRef.current?.contains(target)) return;
      confirmEdit();
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isEditing, editEn, editJa]);

  function confirmAddLink() {
    const url = linkUrl.trim();
    const en = linkEn.trim();
    const ja = linkJa.trim();
    if (!url || !en) return;
    onAddLinkToGroup(g.group.id, url, { en, ja: ja || en });
    setLinkUrl("");
    setLinkEn("");
    setLinkJa("");
    setShowAddLink(false);
  }

  function cancelAddLink() {
    setLinkUrl("");
    setLinkEn("");
    setLinkJa("");
    setShowAddLink(false);
  }

  return (
    <div
      ref={(el) => {
        groupSortRef(el);
        groupDropRef(el);
      }}
      className={[
        "min-w-40 max-w-96 shrink-0 rounded-md bg-white shadow-sm ring-1 ring-gray-200 transition-opacity",
        isDragging ? "opacity-40" : "",
        !g.group.enabled ? "opacity-50" : "",
        isDropTarget && !isDragging ? "ring-2 ring-blue-400" : "",
      ].join(" ")}
    >
      {/* Group header */}
      {isEditing ? (
        <div
          ref={editFormRef}
          className="border-b border-gray-100 px-3 py-2"
        >
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3">
              <label className="w-8 shrink-0 text-xs text-gray-500">EN</label>
              <input
                ref={editEnInputRef}
                type="text"
                value={editEn}
                onChange={(e) => setEditEn(e.target.value)}
                className="flex-1 rounded border border-gray-200 px-2 py-0.5 text-xs font-semibold uppercase outline-none focus:ring-1 focus:ring-blue-400"
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmEdit();
                  if (e.key === "Escape") cancelEdit();
                }}
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="w-8 shrink-0 text-xs text-gray-500">JA</label>
              <input
                type="text"
                value={editJa}
                onChange={(e) => setEditJa(e.target.value)}
                className="flex-1 rounded border border-gray-200 px-2 py-0.5 text-xs font-semibold uppercase outline-none focus:ring-1 focus:ring-blue-400"
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmEdit();
                  if (e.key === "Escape") cancelEdit();
                }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1 border-b border-gray-100 px-3 py-2">
          <button
            type="button"
            ref={groupHandleRef as React.Ref<HTMLButtonElement>}
            className="cursor-grab touch-none text-gray-400 hover:text-gray-600"
          >
            <GripVertical className="size-4 shrink-0" />
          </button>
          <button
            type="button"
            onClick={startEditing}
            className="flex-1 truncate text-left text-xs font-semibold uppercase text-gray-500 hover:text-gray-800"
            title="Click to rename"
          >
            {groupLabel}
          </button>
          <Switch
            checked={g.group.enabled}
            onCheckedChange={(checked) =>
              onToggleGroupEnabled(g.group.id, checked)
            }
            className="shrink-0 scale-75"
          />
          <button
            type="button"
            onClick={() => onDeleteGroup(g.group.id)}
            className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
            title="Delete group"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      )}

      <ul className="flex flex-col gap-1 p-2">
        {g.items.map((item, itemIndex) => (
          <FooterItemRow
            key={item.id}
            item={item}
            itemIndex={itemIndex}
            groupId={g.group.id}
            documentTitleByContentId={documentTitleByContentId}
          />
        ))}
        {g.items.length === 0 && (
          <li className="text-foreground-light px-2 py-3 text-xs">No items</li>
        )}
      </ul>

      {/* Add link button / inline form */}
      <div className="border-t border-gray-100 px-2 pb-2 pt-1">
        {showAddLink ? (
          <div className="flex flex-col gap-1.5 pt-1">
            <input
              type="text"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="URL"
              className="w-full rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-400"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Escape") cancelAddLink();
              }}
            />
            <div className="flex items-center gap-3">
              <label className="w-8 shrink-0 text-xs text-gray-500">EN</label>
              <input
                type="text"
                value={linkEn}
                onChange={(e) => setLinkEn(e.target.value)}
                placeholder="English label"
                className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-400"
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmAddLink();
                  if (e.key === "Escape") cancelAddLink();
                }}
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="w-8 shrink-0 text-xs text-gray-500">JA</label>
              <input
                type="text"
                value={linkJa}
                onChange={(e) => setLinkJa(e.target.value)}
                placeholder="Japanese label"
                className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-400"
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmAddLink();
                  if (e.key === "Escape") cancelAddLink();
                }}
              />
            </div>
            <div className="flex items-center gap-1 pt-0.5">
              <Button
                type="button"
                size="slim"
                onClick={confirmAddLink}
                disabled={!linkUrl.trim() || !linkEn.trim()}
                className="h-6 text-xs"
              >
                <Check className="mr-1 size-3" />
                Add
              </Button>
              <Button
                type="button"
                size="slim"
                variant="outline"
                onClick={cancelAddLink}
                className="h-6 text-xs"
              >
                <X className="mr-1 size-3" />
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAddLink(true)}
            className="flex w-full items-center gap-1 rounded px-1 py-1 text-xs text-gray-400 hover:bg-gray-50 hover:text-gray-600"
          >
            <Plus className="size-3" />
            Add link
          </button>
        )}
      </div>
    </div>
  );
}

function FooterItemRow({
  item,
  itemIndex,
  groupId,
  documentTitleByContentId,
}: {
  item: NavigationItem;
  itemIndex: number;
  groupId: string;
  documentTitleByContentId: Map<string, string>;
}) {
  const { ref, handleRef, isDragSource } = useSortable({
    id: item.id,
    index: itemIndex,
    type: FOOTER_ITEM_TYPE,
    accept: [FOOTER_ITEM_TYPE],
    group: groupId,
    data: { type: FOOTER_ITEM_TYPE },
  });

  return (
    <li
      ref={ref as React.Ref<HTMLLIElement>}
      className={[
        "flex items-start gap-1 rounded px-1 py-1 hover:bg-gray-50",
        isDragSource ? "opacity-40" : "",
      ].join(" ")}
    >
      <button
        type="button"
        ref={handleRef as React.Ref<HTMLButtonElement>}
        className="cursor-grab touch-none text-gray-400 hover:text-gray-600"
      >
        <GripVertical className="size-3 shrink-0" />
      </button>
      <span className="min-w-0 flex-1 whitespace-normal break-words text-xs">
        {getFooterEditorItemLabel(item, documentTitleByContentId)}
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Footer drag overlay clones
// ---------------------------------------------------------------------------

function FooterGroupOverlay({
  g,
  documentTitleByContentId,
}: {
  g: FooterGroupWithItems;
  documentTitleByContentId: Map<string, string>;
}) {
  const groupLabel = g.group.label["en"] ?? g.group.label["ja"] ?? "";
  return (
    <div
      className={[
        "min-w-40 max-w-96 shrink-0 rounded-md bg-white shadow-lg ring-2 ring-blue-300",
        !g.group.enabled ? "opacity-50" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-1 border-b border-gray-100 px-3 py-2">
        <GripVertical className="size-4 shrink-0 text-gray-400" />
        <span className="flex-1 truncate text-xs font-semibold uppercase text-gray-500">
          {groupLabel}
        </span>
      </div>
      <ul className="flex flex-col gap-1 p-2">
        {g.items.map((item) => (
          <li
            key={item.id}
            className="flex items-start gap-1 rounded px-1 py-1"
          >
            <GripVertical className="size-3 shrink-0 text-gray-400" />
            <span className="min-w-0 flex-1 whitespace-normal break-words text-xs">
              {getFooterEditorItemLabel(item, documentTitleByContentId)}
            </span>
          </li>
        ))}
        {g.items.length === 0 && (
          <li className="text-foreground-light px-2 py-3 text-xs">No items</li>
        )}
      </ul>
    </div>
  );
}

function FooterItemOverlay({
  item,
  documentTitleByContentId,
}: {
  item: NavigationItem;
  documentTitleByContentId: Map<string, string>;
}) {
  return (
    <li className="flex items-start gap-1 rounded bg-white px-1 py-1 shadow-lg ring-2 ring-blue-300">
      <GripVertical className="size-3 shrink-0 text-gray-400" />
      <span className="min-w-0 flex-1 whitespace-normal break-words text-xs">
        {getFooterEditorItemLabel(item, documentTitleByContentId)}
      </span>
    </li>
  );
}

function FooterDocOverlay({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded bg-white px-2 py-1.5 text-xs shadow-lg ring-2 ring-blue-300">
      <GripVertical className="size-3 shrink-0 text-gray-400" />
      <span>{label}</span>
    </div>
  );
}
