import { evaluate } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouteContext, useRouter } from "@tanstack/react-router";

import { useEffect, useState } from "react";

import { Card } from "@/components/Card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  NavigationGroup,
  NavigationItem,
  NavPriority,
  SiteNavigationConfig,
} from "@/config/site-navigation";
import {
  normalizeSiteNavigationConfig,
  siteNavigationConfigSchema,
} from "@/config/site-navigation.schema";
import {
  deriveNavbarCommittedGroups,
  mergeCommittedNavbarGroups,
} from "@/config/site-navigation-admin";
import { getDocumentsQueryOptions } from "@/serverFunctions/document";
import {
  $resetSiteNavigationConfig,
  $saveSiteNavigationConfig,
  getSiteNavigationConfigQueryOptions,
} from "@/serverFunctions/siteNavigation";

import { AdminStatusMessage } from "./-components/AdminStatusMessage";
import { FooterEditor } from "./-components/site-navigation-editor/FooterEditor";
import { NavbarEditor } from "./-components/site-navigation-editor/NavbarEditor";
import type {
  FooterGroupWithItems,
  NavbarGroupWithItems,
} from "./-components/site-navigation-editor/types";

export const Route = createFileRoute("/{-$lang}/_layout/_authed/admin/header-footer")({
  component: RouteComponent,
});

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
    mutationFn: async () => $resetSiteNavigationConfig({ data: { expectedRevision: revision } }),
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
            <p className="font-medium text-danger text-sm">
              Failed to load site navigation config.
            </p>
            <p className="mt-1 text-foreground-light text-sm">
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

  const isDirty = !evaluate(
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
      setError(validation.error.issues[0]?.message ?? "Navigation config is invalid.");
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

  function updateDraft(updater: (current: SiteNavigationConfig) => SiteNavigationConfig) {
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

  function renameNavbarGroup(groupId: string, label: { en: string; ja: string }) {
    updateDraft((current) => ({
      ...current,
      zones: {
        ...current.zones,
        navbar: {
          groups: current.zones.navbar.groups.map((g) => (g.id === groupId ? { ...g, label } : g)),
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
            g.id === groupId ? { ...g, enabled: enabled ? g.items.length > 0 : false } : g,
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

  // ---------------------------------------------------------------------------
  // Footer commit handlers
  // ---------------------------------------------------------------------------

  function commitFooterGroups(groups: FooterGroupWithItems[]) {
    updateDraft((current) => {
      // Build new group list preserving all groups (including those not in the
      // drag-drop view, i.e. empty groups that were filtered out)
      const updatedGroupIds = new Set(groups.map((g) => g.group.id));
      const unchangedGroups = current.zones.footer.groups.filter((g) => !updatedGroupIds.has(g.id));

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
          groups: [...current.zones.footer.groups, { id, label, enabled: true, items: [] }],
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
          groups: current.zones.footer.groups.map((g) => (g.id === groupId ? { ...g, label } : g)),
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

  function assignDocumentToGroup(contentId: string, groupId: string, documentId?: string) {
    const resolvedDocumentId = documentId ?? documents.find((d) => d.contentId === contentId)?.id;
    updateDraft((current) => {
      // Find existing NavigationItem for this document, or create one
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
                  ...(resolvedDocumentId ? { documentId: resolvedDocumentId } : { contentId }),
                }
              : item,
          )
        : [
            ...current.items,
            {
              id: itemId,
              type: "document" as const,
              ...(resolvedDocumentId ? { documentId: resolvedDocumentId } : { contentId }),
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

  function addLinkItemToGroup(groupId: string, url: string, label: { en: string; ja: string }) {
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
            items: group.items.map((ref) => (ref.id === itemId ? { ...ref, enabled } : ref)),
          })),
        },
      },
    }));
  }

  function createUnassignedLinkItem(url: string, label: { en: string; ja: string }) {
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
      .filter((e): e is { item: NavigationItem; enabled: boolean } => e !== undefined);
  }

  const navbarGroups: NavbarGroupWithItems[] = deriveNavbarCommittedGroups(draft);

  const footerGroups: FooterGroupWithItems[] = draft.zones.footer.groups.map((group) => ({
    group,
    items: resolveGroupItems(group),
  }));

  return (
    <Card
      className="flex h-full flex-1 flex-col"
      caption="Site Navigation"
      containerClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between px-5 pt-5">
        <div>
          <p className="font-medium text-sm">Shared structure for both locales</p>
          <p className="text-foreground-light text-sm">
            Labels come from document titles and item labels. This editor changes ordering,
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
            variant="outline"
            onClick={handleResetToSaved}
            disabled={!isDirty || isSaving || isResetting}
          >
            Reset
          </Button>

          <Button type="button" onClick={handleSave} disabled={!isDirty || isSaving || isResetting}>
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {message ? (
        <AdminStatusMessage variant="success" className="mx-5 mt-4">
          {message}
        </AdminStatusMessage>
      ) : null}

      {error ? <AdminStatusMessage className="mx-5 mt-4">{error}</AdminStatusMessage> : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-5 px-5 pt-5 pb-5">
          {/* Navbar preview */}
          <section className="rounded-md border border-gray-200 p-4">
            <h2 className="font-medium text-base">Navbar</h2>
            <p className="mt-1 text-foreground-light text-sm">
              Drag groups to reorder. Drag items between groups to reassign.
            </p>
            <div className="mt-4">
              <NavbarEditor
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
            <h2 className="font-medium text-base">Footer</h2>
            <p className="mt-1 text-foreground-light text-sm">
              Drag group columns to reorder. Drag items between columns to reassign. Click a group
              header to rename it.
            </p>
            <div className="mt-4">
              <FooterEditor
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
