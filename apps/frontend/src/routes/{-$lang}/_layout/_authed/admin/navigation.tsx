import { DragDropProvider, DragOverlay, useDroppable } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { move } from "@dnd-kit/helpers";
import { CollisionPriority } from "@dnd-kit/abstract";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { GripVertical } from "lucide-react";

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
  type FooterGroupId,
  type NavPriority,
  type NavigationItemId,
  type SiteNavigationConfig,
} from "@/config/site-navigation";
import { useTranslations } from "use-intl";
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
  parent: SiteNavigationConfig["items"][number];
  children: SiteNavigationConfig["items"];
};

type FooterGroupWithItems = {
  group: SiteNavigationConfig["footerGroups"][number];
  items: SiteNavigationConfig["items"];
};

// Record<groupId, itemIds[]> shape expected by move() for multi-list
type ItemsRecord = Record<string, string[]>;

// ---------------------------------------------------------------------------
// Route component
// ---------------------------------------------------------------------------

function RouteComponent() {
  const tNav = useTranslations("Navbar");
  const tFooter = useTranslations("Footer");
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
  // Navbar commit handlers — called from NavbarPreview with final state
  // ---------------------------------------------------------------------------

  function commitNavbarColumns(columns: NavbarColumn[]) {
    updateDraft((current) => {
      // Build new parentId and order for every navbar item from the local columns state
      const newItems = current.items.map((item) => {
        if (!item.navbar) return item;

        // Is this a top-level column?
        const colIndex = columns.findIndex((c) => c.parent.id === item.id);
        if (colIndex >= 0) {
          return {
            ...item,
            parentId: undefined,
            navbar: { ...item.navbar, order: (colIndex + 1) * 10 },
          };
        }

        // Is this a child?
        for (const col of columns) {
          const childIndex = col.children.findIndex((ch) => ch.id === item.id);
          if (childIndex >= 0) {
            return {
              ...item,
              parentId: col.parent.id as NavigationItemId,
              navbar: { ...item.navbar, order: (childIndex + 1) * 10 },
            };
          }
        }

        return item;
      });
      return { ...current, items: newItems };
    });
  }

  // ---------------------------------------------------------------------------
  // Footer commit handlers — called from FooterPreview with final state
  // ---------------------------------------------------------------------------

  function commitFooterGroups(groups: FooterGroupWithItems[]) {
    updateDraft((current) => {
      const newFooterGroups = current.footerGroups.map((fg) => {
        const idx = groups.findIndex((g) => g.group.id === fg.id);
        return idx >= 0 ? { ...fg, order: (idx + 1) * 10 } : fg;
      });

      const newItems = current.items.map((item) => {
        if (!item.footer) return item;
        for (const { group, items } of groups) {
          const itemIndex = items.findIndex((i) => i.id === item.id);
          if (itemIndex >= 0) {
            return {
              ...item,
              footer: {
                ...item.footer,
                groupId: group.id as FooterGroupId,
                order: (itemIndex + 1) * 10,
              },
            };
          }
        }
        return item;
      });

      return { ...current, footerGroups: newFooterGroups, items: newItems };
    });
  }

  function updateNavbarItemEnabled(id: NavigationItemId, enabled: boolean) {
    updateDraft((current) => ({
      ...current,
      items: current.items.map((entry) =>
        entry.id === id && entry.navbar
          ? { ...entry, navbar: { ...entry.navbar, enabled } }
          : entry,
      ),
    }));
  }

  function updateNavbarItemPriority(
    id: NavigationItemId,
    priority: NavPriority,
  ) {
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
  const sortedFooterGroups = draft.footerGroups
    .slice()
    .sort((a, b) => a.order - b.order);

  const topLevelNavbarItems = draft.items
    .filter((item) => item.navbar && !item.parentId)
    .slice()
    .sort((a, b) => (a.navbar?.order ?? 0) - (b.navbar?.order ?? 0));

  const navbarColumns: NavbarColumn[] = topLevelNavbarItems.map((parent) => ({
    parent,
    children: draft.items
      .filter((item) => item.parentId === parent.id && item.navbar)
      .slice()
      .sort((a, b) => (a.navbar?.order ?? 0) - (b.navbar?.order ?? 0)),
  }));

  const footerGroups: FooterGroupWithItems[] = sortedFooterGroups.map(
    (group) => ({
      group,
      items: draft.items
        .filter((item) => item.footer?.groupId === group.id)
        .slice()
        .sort((a, b) => (a.footer?.order ?? 0) - (b.footer?.order ?? 0)),
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
            Labels come from translation keys. This editor changes ordering,
            visibility, priority, and footer grouping.
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
                tNav={tNav}
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
              reassign.
            </p>
            <div className="mt-4">
              <FooterPreview
                groups={footerGroups}
                tFooter={tFooter}
                tNav={tNav}
                onCommit={commitFooterGroups}
                onToggleGroupEnabled={(groupId, enabled) => {
                  updateDraft((current) => ({
                    ...current,
                    footerGroups: current.footerGroups.map((g) =>
                      g.id === groupId ? { ...g, enabled } : g,
                    ),
                  }));
                }}
                onToggleItemEnabled={(itemId, enabled) => {
                  updateDraft((current) => ({
                    ...current,
                    items: current.items.map((item) =>
                      item.id === itemId && item.footer
                        ? { ...item, footer: { ...item.footer, enabled } }
                        : item,
                    ),
                  }));
                }}
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
  tNav,
  onCommit,
  onToggleEnabled,
  onChangePriority,
}: {
  columns: NavbarColumn[];
  tNav: ReturnType<typeof useTranslations>;
  onCommit: (columns: NavbarColumn[]) => void;
  onToggleEnabled: (id: NavigationItemId, enabled: boolean) => void;
  onChangePriority: (id: NavigationItemId, priority: NavPriority) => void;
}) {
  // Local state for optimistic live reorder
  const [columns, setColumns] = useState<NavbarColumn[]>(columnsProp);
  const isDraggingRef = useRef(false);
  const snapshotRef = useRef<NavbarColumn[]>(columnsProp);

  // Track what is being dragged for the overlay
  const [draggingColumnId, setDraggingColumnId] = useState<string | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);

  // Sync from parent when not dragging (e.g. after save/reset)
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

  // Build items record for move(): { [columnId]: [childId, ...] }
  // Column order is tracked as an array of column ids under a special "_columns" key
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
      parent: parentById.get(colId as NavigationItemId)!,
      children: (record[colId] ?? [])
        .map((childId) => childById.get(childId as NavigationItemId)!)
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

        // Commit the final local state to the parent draft
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
            tNav={tNav}
            isDragging={draggingColumnId === col.parent.id}
            onToggleEnabled={onToggleEnabled}
            onChangePriority={onChangePriority}
          />
        ))}
      </div>

      <DragOverlay>
        {draggingColumn ? (
          <NavbarColumnOverlay col={draggingColumn} tNav={tNav} />
        ) : draggingItem ? (
          <NavbarItemOverlay item={draggingItem} tNav={tNav} />
        ) : null}
      </DragOverlay>
    </DragDropProvider>
  );
}

function NavbarColumnCard({
  col,
  colIndex,
  totalColumns,
  tNav,
  isDragging,
  onToggleEnabled,
  onChangePriority,
}: {
  col: NavbarColumn;
  colIndex: number;
  totalColumns: number;
  tNav: ReturnType<typeof useTranslations>;
  isDragging: boolean;
  onToggleEnabled: (id: NavigationItemId, enabled: boolean) => void;
  onChangePriority: (id: NavigationItemId, priority: NavPriority) => void;
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
  const isProtected = col.parent.id === "home";

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
      {/* Column header */}
      <div className="flex flex-col gap-2 border-b border-gray-100 px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            ref={columnHandleRef as React.Ref<HTMLButtonElement>}
            className="cursor-grab touch-none text-gray-400 hover:text-gray-600"
          >
            <GripVertical className="size-4 shrink-0" />
          </button>
          <span className="min-w-0 truncate text-sm font-semibold">
            {tNav(col.parent.id as NavigationItemId)}
          </span>
          <Switch
            checked={enabled}
            disabled={isProtected}
            onCheckedChange={(checked) =>
              onToggleEnabled(col.parent.id as NavigationItemId, checked)
            }
            className="shrink-0 scale-75"
          />
        </div>
        <Select
          value={priority}
          onValueChange={(value) =>
            onChangePriority(
              col.parent.id as NavigationItemId,
              value as NavPriority,
            )
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

      {/* Child items */}
      <ul className="flex flex-col gap-1 p-2">
        {col.children.map((child, childIndex) => (
          <NavbarChildItem
            key={child.id}
            item={child}
            childIndex={childIndex}
            groupId={col.parent.id}
            tNav={tNav}
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
  tNav,
  onToggleEnabled,
}: {
  item: SiteNavigationConfig["items"][number];
  childIndex: number;
  groupId: string;
  tNav: ReturnType<typeof useTranslations>;
  onToggleEnabled: (id: NavigationItemId, enabled: boolean) => void;
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
        {tNav(item.id as NavigationItemId)}
      </span>
      <Switch
        checked={enabled}
        onCheckedChange={(checked) =>
          onToggleEnabled(item.id as NavigationItemId, checked)
        }
        className="shrink-0 scale-75"
      />
    </li>
  );
}

// ---------------------------------------------------------------------------
// Navbar drag overlay clones
// ---------------------------------------------------------------------------

function NavbarColumnOverlay({
  col,
  tNav,
}: {
  col: NavbarColumn;
  tNav: ReturnType<typeof useTranslations>;
}) {
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
            {tNav(col.parent.id as NavigationItemId)}
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
              {tNav(child.id as NavigationItemId)}
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

function NavbarItemOverlay({
  item,
  tNav,
}: {
  item: SiteNavigationConfig["items"][number];
  tNav: ReturnType<typeof useTranslations>;
}) {
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
        {tNav(item.id as NavigationItemId)}
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
  tFooter,
  tNav,
  onCommit,
  onToggleGroupEnabled,
  onToggleItemEnabled,
}: {
  groups: FooterGroupWithItems[];
  tFooter: ReturnType<typeof useTranslations>;
  tNav: ReturnType<typeof useTranslations>;
  onCommit: (groups: FooterGroupWithItems[]) => void;
  onToggleGroupEnabled: (groupId: string, enabled: boolean) => void;
  onToggleItemEnabled: (itemId: NavigationItemId, enabled: boolean) => void;
}) {
  const [groups, setGroups] = useState<FooterGroupWithItems[]>(groupsProp);
  const isDraggingRef = useRef(false);
  const snapshotRef = useRef<FooterGroupWithItems[]>(groupsProp);

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
      group: groupById.get(groupId as FooterGroupId)!,
      items: (record[groupId] ?? [])
        .map((itemId) => itemById.get(itemId as NavigationItemId)!)
        .filter(Boolean),
    }));
  }

  return (
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
            tFooter={tFooter}
            tNav={tNav}
            isDragging={draggingGroupId === g.group.id}
            onToggleGroupEnabled={onToggleGroupEnabled}
            onToggleItemEnabled={onToggleItemEnabled}
          />
        ))}
      </div>

      <DragOverlay>
        {draggingGroup ? (
          <FooterGroupOverlay g={draggingGroup} tFooter={tFooter} tNav={tNav} />
        ) : draggingItem ? (
          <FooterItemOverlay item={draggingItem} tNav={tNav} />
        ) : null}
      </DragOverlay>
    </DragDropProvider>
  );
}

function FooterGroupColumn({
  g,
  groupIndex,
  tFooter,
  tNav,
  isDragging,
  onToggleGroupEnabled,
  onToggleItemEnabled,
}: {
  g: FooterGroupWithItems;
  groupIndex: number;
  tFooter: ReturnType<typeof useTranslations>;
  tNav: ReturnType<typeof useTranslations>;
  isDragging: boolean;
  onToggleGroupEnabled: (groupId: string, enabled: boolean) => void;
  onToggleItemEnabled: (itemId: NavigationItemId, enabled: boolean) => void;
}) {
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

  return (
    <div
      ref={(el) => {
        groupSortRef(el);
        groupDropRef(el);
      }}
      className={[
        "min-w-32 max-w-96 shrink-0 rounded-md bg-white shadow-sm ring-1 ring-gray-200 transition-opacity",
        isDragging ? "opacity-40" : "",
        !g.group.enabled ? "opacity-50" : "",
        isDropTarget && !isDragging ? "ring-2 ring-blue-400" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-1 border-b border-gray-100 px-3 py-2">
        <button
          type="button"
          ref={groupHandleRef as React.Ref<HTMLButtonElement>}
          className="cursor-grab touch-none text-gray-400 hover:text-gray-600"
        >
          <GripVertical className="size-4 shrink-0" />
        </button>
        <span className="flex-1 truncate text-xs font-semibold uppercase text-gray-500">
          {tFooter(g.group.labelKey)}
        </span>
        <Switch
          checked={g.group.enabled}
          disabled={g.group.id === "overview"}
          onCheckedChange={(checked) =>
            onToggleGroupEnabled(g.group.id, checked)
          }
          className="shrink-0 scale-75"
        />
      </div>

      <ul className="flex flex-col gap-1 p-2">
        {g.items.map((item, itemIndex) => (
          <FooterItemRow
            key={item.id}
            item={item}
            itemIndex={itemIndex}
            groupId={g.group.id}
            tNav={tNav}
            onToggleEnabled={onToggleItemEnabled}
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
  tNav,
  onToggleEnabled,
}: {
  item: SiteNavigationConfig["items"][number];
  itemIndex: number;
  groupId: string;
  tNav: ReturnType<typeof useTranslations>;
  onToggleEnabled: (itemId: NavigationItemId, enabled: boolean) => void;
}) {
  const { ref, handleRef, isDragSource } = useSortable({
    id: item.id,
    index: itemIndex,
    type: FOOTER_ITEM_TYPE,
    accept: [FOOTER_ITEM_TYPE],
    group: groupId,
    data: { type: FOOTER_ITEM_TYPE },
  });

  const enabled = item.footer?.enabled ?? true;

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
        {tNav(item.id as NavigationItemId)}
      </span>
      <Switch
        checked={enabled}
        disabled={item.id === "home"}
        onCheckedChange={(checked) =>
          onToggleEnabled(item.id as NavigationItemId, checked)
        }
        className="shrink-0 scale-75"
      />
    </li>
  );
}

// ---------------------------------------------------------------------------
// Footer drag overlay clones
// ---------------------------------------------------------------------------

function FooterGroupOverlay({
  g,
  tFooter,
  tNav,
}: {
  g: FooterGroupWithItems;
  tFooter: ReturnType<typeof useTranslations>;
  tNav: ReturnType<typeof useTranslations>;
}) {
  return (
    <div
      className={[
        "min-w-32 max-w-96 shrink-0 rounded-md bg-white shadow-lg ring-2 ring-blue-300",
        !g.group.enabled ? "opacity-50" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-1 border-b border-gray-100 px-3 py-2">
        <GripVertical className="size-4 shrink-0 text-gray-400" />
        <span className="flex-1 truncate text-xs font-semibold uppercase text-gray-500">
          {tFooter(g.group.labelKey)}
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
              {tNav(item.id as NavigationItemId)}
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
  tNav,
}: {
  item: SiteNavigationConfig["items"][number];
  tNav: ReturnType<typeof useTranslations>;
}) {
  const enabled = item.footer?.enabled ?? true;
  return (
    <li
      className={[
        "flex items-start gap-1 rounded bg-white px-1 py-1 shadow-lg ring-2 ring-blue-300",
        !enabled ? "opacity-50" : "",
      ].join(" ")}
    >
      <GripVertical className="size-3 shrink-0 text-gray-400" />
      <span className="min-w-0 flex-1 whitespace-normal break-words text-xs">
        {tNav(item.id as NavigationItemId)}
      </span>
    </li>
  );
}
