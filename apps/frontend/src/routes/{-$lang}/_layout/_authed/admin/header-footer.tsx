import { DragDropProvider, DragOverlay, useDroppable } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { move } from "@dnd-kit/helpers";
import { CollisionPriority } from "@dnd-kit/abstract";
import {
  createFileRoute,
  useRouteContext,
  useRouter,
} from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Ref, useEffect, useRef, useState } from "react";
import {
  GripVertical,
  Plus,
  Trash2,
  Check,
  X,
  Link2,
  FileText,
} from "lucide-react";

import { Card } from "@/components/Card";
import { LocaleInlineEditor } from "@/components/LocaleInlineEditor";
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
  deriveNavbarCommittedGroups,
  mergeCommittedNavbarGroups,
  type NavbarCommittedGroup,
} from "@/config/site-navigation-admin";
import { type Locale } from "@/config/i18n";
import {
  normalizeSiteNavigationConfig,
  siteNavigationConfigSchema,
} from "@/config/site-navigation.schema";
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
import { AdminStatusMessage } from "./-components/AdminStatusMessage";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_authed/admin/header-footer",
)({
  component: RouteComponent,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NavbarGroupWithItems = NavbarCommittedGroup;

type FooterGroupWithItems = {
  group: NavigationGroup;
  items: Array<{
    item: NavigationItem;
    enabled: boolean;
  }>;
};

// Record<groupId, itemIds[]> shape expected by move() for multi-list
type ItemsRecord = Record<string, string[]>;

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------

function getDocumentLabel(
  doc: DocumentsListItemResponse,
  lang?: Locale,
): string {
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

function getEditorItemLabel(
  item: NavigationItem,
  lang: Locale,
  documentTitleByContentId: Map<string, string>,
): string {
  if (item.type === "document") {
    // Prefer lookup by stable UUID so renames are reflected immediately
    const key = item.documentId ?? item.contentId;
    if (key) return documentTitleByContentId.get(key) ?? item.contentId ?? key;
  }

  if (item.label) {
    return item.label[lang] ?? item.label["en"] ?? item.url ?? item.id;
  }

  return item.url ?? item.id;
}

function getEditorItemPath(
  item: NavigationItem,
  documentPathById: Map<string, string>,
): string | undefined {
  if (item.type === "document") {
    if (item.documentId) {
      return documentPathById.get(item.documentId) ?? item.contentId;
    }
    return item.contentId;
  }

  return item.url;
}

function NavigationItemLeadingIcon({ item }: { item: NavigationItem }) {
  if (item.type === "document") {
    return <FileText className="mt-0.5 size-3 shrink-0 text-sky-600" />;
  }

  return <Link2 className="mt-0.5 size-3 shrink-0 text-amber-600" />;
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
    setDraft(normalizeSiteNavigationConfig(data.config));
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
            <p className="text-danger text-sm font-medium">
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

  const isDirty = !deepEqual(
    normalizeSiteNavigationConfig(draft),
    normalizeSiteNavigationConfig(data.config),
  );

  async function refreshNavigation() {
    await queryClient.invalidateQueries({ queryKey: ["site-navigation"] });
    await router.invalidate();
  }

  async function handleSave() {
    if (!draft) return;
    setMessage(null);
    setError(null);
    const normalizedDraft = normalizeSiteNavigationConfig(draft);
    const validation = siteNavigationConfigSchema.safeParse(normalizedDraft);
    if (!validation.success) {
      setError(
        validation.error.issues[0]?.message ?? "Navigation config is invalid.",
      );
      return;
    }
    const result = await saveConfig(normalizedDraft);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDraft(normalizeSiteNavigationConfig(result.data.config));
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
    setDraft(normalizeSiteNavigationConfig(result.data.config));
    setRevision(result.data.revision);
    setMessage("Navigation reset to default.");
    await refreshNavigation();
  }

  function handleResetToSaved() {
    if (!data) return;
    setDraft(normalizeSiteNavigationConfig(data.config));
    setRevision(data.revision);
    setMessage(null);
    setError(null);
  }

  function updateDraft(
    updater: (current: SiteNavigationConfig) => SiteNavigationConfig,
  ) {
    setDraft((current) => (current ? updater(current) : current));
  }

  // ---------------------------------------------------------------------------
  // Navbar commit handlers
  // ---------------------------------------------------------------------------

  function commitNavbarGroups(navGroups: NavbarGroupWithItems[]) {
    updateDraft((current) => mergeCommittedNavbarGroups(current, navGroups));
  }

  function addNavbarGroup(label: { en: string; ja: string }) {
    const id = crypto.randomUUID();
    updateDraft((current) => ({
      ...current,
      zones: {
        ...current.zones,
        navbar: {
          groups: [
            ...current.zones.navbar.groups,
            {
              id,
              label,
              enabled: false,
              priority: "important" as const,
              items: [],
            },
          ],
        },
      },
    }));
  }

  function renameNavbarGroup(
    groupId: string,
    label: { en: string; ja: string },
  ) {
    updateDraft((current) => ({
      ...current,
      zones: {
        ...current.zones,
        navbar: {
          groups: current.zones.navbar.groups.map((g) =>
            g.id === groupId ? { ...g, label } : g,
          ),
        },
      },
    }));
  }

  function deleteNavbarGroup(groupId: string) {
    updateDraft((current) => ({
      ...current,
      zones: {
        ...current.zones,
        navbar: {
          groups: current.zones.navbar.groups.filter((g) => g.id !== groupId),
        },
      },
    }));
  }

  function toggleNavbarGroupEnabled(groupId: string, enabled: boolean) {
    updateDraft((current) => ({
      ...current,
      zones: {
        ...current.zones,
        navbar: {
          groups: current.zones.navbar.groups.map((g) =>
            g.id === groupId
              ? { ...g, enabled: enabled ? g.items.length > 0 : false }
              : g,
          ),
        },
      },
    }));
  }

  function updateNavbarGroupPriority(groupId: string, priority: NavPriority) {
    updateDraft((current) => ({
      ...current,
      zones: {
        ...current.zones,
        navbar: {
          groups: current.zones.navbar.groups.map((g) =>
            g.id === groupId ? { ...g, priority } : g,
          ),
        },
      },
    }));
  }

  function assignDocumentToNavbarGroup(
    contentId: string,
    groupId: string,
    documentId?: string,
  ) {
    const resolvedDocumentId =
      documentId ?? documents.find((d) => d.contentId === contentId)?.id;
    updateDraft((current) => {
      const existingItem = current.items.find(
        (i) =>
          i.type === "document" &&
          ((resolvedDocumentId && i.documentId === resolvedDocumentId) ||
            i.contentId === contentId),
      );
      const itemId = existingItem?.id ?? crypto.randomUUID();

      const newItems = existingItem
        ? current.items.map((item) =>
            item.id === existingItem.id
              ? {
                  ...item,
                  ...(resolvedDocumentId
                    ? { documentId: resolvedDocumentId }
                    : { contentId }),
                }
              : item,
          )
        : [
            ...current.items,
            {
              id: itemId,
              type: "document" as const,
              ...(resolvedDocumentId
                ? { documentId: resolvedDocumentId }
                : { contentId }),
            },
          ];

      // Remove from any navbar group
      const newGroups = current.zones.navbar.groups.map((g) => ({
        ...g,
        items: g.items.filter((ref) => ref.id !== itemId),
      }));

      // Add to target group
      const targetGroups = newGroups.map((g) =>
        g.id === groupId
          ? { ...g, items: [...g.items, { id: itemId, enabled: true }] }
          : g,
      );

      return {
        ...current,
        items: newItems,
        zones: { ...current.zones, navbar: { groups: targetGroups } },
      };
    });
  }

  function removeItemFromNavbarGroup(itemId: string, groupId: string) {
    updateDraft((current) => ({
      ...current,
      zones: {
        ...current.zones,
        navbar: {
          groups: current.zones.navbar.groups.map((g) =>
            g.id === groupId
              ? { ...g, items: g.items.filter((ref) => ref.id !== itemId) }
              : g,
          ),
        },
      },
    }));
  }

  function toggleNavbarItemEnabled(
    itemId: string,
    groupId: string,
    enabled: boolean,
  ) {
    updateDraft((current) => ({
      ...current,
      zones: {
        ...current.zones,
        navbar: {
          groups: current.zones.navbar.groups.map((g) =>
            g.id === groupId
              ? {
                  ...g,
                  items: g.items.map((ref) =>
                    ref.id === itemId ? { ...ref, enabled } : ref,
                  ),
                }
              : g,
          ),
        },
      },
    }));
  }

  function addLinkItemToNavbarGroup(
    groupId: string,
    url: string,
    label: { en: string; ja: string },
  ) {
    const id = crypto.randomUUID();
    updateDraft((current) => ({
      ...current,
      items: [...current.items, { id, type: "link" as const, url, label }],
      zones: {
        ...current.zones,
        navbar: {
          groups: current.zones.navbar.groups.map((g) =>
            g.id === groupId
              ? { ...g, items: [...g.items, { id, enabled: true }] }
              : g,
          ),
        },
      },
    }));
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

      const updatedGroups = groups.map((g) => ({
        ...g.group,
        items: g.items.map(({ item, enabled }) => ({
          id: item.id,
          enabled,
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
    updateDraft((current) => ({
      ...current,
      zones: {
        ...current.zones,
        footer: {
          groups: [
            ...current.zones.footer.groups,
            { id, label, enabled: true, items: [] },
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

  function assignDocumentToGroup(
    contentId: string,
    groupId: string,
    documentId?: string,
  ) {
    const resolvedDocumentId =
      documentId ?? documents.find((d) => d.contentId === contentId)?.id;
    updateDraft((current) => {
      // Find existing NavigationItem for this document, or create one
      const existingItem = current.items.find(
        (i) =>
          i.type === "document" &&
          ((resolvedDocumentId && i.documentId === resolvedDocumentId) ||
            i.contentId === contentId),
      );
      const itemId = existingItem?.id ?? crypto.randomUUID();

      let newItems = existingItem
        ? current.items.map((item) =>
            item.id === existingItem.id
              ? {
                  ...item,
                  ...(resolvedDocumentId
                    ? { documentId: resolvedDocumentId }
                    : { contentId }),
                }
              : item,
          )
        : [
            ...current.items,
            {
              id: itemId,
              type: "document" as const,
              ...(resolvedDocumentId
                ? { documentId: resolvedDocumentId }
                : { contentId }),
            },
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
          items: [...g.items, { id: itemId, enabled: true }],
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
          items: [...g.items, { id, enabled: true }],
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

  function updateLinkItem(
    itemId: string,
    value: { url: string; label: { en: string; ja: string } },
  ) {
    updateDraft((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.id === itemId && item.type === "link"
          ? { ...item, url: value.url, label: value.label }
          : item,
      ),
    }));
  }

  function removeFooterItem(itemId: string) {
    updateDraft((current) => ({
      ...current,
      zones: {
        ...current.zones,
        footer: {
          groups: current.zones.footer.groups.map((group) => ({
            ...group,
            items: group.items.filter((ref) => ref.id !== itemId),
          })),
        },
      },
    }));
  }

  function toggleFooterItemEnabled(itemId: string, enabled: boolean) {
    updateDraft((current) => ({
      ...current,
      zones: {
        ...current.zones,
        footer: {
          groups: current.zones.footer.groups.map((group) => ({
            ...group,
            items: group.items.map((ref) =>
              ref.id === itemId ? { ...ref, enabled } : ref,
            ),
          })),
        },
      },
    }));
  }

  function createUnassignedLinkItem(
    url: string,
    label: { en: string; ja: string },
  ) {
    const id = crypto.randomUUID();
    updateDraft((current) => ({
      ...current,
      items: [...current.items, { id, type: "link" as const, url, label }],
    }));
  }

  function deleteLinkItem(itemId: string) {
    updateDraft((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== itemId),
      zones: {
        ...current.zones,
        footer: {
          groups: current.zones.footer.groups.map((group) => ({
            ...group,
            items: group.items.filter((ref) => ref.id !== itemId),
          })),
        },
        navbar: {
          groups: current.zones.navbar.groups.map((group) => ({
            ...group,
            items: group.items.filter((ref) => ref.id !== itemId),
          })),
        },
      },
    }));
  }

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const itemById = new Map(draft.items.map((i) => [i.id, i]));

  function resolveGroupItems(
    group: NavigationGroup,
  ): Array<{ item: NavigationItem; enabled: boolean }> {
    return group.items
      .map((ref) => {
        const item = itemById.get(ref.id);
        return item ? { item, enabled: ref.enabled !== false } : undefined;
      })
      .filter(
        (e): e is { item: NavigationItem; enabled: boolean } => e !== undefined,
      );
  }

  const navbarGroups: NavbarGroupWithItems[] =
    deriveNavbarCommittedGroups(draft);

  const footerGroups: FooterGroupWithItems[] = draft.zones.footer.groups.map(
    (group) => ({
      group,
      items: resolveGroupItems(group),
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
            variant="outline"
            onClick={handleResetToSaved}
            disabled={!isDirty || isSaving || isResetting}
          >
            Reset
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
        <AdminStatusMessage variant="success" className="mx-5 mt-4">
          {message}
        </AdminStatusMessage>
      ) : null}

      {error ? (
        <AdminStatusMessage className="mx-5 mt-4">{error}</AdminStatusMessage>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-5 px-5 pt-5 pb-5">
          {/* Navbar preview */}
          <section className="rounded-md border border-gray-200 p-4">
            <h2 className="text-base font-medium">Navbar</h2>
            <p className="text-foreground-light mt-1 text-sm">
              Drag groups to reorder. Drag items between groups to reassign.
            </p>
            <div className="mt-4">
              <NavbarPreview
                groups={navbarGroups}
                allItems={draft.items}
                documents={documents}
                lang={lang}
                onCommit={commitNavbarGroups}
                onToggleGroupEnabled={toggleNavbarGroupEnabled}
                onChangePriority={updateNavbarGroupPriority}
                onRenameGroup={renameNavbarGroup}
                onDeleteGroup={deleteNavbarGroup}
                onAddGroup={addNavbarGroup}
                onDeleteLinkItem={deleteLinkItem}
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
                onCreateUnassignedLinkItem={createUnassignedLinkItem}
                onDeleteLinkItem={deleteLinkItem}
                onUpdateLinkLabel={updateLinkItem}
                onRemoveItem={removeFooterItem}
                onToggleItemEnabled={toggleFooterItemEnabled}
              />
            </div>
          </section>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Navbar preview — group-based layout mirroring FooterPreview
// ---------------------------------------------------------------------------

const NAVBAR_GROUP_TYPE = "navbar-group";
const NAVBAR_ASSIGNED_ITEM_TYPE = "navbar-assigned-item";
const NAVBAR_UNASSIGNED_DOC_TYPE = "navbar-unassigned-doc";
const NAVBAR_UNASSIGNED_LINK_TYPE = "navbar-unassigned-link";
const NAVBAR_UNASSIGNED_POOL_ID = "__navbar-pool__";

function getNavbarGroupSortId(groupId: string): string {
  return `navbar-group:${groupId}`;
}

function getNavbarGroupLinkedSlotId(groupId: string): string {
  return `navbar-group-linked:${groupId}`;
}

function getNavbarGroupSubItemsId(groupId: string): string {
  return `navbar-group-sub:${groupId}`;
}

function parseNavbarGroupLinkedSlotId(value: string): string | null {
  return value.startsWith("navbar-group-linked:")
    ? value.slice("navbar-group-linked:".length)
    : null;
}

function parseNavbarGroupSubItemsId(value: string): string | null {
  return value.startsWith("navbar-group-sub:")
    ? value.slice("navbar-group-sub:".length)
    : null;
}

function updateNavbarAssignedItem(
  currentGroups: NavbarGroupWithItems[],
  itemId: string,
  updater: (
    item: NavbarGroupWithItems["subItems"][number],
  ) => NavbarGroupWithItems["subItems"][number],
): NavbarGroupWithItems[] {
  return currentGroups.map((group) => ({
    ...group,
    subItems: group.subItems.map((item) =>
      item.item.id === itemId ? updater(item) : item,
    ),
  }));
}

function removeNavbarAssignedItem(
  currentGroups: NavbarGroupWithItems[],
  itemId: string,
): NavbarGroupWithItems[] {
  return currentGroups.map((group) => ({
    ...group,
    ...(group.linkedItem?.item.id === itemId
      ? {
          linkedItem: undefined,
          group: { ...group.group, linkedItemId: undefined },
        }
      : {}),
    subItems: group.subItems.filter((item) => item.item.id !== itemId),
  }));
}

function NavbarPreview({
  groups: groupsProp,
  allItems,
  documents,
  lang,
  onCommit,
  onToggleGroupEnabled,
  onChangePriority,
  onRenameGroup,
  onDeleteGroup,
  onAddGroup,
  onDeleteLinkItem,
}: {
  groups: NavbarGroupWithItems[];
  allItems: NavigationItem[];
  documents: DocumentsListItemResponse[];
  lang: Locale;
  onCommit: (groups: NavbarGroupWithItems[]) => void;
  onToggleGroupEnabled: (groupId: string, enabled: boolean) => void;
  onChangePriority: (groupId: string, priority: NavPriority) => void;
  onRenameGroup: (groupId: string, label: { en: string; ja: string }) => void;
  onDeleteGroup: (groupId: string) => void;
  onAddGroup: (label: { en: string; ja: string }) => void;
  onDeleteLinkItem: (itemId: string) => void;
}) {
  const [groups, setGroups] = useState<NavbarGroupWithItems[]>(groupsProp);
  const isDraggingRef = useRef(false);
  const snapshotRef = useRef<NavbarGroupWithItems[]>(groupsProp);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabelEn, setNewLabelEn] = useState("");
  const [newLabelJa, setNewLabelJa] = useState("");

  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [draggingDocContentId, setDraggingDocContentId] = useState<
    string | null
  >(null);
  const [draggingLinkItemId, setDraggingLinkItemId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!isDraggingRef.current) {
      setGroups(groupsProp);
    }
  }, [groupsProp]);

  const draggingGroup = draggingGroupId
    ? (groups.find((g) => g.group.id === draggingGroupId) ?? null)
    : null;
  const draggingItem = draggingItemId
    ? (groups
        .flatMap((group) => [
          ...(group.linkedItem
            ? [{ item: group.linkedItem.item, enabled: true }]
            : []),
          ...group.subItems,
        ])
        .find((item) => item.item.id === draggingItemId) ?? null)
    : null;

  const assignedItemIds = new Set(
    groups.flatMap((group) => [
      ...(group.linkedItem ? [group.linkedItem.item.id] : []),
      ...group.subItems.map((item) => item.item.id),
    ]),
  );

  const documentPathById = new Map(
    documents.map((doc) => [doc.id, doc.contentId] as const),
  );

  const docItemMap = new Map<string, NavigationItem>(
    allItems
      .filter((item) => item.type === "document")
      .flatMap((item) => [
        ...(item.documentId ? ([[item.documentId, item]] as const) : []),
        ...(item.contentId ? ([[item.contentId, item]] as const) : []),
      ]),
  );

  const unassignedLinkItems = allItems.filter(
    (item) => item.type === "link" && !assignedItemIds.has(item.id),
  );

  const documentTitleByContentId = new Map([
    ...documents.map(
      (doc) => [doc.contentId, getDocumentLabel(doc, lang)] as const,
    ),
    ...documents.map((doc) => [doc.id, getDocumentLabel(doc, lang)] as const),
  ]);

  function normalizeGroups(
    nextGroups: NavbarGroupWithItems[],
  ): NavbarGroupWithItems[] {
    return nextGroups.map((group) => ({
      ...group,
      group: {
        ...group.group,
        enabled: group.linkedItem ? group.group.enabled : false,
      },
    }));
  }

  function buildItemsRecord(gs: NavbarGroupWithItems[]): ItemsRecord {
    const record: ItemsRecord = {
      _groups: gs.map((g) => getNavbarGroupSortId(g.group.id)),
    };

    for (const group of gs) {
      record[getNavbarGroupLinkedSlotId(group.group.id)] = group.linkedItem
        ? [group.linkedItem.item.id]
        : [];
      record[getNavbarGroupSubItemsId(group.group.id)] = group.subItems.map(
        (item) => item.item.id,
      );
    }

    return record;
  }

  function applyItemsRecord(
    record: ItemsRecord,
    prevGroups: NavbarGroupWithItems[],
  ): NavbarGroupWithItems[] {
    const groupOrder = record["_groups"] as string[];
    const groupById = new Map(
      prevGroups.map((group) => [getNavbarGroupSortId(group.group.id), group]),
    );
    const itemById = new Map(
      prevGroups.flatMap((group) => [
        ...(group.linkedItem
          ? [
              [
                group.linkedItem.item.id,
                { item: group.linkedItem.item, enabled: true },
              ] as const,
            ]
          : []),
        ...group.subItems.map((item) => [item.item.id, item] as const),
      ]),
    );

    return groupOrder
      .map((groupSortId) => {
        const group = groupById.get(groupSortId);
        if (!group) return null;

        const linkedItemId =
          record[getNavbarGroupLinkedSlotId(group.group.id)]?.[0];
        const linkedItem = linkedItemId
          ? itemById.get(linkedItemId)
          : undefined;

        return {
          ...group,
          ...(linkedItem ? { linkedItem: { item: linkedItem.item } } : {}),
          ...(linkedItem ? {} : { linkedItem: undefined }),
          subItems: (record[getNavbarGroupSubItemsId(group.group.id)] ?? [])
            .map((itemId) => itemById.get(itemId))
            .filter(Boolean) as NavbarGroupWithItems["subItems"],
        };
      })
      .filter(Boolean) as NavbarGroupWithItems[];
  }

  function commitAndSet(nextGroups: NavbarGroupWithItems[]) {
    const normalizedGroups = normalizeGroups(nextGroups);
    setGroups(normalizedGroups);
    onCommit(normalizedGroups);
  }

  function findDropTarget(
    targetId: string,
    currentGroups: NavbarGroupWithItems[],
  ):
    | { kind: "pool" }
    | { kind: "linked"; groupId: string }
    | { kind: "sub"; groupId: string }
    | null {
    if (
      targetId === NAVBAR_UNASSIGNED_POOL_ID ||
      targetId === `${NAVBAR_UNASSIGNED_POOL_ID}-droppable`
    ) {
      return { kind: "pool" };
    }

    const linkedGroupId = parseNavbarGroupLinkedSlotId(targetId);
    if (linkedGroupId) {
      return { kind: "linked", groupId: linkedGroupId };
    }

    const subGroupId = parseNavbarGroupSubItemsId(targetId);
    if (subGroupId) {
      return { kind: "sub", groupId: subGroupId };
    }

    for (const group of currentGroups) {
      if (group.linkedItem?.item.id === targetId) {
        return { kind: "linked", groupId: group.group.id };
      }
      if (group.subItems.some((item) => item.item.id === targetId)) {
        return { kind: "sub", groupId: group.group.id };
      }
    }

    return null;
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
          if (src.data?.type === NAVBAR_GROUP_TYPE) {
            setDraggingGroupId(String(src.id));
          } else if (src.data?.type === NAVBAR_ASSIGNED_ITEM_TYPE) {
            setDraggingItemId(String(src.id));
          } else if (src.data?.type === NAVBAR_UNASSIGNED_DOC_TYPE) {
            setDraggingDocContentId(String(src.data.contentId));
          } else if (src.data?.type === NAVBAR_UNASSIGNED_LINK_TYPE) {
            setDraggingLinkItemId(String(src.data.itemId));
          }
        }}
        onDragOver={(event) => {
          const src = event.operation.source;
          if (!src) return;
          if (
            src.data?.type === NAVBAR_ASSIGNED_ITEM_TYPE ||
            src.data?.type === NAVBAR_GROUP_TYPE
          ) {
            setGroups((prev) => {
              const record = buildItemsRecord(prev);
              const next = move(record, event);
              return normalizeGroups(
                applyItemsRecord(next as ItemsRecord, prev),
              );
            });
          }
        }}
        onDragEnd={(event) => {
          const src = event.operation.source;
          const dest = event.operation.target;

          setDraggingGroupId(null);
          setDraggingItemId(null);
          setDraggingDocContentId(null);
          setDraggingLinkItemId(null);
          isDraggingRef.current = false;

          if (event.canceled) {
            setGroups(snapshotRef.current);
            return;
          }

          if (src?.data?.type === NAVBAR_UNASSIGNED_DOC_TYPE) {
            if (!dest) {
              setGroups(snapshotRef.current);
              return;
            }

            const target = findDropTarget(String(dest.id), groups);
            if (!target || target.kind === "pool") {
              setGroups(snapshotRef.current);
              return;
            }

            const existingItem =
              docItemMap.get(String(src.data.documentId ?? "")) ??
              docItemMap.get(String(src.data.contentId));
            const item =
              existingItem ??
              ({
                id: crypto.randomUUID(),
                type: "document",
                ...(src.data.documentId
                  ? { documentId: String(src.data.documentId) }
                  : { contentId: String(src.data.contentId) }),
              } satisfies NavigationItem);

            const nextGroups = snapshotRef.current.map((group) => {
              if (group.group.id !== target.groupId) {
                return group;
              }

              if (target.kind === "linked") {
                if (group.linkedItem) {
                  return group;
                }

                return {
                  ...group,
                  group: { ...group.group, linkedItemId: item.id },
                  linkedItem: { item },
                };
              }

              return {
                ...group,
                group: { ...group.group, linkedItemId: undefined },
                subItems: [...group.subItems, { item, enabled: true }],
              };
            });

            commitAndSet(nextGroups);
            return;
          }

          if (src?.data?.type === NAVBAR_UNASSIGNED_LINK_TYPE) {
            if (!dest) {
              setGroups(snapshotRef.current);
              return;
            }

            const item = unassignedLinkItems.find(
              (candidate) => candidate.id === String(src.data.itemId),
            );
            const target = findDropTarget(String(dest.id), groups);

            if (!item || !target || target.kind === "pool") {
              setGroups(snapshotRef.current);
              return;
            }

            const nextGroups = snapshotRef.current.map((group) => {
              if (group.group.id !== target.groupId) {
                return group;
              }

              if (target.kind === "linked") {
                if (group.linkedItem) {
                  return group;
                }

                return {
                  ...group,
                  group: { ...group.group, linkedItemId: undefined },
                  linkedItem: { item },
                };
              }

              return {
                ...group,
                subItems: [...group.subItems, { item, enabled: true }],
              };
            });

            commitAndSet(nextGroups);
            return;
          }

          if (!dest) {
            setGroups(snapshotRef.current);
            return;
          }

          if (src?.data?.type === NAVBAR_ASSIGNED_ITEM_TYPE) {
            const target = findDropTarget(String(dest.id), groups);
            if (target?.kind === "pool") {
              commitAndSet(removeNavbarAssignedItem(groups, String(src.id)));
              return;
            }
          }

          commitAndSet(groups);
        }}
      >
        <div className="flex gap-4">
          {/* Left panel: available documents + unassigned links */}
          <NavbarUnassignedPool
            documents={documents}
            lang={lang}
            docItemMap={docItemMap}
            assignedItemIds={assignedItemIds}
            unassignedLinkItems={unassignedLinkItems}
            groups={groups}
            documentTitleByContentId={documentTitleByContentId}
            draggingItemId={draggingItemId}
            onDeleteLinkItem={onDeleteLinkItem}
          />

          {/* Right panel: group columns */}
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <div className="flex flex-wrap gap-4">
              {groups.map((g, groupIndex) => (
                <NavbarGroupColumn
                  key={g.group.id}
                  g={g}
                  groupIndex={groupIndex}
                  documentPathById={documentPathById}
                  documentTitleByContentId={documentTitleByContentId}
                  isDragging={draggingGroupId === g.group.id}
                  lang={lang}
                  onCommit={commitAndSet}
                  allGroups={groups}
                  onToggleGroupEnabled={onToggleGroupEnabled}
                  onChangePriority={onChangePriority}
                  onRenameGroup={onRenameGroup}
                  onDeleteGroup={onDeleteGroup}
                />
              ))}
            </div>
          </div>
        </div>

        <DragOverlay>
          {draggingGroup ? (
            <NavbarGroupOverlay
              g={draggingGroup}
              lang={lang}
              documentPathById={documentPathById}
              documentTitleByContentId={documentTitleByContentId}
            />
          ) : draggingItem ? (
            <NavbarItemOverlay
              item={draggingItem.item}
              lang={lang}
              documentPathById={documentPathById}
              documentTitleByContentId={documentTitleByContentId}
            />
          ) : draggingDocContentId ? (
            <FooterDocOverlay
              label={
                documents.find((doc) => doc.contentId === draggingDocContentId)
                  ? getDocumentLabel(
                      documents.find(
                        (doc) => doc.contentId === draggingDocContentId,
                      )!,
                      lang,
                    )
                  : draggingDocContentId
              }
            />
          ) : draggingLinkItemId ? (
            <NavbarItemOverlay
              item={
                unassignedLinkItems.find(
                  (item) => item.id === draggingLinkItemId,
                )!
              }
              lang={lang}
              documentPathById={documentPathById}
              documentTitleByContentId={documentTitleByContentId}
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
// Navbar unassigned pool
// ---------------------------------------------------------------------------

function NavbarUnassignedPool({
  documents,
  lang,
  docItemMap,
  assignedItemIds,
  unassignedLinkItems,
  groups,
  documentTitleByContentId,
  draggingItemId,
  onDeleteLinkItem,
}: {
  documents: DocumentsListItemResponse[];
  lang: Locale;
  docItemMap: Map<string, NavigationItem>;
  assignedItemIds: Set<string>;
  unassignedLinkItems: NavigationItem[];
  groups: NavbarGroupWithItems[];
  documentTitleByContentId: Map<string, string>;
  draggingItemId: string | null;
  onDeleteLinkItem: (itemId: string) => void;
}) {
  const { ref: poolDropRef, isDropTarget } = useDroppable({
    id: NAVBAR_UNASSIGNED_POOL_ID + "-droppable",
    collisionPriority: CollisionPriority.Low,
  });

  const itemGroupName = new Map<string, string>();
  for (const group of groups) {
    const label = group.group.label["en"] ?? group.group.label["ja"] ?? "";
    if (group.linkedItem) {
      itemGroupName.set(group.linkedItem.item.id, label);
    }
    for (const item of group.subItems) {
      itemGroupName.set(item.item.id, label);
    }
  }

  return (
    <div
      ref={poolDropRef}
      className={[
        "flex h-[min(36rem,calc(100vh-18rem))] min-h-[300px] w-72 shrink-0 flex-col rounded-md border border-gray-200 bg-gray-50 p-3 transition-colors lg:w-80",
        isDropTarget ? "border-blue-300 bg-blue-50" : "",
      ].join(" ")}
    >
      <p className="mb-2 shrink-0 text-xs font-semibold text-gray-500 uppercase">
        Available navbar items
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <ul className="flex flex-col gap-1">
          {documents.map((doc) => {
            const navItem =
              docItemMap.get(doc.id) ?? docItemMap.get(doc.contentId);
            const isAssigned = navItem
              ? assignedItemIds.has(navItem.id)
              : false;
            const groupName = navItem
              ? itemGroupName.get(navItem.id)
              : undefined;
            return (
              <NavbarPoolDocCard
                key={doc.contentId}
                doc={doc}
                lang={lang}
                isAssigned={isAssigned}
                groupName={groupName}
                documentId={doc.id}
              />
            );
          })}
        </ul>

        {unassignedLinkItems.length > 0 ? (
          <>
            <p className="mt-3 mb-2 text-xs font-semibold text-gray-500 uppercase">
              Unassigned links
            </p>
            <ul className="flex flex-col gap-1">
              {unassignedLinkItems.map((item, index) => (
                <NavbarPoolLinkCard
                  key={item.id}
                  item={item}
                  index={index}
                  lang={lang}
                  isDragSource={draggingItemId === item.id}
                  onDelete={() => onDeleteLinkItem(item.id)}
                />
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </div>
  );
}

function NavbarPoolDocCard({
  doc,
  lang,
  isAssigned,
  groupName,
  documentId,
}: {
  doc: DocumentsListItemResponse;
  lang: Locale;
  isAssigned: boolean;
  groupName: string | undefined;
  documentId: string;
}) {
  const { ref, isDragSource } = useSortable({
    id: "navbar-doc-" + doc.contentId,
    index: 0,
    type: NAVBAR_UNASSIGNED_DOC_TYPE,
    disabled: isAssigned,
    data: {
      type: NAVBAR_UNASSIGNED_DOC_TYPE,
      contentId: doc.contentId,
      documentId,
    },
  });

  return (
    <li
      ref={ref as Ref<HTMLLIElement>}
      className={[
        "flex items-start gap-1.5 rounded px-2 py-1.5 text-xs transition-colors",
        isAssigned
          ? "cursor-not-allowed opacity-50"
          : "cursor-grab bg-white shadow-sm ring-1 ring-gray-200 hover:bg-gray-50",
        isDragSource ? "opacity-30" : "",
      ].join(" ")}
      title={isAssigned ? `Assigned to: ${groupName ?? "navbar"}` : undefined}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-2xs font-mono leading-none text-gray-400">
          {doc.contentId}
        </span>
        <div className="flex items-start gap-1.5">
          <GripVertical className="mt-0.5 size-3 shrink-0 text-gray-400" />
          <FileText className="mt-0.5 size-3 shrink-0 text-sky-600" />
          <div className="min-w-0 flex-1">
            <span className="break-words">{getDocumentLabel(doc, lang)}</span>
            {isAssigned && (
              <span className="text-2xs mt-0.5 block w-fit rounded bg-gray-200 px-1 py-0.5 text-gray-500">
                {groupName ?? "assigned"}
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

function NavbarPoolLinkCard({
  item,
  index,
  lang,
  isDragSource,
  onDelete,
}: {
  item: NavigationItem;
  index: number;
  lang: Locale;
  isDragSource: boolean;
  onDelete: () => void;
}) {
  const { ref, isDragSource: isDraggingPoolItem } = useSortable({
    id: "navbar-link-" + item.id,
    index,
    type: NAVBAR_UNASSIGNED_LINK_TYPE,
    data: { type: NAVBAR_UNASSIGNED_LINK_TYPE, itemId: item.id },
  });

  return (
    <li
      ref={ref as Ref<HTMLLIElement>}
      className={[
        "flex cursor-grab items-start gap-1.5 rounded bg-white px-2 py-1.5 text-xs shadow-sm ring-1 ring-gray-200 hover:bg-gray-50",
        isDragSource || isDraggingPoolItem ? "opacity-30" : "",
      ].join(" ")}
    >
      <GripVertical className="mt-0.5 size-3 shrink-0 text-gray-400" />
      <Link2 className="mt-0.5 size-3 shrink-0 text-amber-600" />
      <span className="min-w-0 flex-1 break-words">
        {item.label?.[lang] ?? item.label?.en ?? item.url ?? item.id}
      </span>
      <button
        type="button"
        onClick={onDelete}
        className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
        title="Delete link"
      >
        <Trash2 className="size-3.5" />
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Navbar group column
// ---------------------------------------------------------------------------

function NavbarGroupColumn({
  g,
  groupIndex,
  documentPathById,
  documentTitleByContentId,
  lang,
  isDragging,
  allGroups,
  onCommit,
  onToggleGroupEnabled,
  onChangePriority,
  onRenameGroup,
  onDeleteGroup,
}: {
  g: NavbarGroupWithItems;
  groupIndex: number;
  documentPathById: Map<string, string>;
  documentTitleByContentId: Map<string, string>;
  lang: Locale;
  isDragging: boolean;
  allGroups: NavbarGroupWithItems[];
  onCommit: (groups: NavbarGroupWithItems[]) => void;
  onToggleGroupEnabled: (groupId: string, enabled: boolean) => void;
  onChangePriority: (groupId: string, priority: NavPriority) => void;
  onRenameGroup: (groupId: string, label: { en: string; ja: string }) => void;
  onDeleteGroup: (groupId: string) => void;
}) {
  const [showLinkedAddLink, setShowLinkedAddLink] = useState(false);
  const [showSubAddLink, setShowSubAddLink] = useState(false);
  const [linkedUrl, setLinkedUrl] = useState("");
  const [linkedEn, setLinkedEn] = useState("");
  const [linkedJa, setLinkedJa] = useState("");
  const [subUrl, setSubUrl] = useState("");
  const [subEn, setSubEn] = useState("");
  const [subJa, setSubJa] = useState("");
  const { ref: linkedDropRef, isDropTarget: isLinkedDropTarget } = useDroppable(
    {
      id: getNavbarGroupLinkedSlotId(g.group.id),
      accept: [
        NAVBAR_ASSIGNED_ITEM_TYPE,
        NAVBAR_UNASSIGNED_DOC_TYPE,
        NAVBAR_UNASSIGNED_LINK_TYPE,
      ],
      collisionPriority: CollisionPriority.Low,
      disabled: g.linkedItem !== undefined,
    },
  );

  const { ref: subItemsDropRef, isDropTarget: isSubItemsDropTarget } =
    useDroppable({
      id: getNavbarGroupSubItemsId(g.group.id),
      accept: [
        NAVBAR_ASSIGNED_ITEM_TYPE,
        NAVBAR_UNASSIGNED_DOC_TYPE,
        NAVBAR_UNASSIGNED_LINK_TYPE,
      ],
      collisionPriority: CollisionPriority.Low,
    });

  const { ref: groupSortRef, handleRef: groupHandleRef } = useSortable({
    id: getNavbarGroupSortId(g.group.id),
    index: groupIndex,
    type: NAVBAR_GROUP_TYPE,
    accept: [NAVBAR_GROUP_TYPE],
    data: { type: NAVBAR_GROUP_TYPE },
  });

  const priority = g.group.priority ?? "important";
  const canEnableGroup = g.linkedItem !== undefined || g.subItems.length > 0;

  function updateCurrentGroup(
    updater: (group: NavbarGroupWithItems) => NavbarGroupWithItems,
  ) {
    onCommit(
      allGroups.map((group) =>
        group.group.id === g.group.id ? updater(group) : group,
      ),
    );
  }

  function confirmAddLinkedLink() {
    const url = linkedUrl.trim();
    const en = linkedEn.trim();
    const ja = linkedJa.trim();
    if (!url || !en) return;
    updateCurrentGroup((group) => ({
      ...group,
      linkedItem: {
        item: {
          id: crypto.randomUUID(),
          type: "link",
          url,
          label: { en, ja: ja || en },
        },
      },
    }));
    setLinkedUrl("");
    setLinkedEn("");
    setLinkedJa("");
    setShowLinkedAddLink(false);
  }

  function confirmAddSubLink() {
    const url = subUrl.trim();
    const en = subEn.trim();
    const ja = subJa.trim();
    if (!url || !en) return;
    updateCurrentGroup((group) => ({
      ...group,
      subItems: [
        ...group.subItems,
        {
          item: {
            id: crypto.randomUUID(),
            type: "link",
            url,
            label: { en, ja: ja || en },
          },
          enabled: true,
        },
      ],
    }));
    setSubUrl("");
    setSubEn("");
    setSubJa("");
    setShowSubAddLink(false);
  }

  function cancelAddLinkedLink() {
    setLinkedUrl("");
    setLinkedEn("");
    setLinkedJa("");
    setShowLinkedAddLink(false);
  }

  function cancelAddSubLink() {
    setSubUrl("");
    setSubEn("");
    setSubJa("");
    setShowSubAddLink(false);
  }

  return (
    <div
      ref={groupSortRef as Ref<HTMLDivElement>}
      className={[
        "max-w-96 min-w-40 shrink-0 rounded-md bg-white shadow-sm ring-1 ring-gray-200 transition-opacity",
        isDragging ? "opacity-40" : "",
        !g.group.enabled ? "opacity-50" : "",
        (isLinkedDropTarget || isSubItemsDropTarget) && !isDragging
          ? "ring-2 ring-blue-400"
          : "",
      ].join(" ")}
    >
      {/* Group header */}
      <div className="flex flex-col gap-2 border-b border-gray-100 px-3 py-2">
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            ref={groupHandleRef as Ref<HTMLButtonElement>}
            className="cursor-grab touch-none text-gray-400 hover:text-gray-600"
          >
            <GripVertical className="size-4 shrink-0" />
          </button>
          <div className="min-w-0 flex-1">
            <LocaleInlineEditor
              value={{
                en: g.group.label["en"] ?? "",
                ja: g.group.label["ja"] ?? "",
              }}
              onChange={({ en, ja }) => onRenameGroup(g.group.id, { en, ja })}
              displayClassName="text-xs font-semibold uppercase text-gray-500"
              required
            />
          </div>
          <Switch
            checked={g.group.enabled}
            disabled={!canEnableGroup}
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
        <Select
          value={priority}
          onValueChange={(value) =>
            onChangePriority(g.group.id, value as NavPriority)
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

      <div
        ref={linkedDropRef as Ref<HTMLDivElement>}
        className={[
          "mx-2 mt-2 rounded border p-2",
          g.linkedItem
            ? "border-gray-200"
            : "border-dashed border-gray-300 bg-gray-50",
          isLinkedDropTarget ? "border-blue-400 bg-blue-50" : "",
        ].join(" ")}
      >
        <p className="text-2xs mb-1 font-semibold text-gray-400 uppercase">
          Linked item
        </p>
        {g.linkedItem ? (
          <NavbarLinkedItemRow
            item={g.linkedItem.item}
            groupId={g.group.id}
            lang={lang}
            documentPathById={documentPathById}
            documentTitleByContentId={documentTitleByContentId}
            onSave={(value) =>
              updateCurrentGroup((group) => ({
                ...group,
                linkedItem:
                  group.linkedItem?.item.id === g.linkedItem?.item.id
                    ? {
                        item: {
                          ...(group.linkedItem?.item ?? g.linkedItem!.item),
                          url: value.url,
                          label: value.label,
                        },
                      }
                    : group.linkedItem,
              }))
            }
            onRemove={() =>
              updateCurrentGroup((group) => ({
                ...group,
                group: { ...group.group, linkedItemId: undefined },
                linkedItem: undefined,
              }))
            }
          />
        ) : showLinkedAddLink ? (
          <NavbarAddLinkForm
            url={linkedUrl}
            labelEn={linkedEn}
            labelJa={linkedJa}
            onChangeUrl={setLinkedUrl}
            onChangeLabelEn={setLinkedEn}
            onChangeLabelJa={setLinkedJa}
            onConfirm={confirmAddLinkedLink}
            onCancel={cancelAddLinkedLink}
          />
        ) : (
          <div className="px-1 py-2">
            <p className="text-foreground-light text-xs">
              Drop a document or link here
            </p>
            <button
              type="button"
              onClick={() => setShowLinkedAddLink(true)}
              className="mt-2 flex items-center gap-1 rounded px-1 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <Plus className="size-3" />
              Add link
            </button>
          </div>
        )}
      </div>

      <div className="border-t border-gray-100 px-2 py-2">
        <p className="text-2xs mb-1 font-semibold text-gray-400 uppercase">
          Sub-groups
        </p>
        <ul
          ref={subItemsDropRef as Ref<HTMLUListElement>}
          className={[
            "flex min-h-8 flex-col gap-1 rounded border p-2",
            g.subItems.length === 0
              ? "border-dashed border-gray-300 bg-gray-50"
              : "border-gray-100",
            isSubItemsDropTarget ? "border-blue-400 bg-blue-50" : "",
          ].join(" ")}
        >
          {g.subItems.map(({ item, enabled }, itemIndex) => (
            <NavbarSubItemRow
              key={item.id}
              item={item}
              enabled={enabled}
              itemIndex={itemIndex}
              groupId={g.group.id}
              lang={lang}
              documentPathById={documentPathById}
              documentTitleByContentId={documentTitleByContentId}
              onSave={(value) =>
                onCommit(
                  updateNavbarAssignedItem(
                    allGroups,
                    item.id,
                    (currentItem) => ({
                      ...currentItem,
                      item: {
                        ...currentItem.item,
                        url: value.url,
                        label: value.label,
                      },
                    }),
                  ),
                )
              }
              onRemove={() =>
                onCommit(removeNavbarAssignedItem(allGroups, item.id))
              }
              onToggleEnabled={(checked) =>
                onCommit(
                  updateNavbarAssignedItem(
                    allGroups,
                    item.id,
                    (currentItem) => ({
                      ...currentItem,
                      enabled: checked,
                    }),
                  ),
                )
              }
            />
          ))}
          {g.subItems.length === 0 && (
            <li className="text-foreground-light px-2 py-3 text-xs">
              Drop submenu items here
            </li>
          )}
        </ul>

        <div className="pt-1">
          {showSubAddLink ? (
            <NavbarAddLinkForm
              url={subUrl}
              labelEn={subEn}
              labelJa={subJa}
              onChangeUrl={setSubUrl}
              onChangeLabelEn={setSubEn}
              onChangeLabelJa={setSubJa}
              onConfirm={confirmAddSubLink}
              onCancel={cancelAddSubLink}
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowSubAddLink(true)}
              className="flex w-full items-center gap-1 rounded px-1 py-1 text-xs text-gray-400 hover:bg-gray-50 hover:text-gray-600"
            >
              <Plus className="size-3" />
              Add link
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function NavbarLinkedItemRow({
  item,
  groupId,
  lang,
  documentPathById,
  documentTitleByContentId,
  onSave,
  onRemove,
}: {
  item: NavigationItem;
  groupId: string;
  lang: Locale;
  documentPathById: Map<string, string>;
  documentTitleByContentId: Map<string, string>;
  onSave: (value: { url: string; label: { en: string; ja: string } }) => void;
  onRemove: () => void;
}) {
  const { ref, handleRef, isDragSource } = useSortable({
    id: item.id,
    index: 0,
    type: NAVBAR_ASSIGNED_ITEM_TYPE,
    accept: [NAVBAR_ASSIGNED_ITEM_TYPE],
    group: getNavbarGroupLinkedSlotId(groupId),
    data: { type: NAVBAR_ASSIGNED_ITEM_TYPE },
  });

  const itemPath = getEditorItemPath(item, documentPathById);

  return (
    <li
      ref={ref as Ref<HTMLLIElement>}
      className={[
        "flex items-start gap-1 rounded px-1 py-1 hover:bg-gray-50",
        isDragSource ? "opacity-40" : "",
      ].join(" ")}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-2xs font-mono leading-none text-gray-400">
          {itemPath}
        </span>
        <div className="flex items-start gap-1">
          <button
            type="button"
            ref={handleRef as Ref<HTMLButtonElement>}
            className="cursor-grab touch-none text-gray-400 hover:text-gray-600"
          >
            <GripVertical className="size-3 shrink-0" />
          </button>
          <NavigationItemLeadingIcon item={item} />
          <EditableLinkLabel
            item={item}
            lang={lang}
            documentTitleByContentId={documentTitleByContentId}
            className="min-w-0 flex-1 text-left text-xs break-words whitespace-normal"
            onSave={onSave}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
        title="Remove item from group"
      >
        <Trash2 className="size-3.5" />
      </button>
    </li>
  );
}

function NavbarSubItemRow({
  item,
  enabled,
  itemIndex,
  groupId,
  lang,
  documentPathById,
  documentTitleByContentId,
  onSave,
  onRemove,
  onToggleEnabled,
}: {
  item: NavigationItem;
  enabled: boolean;
  itemIndex: number;
  groupId: string;
  lang: Locale;
  documentPathById: Map<string, string>;
  documentTitleByContentId: Map<string, string>;
  onSave: (value: { url: string; label: { en: string; ja: string } }) => void;
  onRemove: () => void;
  onToggleEnabled: (enabled: boolean) => void;
}) {
  const { ref, handleRef, isDragSource } = useSortable({
    id: item.id,
    index: itemIndex,
    type: NAVBAR_ASSIGNED_ITEM_TYPE,
    accept: [NAVBAR_ASSIGNED_ITEM_TYPE],
    group: getNavbarGroupSubItemsId(groupId),
    data: { type: NAVBAR_ASSIGNED_ITEM_TYPE },
  });

  const itemPath = getEditorItemPath(item, documentPathById);

  return (
    <li
      ref={ref as Ref<HTMLLIElement>}
      className={[
        "flex items-start gap-1 rounded px-1 py-1 hover:bg-gray-50",
        isDragSource ? "opacity-40" : "",
        !enabled ? "opacity-50" : "",
      ].join(" ")}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-2xs font-mono leading-none text-gray-400">
          {itemPath}
        </span>
        <div className="flex items-start gap-1">
          <button
            type="button"
            ref={handleRef as Ref<HTMLButtonElement>}
            className="cursor-grab touch-none text-gray-400 hover:text-gray-600"
          >
            <GripVertical className="size-3 shrink-0" />
          </button>
          <NavigationItemLeadingIcon item={item} />
          <EditableLinkLabel
            item={item}
            lang={lang}
            documentTitleByContentId={documentTitleByContentId}
            className="min-w-0 flex-1 text-left text-xs break-words whitespace-normal"
            onSave={onSave}
          />
        </div>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={onToggleEnabled}
        className="shrink-0 scale-75"
      />
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
        title="Remove item from group"
      >
        <Trash2 className="size-3.5" />
      </button>
    </li>
  );
}

function NavbarAddLinkForm({
  url,
  labelEn,
  labelJa,
  onChangeUrl,
  onChangeLabelEn,
  onChangeLabelJa,
  onConfirm,
  onCancel,
}: {
  url: string;
  labelEn: string;
  labelJa: string;
  onChangeUrl: (value: string) => void;
  onChangeLabelEn: (value: string) => void;
  onChangeLabelJa: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 pt-1">
      <input
        type="text"
        value={url}
        onChange={(event) => onChangeUrl(event.target.value)}
        placeholder="URL"
        className="w-full rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-400"
        autoFocus
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
      />
      <div className="flex items-center gap-3">
        <label className="w-8 shrink-0 text-xs text-gray-500">EN</label>
        <input
          type="text"
          value={labelEn}
          onChange={(event) => onChangeLabelEn(event.target.value)}
          placeholder="English label"
          className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-400"
          onKeyDown={(event) => {
            if (event.key === "Enter") onConfirm();
            if (event.key === "Escape") onCancel();
          }}
        />
      </div>
      <div className="flex items-center gap-3">
        <label className="w-8 shrink-0 text-xs text-gray-500">JA</label>
        <input
          type="text"
          value={labelJa}
          onChange={(event) => onChangeLabelJa(event.target.value)}
          placeholder="Japanese label"
          className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-400"
          onKeyDown={(event) => {
            if (event.key === "Enter") onConfirm();
            if (event.key === "Escape") onCancel();
          }}
        />
      </div>
      <div className="flex items-center gap-1 pt-0.5">
        <Button
          type="button"
          size="slim"
          onClick={onConfirm}
          disabled={!url.trim() || !labelEn.trim()}
          className="h-6 text-xs"
        >
          <Check className="mr-1 size-3" />
          Add
        </Button>
        <Button
          type="button"
          size="slim"
          variant="outline"
          onClick={onCancel}
          className="h-6 text-xs"
        >
          <X className="mr-1 size-3" />
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Navbar drag overlay clones
// ---------------------------------------------------------------------------

function NavbarGroupOverlay({
  g,
  lang,
  documentPathById: _documentPathById,
  documentTitleByContentId,
}: {
  g: NavbarGroupWithItems;
  lang: Locale;
  documentPathById: Map<string, string>;
  documentTitleByContentId: Map<string, string>;
}) {
  const groupLabel =
    g.group.label[lang] ?? g.group.label["en"] ?? g.group.label["ja"] ?? "";
  return (
    <div
      className={[
        "max-w-96 min-w-40 shrink-0 rounded-md bg-white shadow-lg ring-2 ring-blue-300",
        !g.group.enabled ? "opacity-50" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-1 border-b border-gray-100 px-3 py-2">
        <GripVertical className="size-4 shrink-0 text-gray-400" />
        <span className="flex-1 truncate text-xs font-semibold text-gray-500 uppercase">
          {groupLabel}
        </span>
      </div>
      <ul className="flex flex-col gap-1 p-2">
        {g.linkedItem ? (
          <li
            key={g.linkedItem.item.id}
            className="flex items-start gap-1 rounded px-1 py-1"
          >
            <NavigationItemLeadingIcon item={g.linkedItem.item} />
            <span className="min-w-0 flex-1 text-xs break-words whitespace-normal">
              {getEditorItemLabel(
                g.linkedItem.item,
                lang,
                documentTitleByContentId,
              )}
            </span>
          </li>
        ) : (
          <li className="text-foreground-light px-2 py-2 text-xs">
            No linked item
          </li>
        )}
      </ul>
      <div className="border-t border-gray-100 px-2 py-2">
        <p className="text-2xs mb-1 font-semibold text-gray-400 uppercase">
          Sub-groups
        </p>
        <ul className="flex flex-col gap-1">
          {g.subItems.map(({ item, enabled }) => (
            <li
              key={item.id}
              className="flex items-start gap-1 rounded px-1 py-1"
            >
              <NavigationItemLeadingIcon item={item} />
              <span className="min-w-0 flex-1 text-xs break-words whitespace-normal">
                {getEditorItemLabel(item, lang, documentTitleByContentId)}
              </span>
              {!enabled ? (
                <span className="text-2xs text-gray-400">off</span>
              ) : null}
            </li>
          ))}
          {g.subItems.length === 0 && (
            <li className="text-foreground-light px-2 py-2 text-xs">
              No submenu items
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

function NavbarItemOverlay({
  item,
  lang,
  documentPathById,
  documentTitleByContentId,
}: {
  item: NavigationItem;
  lang: Locale;
  documentPathById: Map<string, string>;
  documentTitleByContentId: Map<string, string>;
}) {
  const itemPath = getEditorItemPath(item, documentPathById);

  return (
    <li className="flex items-start gap-1 rounded bg-white px-1 py-1 shadow-lg ring-2 ring-blue-300">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-2xs font-mono leading-none text-gray-400">
          {itemPath}
        </span>
        <div className="flex items-start gap-1">
          <NavigationItemLeadingIcon item={item} />
          <span className="min-w-0 flex-1 text-xs break-words whitespace-normal">
            {getEditorItemLabel(item, lang, documentTitleByContentId)}
          </span>
        </div>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Footer preview — two-panel layout with document pool + drag-drop groups
// ---------------------------------------------------------------------------

const FOOTER_GROUP_TYPE = "footer-group";
const FOOTER_ITEM_TYPE = "footer-item";
const FOOTER_UNASSIGNED_DOC_TYPE = "footer-unassigned-doc";
const FOOTER_UNASSIGNED_LINK_TYPE = "footer-unassigned-link";
const FOOTER_UNASSIGNED_POOL_ID = "__footer-pool__";

function getFooterGroupSortId(groupId: string): string {
  return `footer-group:${groupId}`;
}

function getFooterGroupItemsId(groupId: string): string {
  return `footer-group-items:${groupId}`;
}

function parseFooterGroupItemsId(value: string): string | null {
  return value.startsWith("footer-group-items:")
    ? value.slice("footer-group-items:".length)
    : null;
}

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
  onCreateUnassignedLinkItem,
  onDeleteLinkItem,
  onUpdateLinkLabel,
  onRemoveItem,
  onToggleItemEnabled,
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
  onAssignDocument: (
    contentId: string,
    groupId: string,
    documentId?: string,
  ) => void;
  onAddLinkToGroup: (
    groupId: string,
    url: string,
    label: { en: string; ja: string },
  ) => void;
  onCreateUnassignedLinkItem: (
    url: string,
    label: { en: string; ja: string },
  ) => void;
  onDeleteLinkItem: (itemId: string) => void;
  onUpdateLinkLabel: (
    itemId: string,
    value: { url: string; label: { en: string; ja: string } },
  ) => void;
  onRemoveItem: (itemId: string) => void;
  onToggleItemEnabled: (itemId: string, enabled: boolean) => void;
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
  const [draggingLinkItemId, setDraggingLinkItemId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!isDraggingRef.current) {
      setGroups(groupsProp);
    }
  }, [groupsProp]);

  const draggingGroup = draggingGroupId
    ? (groups.find((g) => g.group.id === draggingGroupId) ?? null)
    : null;
  const draggingItem = draggingItemId
    ? (groups
        .flatMap((g) => g.items)
        .find((i) => i.item.id === draggingItemId) ?? null)
    : null;

  // Compute which item IDs are assigned to any group
  const assignedItemIds = new Set(
    groups.flatMap((g) => g.items.map((i) => i.item.id)),
  );

  const documentPathById = new Map(
    documents.map((doc) => [doc.id, doc.contentId] as const),
  );

  const docItemMap = new Map<string, NavigationItem>(
    allItems
      .filter((i) => i.type === "document")
      .flatMap((item) => [
        ...(item.documentId ? ([[item.documentId, item]] as const) : []),
        ...(item.contentId ? ([[item.contentId, item]] as const) : []),
      ]),
  );

  // Unassigned link items: type === "link" and not currently in any group
  const unassignedLinkItems = allItems.filter(
    (i) => i.type === "link" && !assignedItemIds.has(i.id),
  );
  const documentTitleByContentId = new Map([
    ...documents.map(
      (doc) => [doc.contentId, getDocumentLabel(doc, lang)] as const,
    ),
    ...documents.map((doc) => [doc.id, getDocumentLabel(doc, lang)] as const),
  ]);

  function buildItemsRecord(gs: FooterGroupWithItems[]): ItemsRecord {
    const record: ItemsRecord = {
      _groups: gs.map((g) => getFooterGroupSortId(g.group.id)),
    };
    for (const { group, items } of gs) {
      record[getFooterGroupItemsId(group.id)] = items.map((i) => i.item.id);
    }
    return record;
  }

  function applyItemsRecord(
    record: ItemsRecord,
    prevGroups: FooterGroupWithItems[],
  ): FooterGroupWithItems[] {
    const groupOrder = record["_groups"] as string[];
    const groupById = new Map(
      prevGroups.map((g) => [getFooterGroupSortId(g.group.id), g.group]),
    );
    const itemById = new Map(
      prevGroups.flatMap((g) => g.items.map((i) => [i.item.id, i])),
    );

    return groupOrder
      .map((groupId) => {
        const group = groupById.get(groupId);
        if (!group) return null;

        return {
          group,
          items: (record[getFooterGroupItemsId(group.id)] ?? [])
            .map((itemId) => itemById.get(itemId))
            .filter(Boolean) as FooterGroupWithItems["items"],
        };
      })
      .filter(Boolean) as FooterGroupWithItems[];
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
          } else if (src.data?.type === FOOTER_UNASSIGNED_LINK_TYPE) {
            setDraggingLinkItemId(String(src.data.itemId));
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
          setDraggingLinkItemId(null);
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
              const groupId = parseFooterGroupItemsId(destId);
              // Only commit if it's a real group id
              if (groupId) {
                onAssignDocument(
                  contentId,
                  groupId,
                  src.data.documentId ? String(src.data.documentId) : undefined,
                );
              }
            }
            setGroups(snapshotRef.current);
            return;
          }

          if (src?.data?.type === FOOTER_UNASSIGNED_LINK_TYPE) {
            const itemId = String(src.data.itemId);
            if (dest) {
              const destId = String(dest.id);
              const groupId = parseFooterGroupItemsId(destId);
              if (groupId) {
                const updated = snapshotRef.current.map((g) =>
                  g.group.id === groupId
                    ? {
                        ...g,
                        items: [
                          ...g.items,
                          {
                            item: unassignedLinkItems.find(
                              (item) => item.id === itemId,
                            )!,
                            enabled: true,
                          },
                        ],
                      }
                    : g,
                );
                onCommit(updated);
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
              const itemId = String(src.id);
              const updated = groups.map((g) => ({
                ...g,
                items: g.items.filter((i) => i.item.id !== itemId),
              }));
              onCommit(updated);
              setGroups(updated);
              return;
            }
          }

          onCommit(groups);
          setGroups(groups);
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
            documentTitleByContentId={documentTitleByContentId}
            onCreateLinkItem={onCreateUnassignedLinkItem}
            onDeleteLinkItem={onDeleteLinkItem}
          />

          {/* Right panel: group columns */}
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <div className="flex flex-wrap gap-4">
              {groups.map((g, groupIndex) => (
                <FooterGroupColumn
                  key={g.group.id}
                  g={g}
                  groupIndex={groupIndex}
                  documentPathById={documentPathById}
                  documentTitleByContentId={documentTitleByContentId}
                  isDragging={draggingGroupId === g.group.id}
                  onToggleGroupEnabled={onToggleGroupEnabled}
                  onRenameGroup={onRenameGroup}
                  onDeleteGroup={onDeleteGroup}
                  onAddLinkToGroup={onAddLinkToGroup}
                  onUpdateLinkLabel={onUpdateLinkLabel}
                  onRemoveItem={onRemoveItem}
                  onToggleItemEnabled={onToggleItemEnabled}
                  lang={lang}
                />
              ))}
            </div>
          </div>
        </div>

        <DragOverlay>
          {draggingGroup ? (
            <FooterGroupOverlay
              g={draggingGroup}
              lang={lang}
              documentPathById={documentPathById}
              documentTitleByContentId={documentTitleByContentId}
            />
          ) : draggingItem ? (
            <FooterItemOverlay
              item={draggingItem.item}
              lang={lang}
              documentPathById={documentPathById}
              documentTitleByContentId={documentTitleByContentId}
            />
          ) : draggingLinkItemId ? (
            <FooterItemOverlay
              item={
                unassignedLinkItems.find(
                  (item) => item.id === draggingLinkItemId,
                )!
              }
              lang={lang}
              documentPathById={documentPathById}
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
  documentTitleByContentId,
  onCreateLinkItem,
  onDeleteLinkItem,
}: {
  documents: DocumentsListItemResponse[];
  lang: Locale;
  docItemMap: Map<string, NavigationItem>;
  assignedItemIds: Set<string>;
  unassignedLinkItems: NavigationItem[];
  groups: FooterGroupWithItems[];
  documentTitleByContentId: Map<string, string>;
  onCreateLinkItem: (url: string, label: { en: string; ja: string }) => void;
  onDeleteLinkItem: (itemId: string) => void;
}) {
  const [showAddLink, setShowAddLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkEn, setLinkEn] = useState("");
  const [linkJa, setLinkJa] = useState("");
  const { ref: poolDropRef, isDropTarget: isPoolDropTarget } = useDroppable({
    id: FOOTER_UNASSIGNED_POOL_ID + "-droppable",
    collisionPriority: CollisionPriority.Low,
  });

  // Build a map: itemId -> group name
  const itemGroupName = new Map<string, string>();
  for (const g of groups) {
    for (const item of g.items) {
      itemGroupName.set(
        item.item.id,
        g.group.label[lang] ?? g.group.label["en"] ?? g.group.label["ja"] ?? "",
      );
    }
  }

  function confirmAddLink() {
    const url = linkUrl.trim();
    const en = linkEn.trim();
    const ja = linkJa.trim();
    if (!url || !en) return;
    onCreateLinkItem(url, { en, ja: ja || en });
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
      ref={poolDropRef}
      className={[
        "flex h-[min(36rem,calc(100vh-18rem))] min-h-[300px] w-72 shrink-0 flex-col rounded-md border border-gray-200 bg-gray-50 p-3 transition-colors lg:w-80",
        isPoolDropTarget ? "border-blue-300 bg-blue-50" : "",
      ].join(" ")}
    >
      <p className="mb-2 shrink-0 text-xs font-semibold text-gray-500 uppercase">
        Available documents
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <ul className="flex flex-col gap-1">
          {documents.map((doc) => {
            const navItem =
              docItemMap.get(doc.id) ?? docItemMap.get(doc.contentId);
            const isAssigned = navItem
              ? assignedItemIds.has(navItem.id)
              : false;
            const groupName = navItem
              ? itemGroupName.get(navItem.id)
              : undefined;
            return (
              <FooterPoolDocCard
                key={doc.contentId}
                doc={doc}
                lang={lang}
                isAssigned={isAssigned}
                groupName={groupName}
                documentId={doc.id}
              />
            );
          })}
          {documents.length === 0 && (
            <li className="text-foreground-light py-2 text-xs">No documents</li>
          )}
        </ul>

        {unassignedLinkItems.length > 0 && (
          <>
            <p className="mt-3 mb-2 text-xs font-semibold text-gray-500 uppercase">
              Unassigned links
            </p>
            <ul className="flex flex-col gap-1">
              {unassignedLinkItems.map((item, idx) => (
                <FooterPoolItemCard
                  key={item.id}
                  item={item}
                  index={idx}
                  lang={lang}
                  documentTitleByContentId={documentTitleByContentId}
                  onDelete={() => onDeleteLinkItem(item.id)}
                />
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="mt-3 border-t border-gray-200 pt-2">
        {showAddLink ? (
          <div className="flex flex-col gap-1.5">
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
            className="flex w-full items-center gap-1 rounded px-1 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <Plus className="size-3" />
            Add link
          </button>
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
  documentId,
}: {
  doc: DocumentsListItemResponse;
  lang: Locale;
  isAssigned: boolean;
  groupName: string | undefined;
  documentId: string;
}) {
  const { ref, isDragSource } = useSortable({
    id: "pool-doc-" + doc.contentId,
    index: 0,
    type: FOOTER_UNASSIGNED_DOC_TYPE,
    disabled: isAssigned,
    data: {
      type: FOOTER_UNASSIGNED_DOC_TYPE,
      contentId: doc.contentId,
      documentId,
    },
  });

  const label = getDocumentLabel(doc, lang);

  return (
    <li
      ref={ref as Ref<HTMLLIElement>}
      className={[
        "flex items-start gap-1.5 rounded px-2 py-1.5 text-xs transition-colors",
        isAssigned
          ? "cursor-not-allowed opacity-50"
          : "cursor-grab bg-white shadow-sm ring-1 ring-gray-200 hover:bg-gray-50",
        isDragSource ? "opacity-30" : "",
      ].join(" ")}
      title={isAssigned ? `Assigned to: ${groupName ?? "a group"}` : undefined}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-2xs font-mono leading-none text-gray-400">
          {doc.contentId}
        </span>
        <div className="flex items-start gap-1.5">
          <GripVertical className="mt-0.5 size-3 shrink-0 text-gray-400" />
          <FileText className="mt-0.5 size-3 shrink-0 text-sky-600" />
          <div className="min-w-0 flex-1">
            <span className="break-words">{label}</span>
            {isAssigned && (
              <span className="text-2xs mt-0.5 block w-fit rounded bg-gray-200 px-1 py-0.5 text-gray-500">
                {groupName ?? "assigned"}
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

function FooterPoolItemCard({
  item,
  index,
  lang,
  documentTitleByContentId,
  onDelete,
}: {
  item: NavigationItem;
  index: number;
  lang: Locale;
  documentTitleByContentId: Map<string, string>;
  onDelete: () => void;
}) {
  const { ref, isDragSource } = useSortable({
    id: "footer-link-" + item.id,
    index,
    type: FOOTER_UNASSIGNED_LINK_TYPE,
    data: { type: FOOTER_UNASSIGNED_LINK_TYPE, itemId: item.id },
  });

  return (
    <li
      ref={ref as Ref<HTMLLIElement>}
      className={[
        "flex cursor-grab items-start gap-1.5 rounded bg-white px-2 py-1.5 text-xs shadow-sm ring-1 ring-gray-200 hover:bg-gray-50",
        isDragSource ? "opacity-30" : "",
      ].join(" ")}
    >
      <GripVertical className="mt-0.5 size-3 shrink-0 text-gray-400" />
      <Link2 className="mt-0.5 size-3 shrink-0 text-amber-600" />
      <span className="min-w-0 flex-1 break-words">
        {getEditorItemLabel(item, lang, documentTitleByContentId)}
      </span>
      <button
        type="button"
        onClick={onDelete}
        className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
        title="Delete link"
      >
        <Trash2 className="size-3.5" />
      </button>
    </li>
  );
}

function EditableLinkLabel({
  item,
  lang,
  documentTitleByContentId,
  className,
  onSave,
}: {
  item: NavigationItem;
  lang: Locale;
  documentTitleByContentId: Map<string, string>;
  className?: string;
  onSave: (value: { url: string; label: { en: string; ja: string } }) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editUrl, setEditUrl] = useState("");
  const [editEn, setEditEn] = useState("");
  const [editJa, setEditJa] = useState("");
  const editFormRef = useRef<HTMLDivElement | null>(null);
  const editUrlInputRef = useRef<HTMLInputElement | null>(null);

  const commitRef = useRef(commit);
  commitRef.current = commit;

  useEffect(() => {
    if (!isEditing) return;
    editUrlInputRef.current?.focus();
    editUrlInputRef.current?.select();
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (editFormRef.current?.contains(target)) return;
      commitRef.current();
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isEditing]);

  function startEditing() {
    setEditUrl(item.url ?? "");
    setEditEn(item.label?.en ?? "");
    setEditJa(item.label?.ja ?? "");
    setIsEditing(true);
  }

  function commit() {
    const url = editUrl.trim();
    const en = editEn.trim();
    const ja = editJa.trim();
    if (!url || !en) return;
    onSave({ url, label: { en, ja: ja || en } });
    setIsEditing(false);
  }

  function cancel() {
    setIsEditing(false);
  }

  if (item.type !== "link") {
    return (
      <span className={className}>
        {getEditorItemLabel(item, lang, documentTitleByContentId)}
      </span>
    );
  }

  if (isEditing) {
    return (
      <div ref={editFormRef} className="flex min-w-0 flex-1 flex-col gap-1.5">
        <input
          ref={editUrlInputRef}
          type="text"
          value={editUrl}
          onChange={(e) => setEditUrl(e.target.value)}
          placeholder="URL"
          className="w-full rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-400"
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") cancel();
          }}
        />
        <div className="flex items-center gap-3">
          <label className="w-8 shrink-0 text-xs text-gray-500">EN</label>
          <input
            type="text"
            value={editEn}
            onChange={(e) => setEditEn(e.target.value)}
            placeholder="English label"
            className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-400"
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") cancel();
            }}
          />
        </div>
        <div className="flex items-center gap-3">
          <label className="w-8 shrink-0 text-xs text-gray-500">JA</label>
          <input
            type="text"
            value={editJa}
            onChange={(e) => setEditJa(e.target.value)}
            placeholder="Japanese label"
            className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-400"
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") cancel();
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <button type="button" onClick={startEditing} className={className}>
      {getEditorItemLabel(item, lang, documentTitleByContentId)}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Footer group column with inline rename + add link
// ---------------------------------------------------------------------------

function FooterGroupColumn({
  g,
  groupIndex,
  documentPathById,
  documentTitleByContentId,
  lang,
  isDragging,
  onToggleGroupEnabled,
  onRenameGroup,
  onDeleteGroup,
  onAddLinkToGroup,
  onUpdateLinkLabel,
  onRemoveItem,
  onToggleItemEnabled,
}: {
  g: FooterGroupWithItems;
  groupIndex: number;
  documentPathById: Map<string, string>;
  documentTitleByContentId: Map<string, string>;
  lang: Locale;
  isDragging: boolean;
  onToggleGroupEnabled: (groupId: string, enabled: boolean) => void;
  onRenameGroup: (groupId: string, label: { en: string; ja: string }) => void;
  onDeleteGroup: (groupId: string) => void;
  onAddLinkToGroup: (
    groupId: string,
    url: string,
    label: { en: string; ja: string },
  ) => void;
  onUpdateLinkLabel: (
    itemId: string,
    value: { url: string; label: { en: string; ja: string } },
  ) => void;
  onRemoveItem: (itemId: string) => void;
  onToggleItemEnabled: (itemId: string, enabled: boolean) => void;
}) {
  const [showAddLink, setShowAddLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkEn, setLinkEn] = useState("");
  const [linkJa, setLinkJa] = useState("");
  const { ref: groupDropRef, isDropTarget } = useDroppable({
    id: getFooterGroupItemsId(g.group.id),
    accept: [
      FOOTER_ITEM_TYPE,
      FOOTER_UNASSIGNED_DOC_TYPE,
      FOOTER_UNASSIGNED_LINK_TYPE,
    ],
    collisionPriority: CollisionPriority.Low,
  });

  const { ref: groupSortRef, handleRef: groupHandleRef } = useSortable({
    id: getFooterGroupSortId(g.group.id),
    index: groupIndex,
    type: FOOTER_GROUP_TYPE,
    accept: [FOOTER_GROUP_TYPE],
    data: { type: FOOTER_GROUP_TYPE },
  });

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
      ref={groupSortRef as Ref<HTMLDivElement>}
      className={[
        "max-w-96 min-w-40 shrink-0 rounded-md bg-white shadow-sm ring-1 ring-gray-200 transition-opacity",
        isDragging ? "opacity-40" : "",
        !g.group.enabled ? "opacity-50" : "",
        isDropTarget && !isDragging ? "ring-2 ring-blue-400" : "",
      ].join(" ")}
    >
      {/* Group header */}
      <div className="flex min-w-0 items-center gap-1 border-b border-gray-100 px-3 py-2">
        <button
          type="button"
          ref={groupHandleRef as Ref<HTMLButtonElement>}
          className="cursor-grab touch-none text-gray-400 hover:text-gray-600"
        >
          <GripVertical className="size-4 shrink-0" />
        </button>
        <div className="min-w-0 flex-1">
          <LocaleInlineEditor
            value={{
              en: g.group.label["en"] ?? "",
              ja: g.group.label["ja"] ?? "",
            }}
            onChange={({ en, ja }) => onRenameGroup(g.group.id, { en, ja })}
            displayClassName="text-xs font-semibold uppercase text-gray-500"
            required
          />
        </div>
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

      <ul
        ref={groupDropRef as Ref<HTMLUListElement>}
        className="flex min-h-8 flex-col gap-1 p-2"
      >
        {g.items.map(({ item, enabled }, itemIndex) => (
          <FooterItemRow
            key={item.id}
            item={item}
            enabled={enabled}
            itemIndex={itemIndex}
            groupId={g.group.id}
            lang={lang}
            documentPathById={documentPathById}
            documentTitleByContentId={documentTitleByContentId}
            onUpdateLinkLabel={onUpdateLinkLabel}
            onRemoveItem={onRemoveItem}
            onToggleEnabled={onToggleItemEnabled}
          />
        ))}
        {g.items.length === 0 && (
          <li className="text-foreground-light px-2 py-3 text-xs">No items</li>
        )}
      </ul>

      {/* Add link button / inline form */}
      <div className="border-t border-gray-100 px-2 pt-1 pb-2">
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
  enabled,
  itemIndex,
  groupId,
  lang,
  documentPathById,
  documentTitleByContentId,
  onUpdateLinkLabel,
  onRemoveItem,
  onToggleEnabled,
}: {
  item: NavigationItem;
  enabled: boolean;
  itemIndex: number;
  groupId: string;
  lang: Locale;
  documentPathById: Map<string, string>;
  documentTitleByContentId: Map<string, string>;
  onUpdateLinkLabel: (
    itemId: string,
    value: { url: string; label: { en: string; ja: string } },
  ) => void;
  onRemoveItem: (itemId: string) => void;
  onToggleEnabled: (itemId: string, enabled: boolean) => void;
}) {
  const { ref, handleRef, isDragSource } = useSortable({
    id: item.id,
    index: itemIndex,
    type: FOOTER_ITEM_TYPE,
    accept: [FOOTER_ITEM_TYPE],
    group: getFooterGroupItemsId(groupId),
    data: { type: FOOTER_ITEM_TYPE },
  });

  const itemPath = getEditorItemPath(item, documentPathById);

  return (
    <li
      ref={ref as Ref<HTMLLIElement>}
      className={[
        "flex items-start gap-1 rounded px-1 py-1 hover:bg-gray-50",
        isDragSource ? "opacity-40" : "",
        !enabled ? "opacity-50" : "",
      ].join(" ")}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-2xs font-mono leading-none text-gray-400">
          {itemPath}
        </span>
        <div className="flex items-start gap-1">
          <button
            type="button"
            ref={handleRef as Ref<HTMLButtonElement>}
            className="cursor-grab touch-none text-gray-400 hover:text-gray-600"
          >
            <GripVertical className="size-3 shrink-0" />
          </button>
          <NavigationItemLeadingIcon item={item} />
          <EditableLinkLabel
            item={item}
            lang={lang}
            documentTitleByContentId={documentTitleByContentId}
            className="min-w-0 flex-1 text-left text-xs break-words whitespace-normal"
            onSave={(value) => onUpdateLinkLabel(item.id, value)}
          />
        </div>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={(checked) => onToggleEnabled(item.id, checked)}
        className="shrink-0 scale-75"
      />
      <button
        type="button"
        onClick={() => onRemoveItem(item.id)}
        className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
        title="Remove item from group"
      >
        <Trash2 className="size-3.5" />
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Footer drag overlay clones
// ---------------------------------------------------------------------------

function FooterGroupOverlay({
  g,
  lang,
  documentPathById: _documentPathById,
  documentTitleByContentId,
}: {
  g: FooterGroupWithItems;
  lang: Locale;
  documentPathById: Map<string, string>;
  documentTitleByContentId: Map<string, string>;
}) {
  const groupLabel =
    g.group.label[lang] ?? g.group.label["en"] ?? g.group.label["ja"] ?? "";
  return (
    <div
      className={[
        "max-w-96 min-w-40 shrink-0 rounded-md bg-white shadow-lg ring-2 ring-blue-300",
        !g.group.enabled ? "opacity-50" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-1 border-b border-gray-100 px-3 py-2">
        <GripVertical className="size-4 shrink-0 text-gray-400" />
        <span className="flex-1 truncate text-xs font-semibold text-gray-500 uppercase">
          {groupLabel}
        </span>
      </div>
      <ul className="flex flex-col gap-1 p-2">
        {g.items.map(({ item, enabled }) => (
          <li
            key={item.id}
            className="flex items-start gap-1 rounded px-1 py-1"
          >
            <NavigationItemLeadingIcon item={item} />
            <span className="min-w-0 flex-1 text-xs break-words whitespace-normal">
              {getEditorItemLabel(item, lang, documentTitleByContentId)}
            </span>
            {!enabled ? (
              <span className="text-2xs text-gray-400">off</span>
            ) : null}
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
  lang,
  documentPathById,
  documentTitleByContentId,
}: {
  item: NavigationItem;
  lang: Locale;
  documentPathById: Map<string, string>;
  documentTitleByContentId: Map<string, string>;
}) {
  const itemPath = getEditorItemPath(item, documentPathById);

  return (
    <li className="flex items-start gap-1 rounded bg-white px-1 py-1 shadow-lg ring-2 ring-blue-300">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-2xs font-mono leading-none text-gray-400">
          {itemPath}
        </span>
        <div className="flex items-start gap-1">
          <NavigationItemLeadingIcon item={item} />
          <span className="min-w-0 flex-1 text-xs break-words whitespace-normal">
            {getEditorItemLabel(item, lang, documentTitleByContentId)}
          </span>
        </div>
      </div>
    </li>
  );
}

function FooterDocOverlay({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded bg-white px-2 py-1.5 text-xs shadow-lg ring-2 ring-blue-300">
      <FileText className="size-3 shrink-0 text-sky-600" />
      <span>{label}</span>
    </div>
  );
}
