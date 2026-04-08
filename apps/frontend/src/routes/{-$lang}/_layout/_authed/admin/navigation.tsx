import { DragDropProvider, DragOverlay, useDroppable } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { move } from "@dnd-kit/helpers";
import { CollisionPriority } from "@dnd-kit/abstract";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { GripVertical, Plus, Trash2, Check, X } from "lucide-react";

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
import {
  $resetSiteNavigationConfig,
  $saveSiteNavigationConfig,
  getSiteNavigationConfigQueryOptions,
} from "@/serverFunctions/siteNavigation";
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
    return item.label["en"] ?? item.label["ja"] ?? item.contentId ?? item.url ?? item.id;
  }
  return item.contentId ?? item.url ?? item.id;
}

// ---------------------------------------------------------------------------
// Route component
// ---------------------------------------------------------------------------

function RouteComponent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    data,
    error: queryError,
    isError,
    isPending,
    refetch,
  } = useQuery(getSiteNavigationConfigQueryOptions());
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

  function renameFooterGroup(groupId: string, label: { en: string; ja: string }) {
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
                onCommit={commitFooterGroups}
                onToggleGroupEnabled={toggleFooterGroupEnabled}
                onRenameGroup={renameFooterGroup}
                onDeleteGroup={deleteFooterGroup}
                onAddGroup={addFooterGroup}
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
            totalColumns={columns.length}
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
  totalColumns,
  isDragging,
  onToggleEnabled,
  onChangePriority,
}: {
  col: NavbarColumn;
  colIndex: number;
  totalColumns: number;
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
  const isHomeItem = col.parent.type === "document" && col.parent.contentId === "home";

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
// Footer preview — multi-sortable-list using @dnd-kit/react v1
// ---------------------------------------------------------------------------

const FOOTER_GROUP_TYPE = "footer-group";
const FOOTER_ITEM_TYPE = "footer-item";

function FooterPreview({
  groups: groupsProp,
  onCommit,
  onToggleGroupEnabled,
  onRenameGroup,
  onDeleteGroup,
  onAddGroup,
}: {
  groups: FooterGroupWithItems[];
  onCommit: (groups: FooterGroupWithItems[]) => void;
  onToggleGroupEnabled: (groupId: string, enabled: boolean) => void;
  onRenameGroup: (groupId: string, label: { en: string; ja: string }) => void;
  onDeleteGroup: (groupId: string) => void;
  onAddGroup: (label: { en: string; ja: string }) => void;
}) {
  const [groups, setGroups] = useState<FooterGroupWithItems[]>(groupsProp);
  const isDraggingRef = useRef(false);
  const snapshotRef = useRef<FooterGroupWithItems[]>(groupsProp);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabelEn, setNewLabelEn] = useState("");
  const [newLabelJa, setNewLabelJa] = useState("");

  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);

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
          }
        }}
        onDragOver={(event) => {
          const src = event.operation.source;
          if (!src) return;
          setGroups((prev) => {
            const record = buildItemsRecord(prev);
            const next = move(record, event);
            return applyItemsRecord(next as ItemsRecord, prev);
          });
        }}
        onDragEnd={(event) => {
          setDraggingGroupId(null);
          setDraggingItemId(null);
          isDraggingRef.current = false;

          if (event.canceled) {
            setGroups(snapshotRef.current);
            return;
          }

          setGroups((finalGroups) => {
            onCommit(finalGroups);
            return finalGroups;
          });
        }}
      >
        <div className="flex flex-wrap gap-4">
          {groups.map((g, groupIndex) => (
            <FooterGroupColumn
              key={g.group.id}
              g={g}
              groupIndex={groupIndex}
              isDragging={draggingGroupId === g.group.id}
              onToggleGroupEnabled={onToggleGroupEnabled}
              onRenameGroup={onRenameGroup}
              onDeleteGroup={onDeleteGroup}
            />
          ))}
        </div>

        <DragOverlay>
          {draggingGroup ? (
            <FooterGroupOverlay g={draggingGroup} />
          ) : draggingItem ? (
            <FooterItemOverlay item={draggingItem} />
          ) : null}
        </DragOverlay>
      </DragDropProvider>

      {/* Add group */}
      {showAddForm ? (
        <div className="rounded-md border border-gray-200 bg-white p-3 shadow-sm">
          <p className="mb-2 text-xs font-medium text-gray-600">New group</p>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <label className="w-6 shrink-0 text-xs text-gray-500">EN</label>
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
            <div className="flex items-center gap-2">
              <label className="w-6 shrink-0 text-xs text-gray-500">JA</label>
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
// Footer group column with inline rename
// ---------------------------------------------------------------------------

function FooterGroupColumn({
  g,
  groupIndex,
  isDragging,
  onToggleGroupEnabled,
  onRenameGroup,
  onDeleteGroup,
}: {
  g: FooterGroupWithItems;
  groupIndex: number;
  isDragging: boolean;
  onToggleGroupEnabled: (groupId: string, enabled: boolean) => void;
  onRenameGroup: (groupId: string, label: { en: string; ja: string }) => void;
  onDeleteGroup: (groupId: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editEn, setEditEn] = useState("");
  const [editJa, setEditJa] = useState("");

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
        <div className="border-b border-gray-100 px-3 py-2">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <label className="w-5 shrink-0 text-xs text-gray-500">EN</label>
              <input
                type="text"
                value={editEn}
                onChange={(e) => setEditEn(e.target.value)}
                className="flex-1 rounded border border-gray-200 px-2 py-0.5 text-xs font-semibold uppercase outline-none focus:ring-1 focus:ring-blue-400"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmEdit();
                  if (e.key === "Escape") cancelEdit();
                }}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="w-5 shrink-0 text-xs text-gray-500">JA</label>
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
            <div className="flex items-center gap-1 pt-0.5">
              <button
                type="button"
                onClick={confirmEdit}
                disabled={!editEn.trim()}
                className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs text-green-700 hover:bg-green-50 disabled:opacity-40"
              >
                <Check className="size-3" />
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-50"
              >
                <X className="size-3" />
              </button>
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
          />
        ))}
        {g.items.length === 0 && (
          <li className="text-foreground-light px-2 py-3 text-xs">No items</li>
        )}
      </ul>
    </div>
  );
}

function FooterItemRow({
  item,
  itemIndex,
  groupId,
}: {
  item: NavigationItem;
  itemIndex: number;
  groupId: string;
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
        {getItemLabel(item)}
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Footer drag overlay clones
// ---------------------------------------------------------------------------

function FooterGroupOverlay({ g }: { g: FooterGroupWithItems }) {
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
              {getItemLabel(item)}
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

function FooterItemOverlay({ item }: { item: NavigationItem }) {
  return (
    <li className="flex items-start gap-1 rounded bg-white px-1 py-1 shadow-lg ring-2 ring-blue-300">
      <GripVertical className="size-3 shrink-0 text-gray-400" />
      <span className="min-w-0 flex-1 whitespace-normal break-words text-xs">
        {getItemLabel(item)}
      </span>
    </li>
  );
}
