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
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { GripVertical } from "lucide-react";

import { Card } from "@/components/Card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  FOOTER_GROUP_IDS,
  type FooterGroupId,
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
        data: {
          config,
          expectedRevision: revision,
        },
      }),
  });

  const { mutateAsync: resetConfig, isPending: isResetting } = useMutation({
    mutationFn: async () =>
      $resetSiteNavigationConfig({
        data: {
          expectedRevision: revision,
        },
      }),
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

  function updateOrder(value: string, onValidNumber: (order: number) => void) {
    const parsed = Number(value);

    if (!Number.isInteger(parsed)) return;

    onValidNumber(parsed);
  }

  function handleFooterGroupDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    updateDraft((current) => {
      const groups = current.footerGroups
        .slice()
        .sort((a, b) => a.order - b.order);
      const oldIndex = groups.findIndex((group) => group.id === active.id);
      const newIndex = groups.findIndex((group) => group.id === over.id);

      if (oldIndex < 0 || newIndex < 0) return current;

      return {
        ...current,
        footerGroups: arrayMove(groups, oldIndex, newIndex).map(
          (group, index) => ({
            ...group,
            order: (index + 1) * 10,
          }),
        ),
      };
    });
  }

  function reorderNavbarItems(ids: NavigationItemId[]) {
    updateDraft((current) => {
      const orderMap = new Map(
        ids.map((id, index) => [id, (index + 1) * 10] as const),
      );

      return {
        ...current,
        items: current.items.map((item) =>
          item.navbar && orderMap.has(item.id)
            ? {
                ...item,
                navbar: {
                  ...item.navbar,
                  order: orderMap.get(item.id) ?? item.navbar.order,
                },
              }
            : item,
        ),
      };
    });
  }

  function handleNavbarScopeDragEnd(
    event: DragEndEvent,
    ids: NavigationItemId[],
  ) {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex = ids.findIndex((id) => id === active.id);
    const newIndex = ids.findIndex((id) => id === over.id);

    if (oldIndex < 0 || newIndex < 0) return;

    reorderNavbarItems(arrayMove(ids, oldIndex, newIndex));
  }

  function reorderFooterItems(ids: NavigationItemId[]) {
    updateDraft((current) => {
      const orderMap = new Map(
        ids.map((id, index) => [id, (index + 1) * 10] as const),
      );

      return {
        ...current,
        items: current.items.map((item) =>
          item.footer && orderMap.has(item.id)
            ? {
                ...item,
                footer: {
                  ...item.footer,
                  order: orderMap.get(item.id) ?? item.footer.order,
                },
              }
            : item,
        ),
      };
    });
  }

  function handleFooterScopeDragEnd(
    event: DragEndEvent,
    ids: NavigationItemId[],
  ) {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex = ids.findIndex((id) => id === active.id);
    const newIndex = ids.findIndex((id) => id === over.id);

    if (oldIndex < 0 || newIndex < 0) return;

    reorderFooterItems(arrayMove(ids, oldIndex, newIndex));
  }

  const sortedFooterGroups = draft.footerGroups
    .slice()
    .sort((a, b) => a.order - b.order);
  const topLevelNavbarItems = draft.items
    .filter((item) => item.navbar && !item.parentId)
    .slice()
    .sort((a, b) => (a.navbar?.order ?? 0) - (b.navbar?.order ?? 0));
  const navbarChildrenByParent = topLevelNavbarItems.map((parent) => ({
    parent,
    children: draft.items
      .filter((item) => item.parentId === parent.id && item.navbar)
      .slice()
      .sort((a, b) => (a.navbar?.order ?? 0) - (b.navbar?.order ?? 0)),
  }));
  const footerItemsByGroup = sortedFooterGroups.map((group) => ({
    group,
    items: draft.items
      .filter((item) => item.footer?.groupId === group.id)
      .slice()
      .sort((a, b) => (a.footer?.order ?? 0) - (b.footer?.order ?? 0)),
  }));

  return (
    <Card
      className="flex h-full flex-1 flex-col"
      caption="Site Navigation"
      containerClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between px-5 pt-5">
        <div>
          <p className="text-sm font-medium">Shared structure for both locales</p>
          <p className="text-foreground-light text-sm">
            Labels still come from translation keys. This editor changes
            ordering, visibility, navbar grouping, and footer grouping.
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
          <div className="grid gap-5 xl:grid-cols-2">
            <section className="rounded-md border border-gray-200 p-4">
              <h2 className="text-base font-medium">Quick Reorder: Navbar</h2>
              <p className="text-foreground-light mt-1 text-sm">
                Drag top-level items and each child group to update navbar order.
              </p>

              <div className="mt-4 flex flex-col gap-4">
                <SortableNavigationList
                  items={topLevelNavbarItems.map((item) => ({
                    id: item.id,
                    label: tNav(item.id),
                    meta: item.navbar?.enabled ? "Shown" : "Hidden",
                  }))}
                  onDragEnd={(event) =>
                    handleNavbarScopeDragEnd(
                      event,
                      topLevelNavbarItems.map((item) => item.id),
                    )
                  }
                />

                {navbarChildrenByParent
                  .filter(({ children }) => children.length > 0)
                  .map(({ parent, children }) => (
                    <div key={parent.id} className="rounded-md bg-gray-50 p-3">
                      <p className="text-sm font-medium">{tNav(parent.id)}</p>
                      <p className="text-foreground-light mt-1 text-xs">
                        Child items
                      </p>
                      <div className="mt-3">
                        <SortableNavigationList
                          items={children.map((item) => ({
                            id: item.id,
                            label: tNav(item.id),
                            meta: item.navbar?.enabled ? "Shown" : "Hidden",
                          }))}
                          onDragEnd={(event) =>
                            handleNavbarScopeDragEnd(
                              event,
                              children.map((item) => item.id),
                            )
                          }
                        />
                      </div>
                    </div>
                  ))}
              </div>
            </section>

            <section className="rounded-md border border-gray-200 p-4">
              <h2 className="text-base font-medium">Quick Reorder: Footer</h2>
              <p className="text-foreground-light mt-1 text-sm">
                Drag groups and items within each group to update footer order.
              </p>

              <div className="mt-4 flex flex-col gap-4">
                <div>
                  <p className="mb-3 text-sm font-medium">Footer groups</p>
                  <SortableNavigationList
                    items={sortedFooterGroups.map((group) => ({
                      id: group.id,
                      label: tFooter(group.labelKey),
                      meta: group.enabled ? "Enabled" : "Hidden",
                    }))}
                    onDragEnd={handleFooterGroupDragEnd}
                  />
                </div>

                {footerItemsByGroup.map(({ group, items }) => (
                  <div key={group.id} className="rounded-md bg-gray-50 p-3">
                    <p className="text-sm font-medium">{tFooter(group.labelKey)}</p>
                    <p className="text-foreground-light mt-1 text-xs">
                      Group items
                    </p>
                    <div className="mt-3">
                      <SortableNavigationList
                        items={items.map((item) => ({
                          id: item.id,
                          label: tNav(item.id),
                          meta: item.footer?.enabled ? "Shown" : "Hidden",
                        }))}
                        onDragEnd={(event) =>
                          handleFooterScopeDragEnd(
                            event,
                            items.map((item) => item.id),
                          )
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <section className="flex flex-col gap-4">
          <h2 className="text-base font-medium">Footer groups</h2>
          {sortedFooterGroups
            .map((group) => (
            <div
              key={group.id}
              className="rounded-md border border-gray-200 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">{tFooter(group.labelKey)}</p>
                  <p className="text-foreground-light text-sm">{group.id}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex w-24 flex-col gap-2">
                    <Label htmlFor={`group-order-${group.id}`}>Order</Label>
                    <Input
                      id={`group-order-${group.id}`}
                      type="number"
                      value={group.order}
                      onChange={(event) => {
                        updateOrder(event.target.value, (order) => {
                          updateDraft((current) => ({
                            ...current,
                            footerGroups: current.footerGroups.map((item) =>
                              item.id === group.id ? { ...item, order } : item,
                            ),
                          }));
                        });
                      }}
                    />
                  </div>

                  <label className="flex items-center gap-2 pt-7 text-sm">
                    Enabled
                    <Switch
                      checked={group.enabled}
                      disabled={group.id === "overview"}
                      onCheckedChange={(checked) => {
                        updateDraft((current) => ({
                          ...current,
                          footerGroups: current.footerGroups.map((item) =>
                            item.id === group.id
                              ? { ...item, enabled: checked }
                              : item,
                          ),
                        }));
                      }}
                    />
                  </label>
                </div>
              </div>
              {group.id === "overview" ? (
                <p className="text-foreground-light mt-3 text-xs">
                  The overview group stays enabled because it contains the
                  protected Home link.
                </p>
              ) : null}
            </div>
          ))}
            </section>

            <section className="flex flex-col gap-4">
          <h2 className="text-base font-medium">Navigation items</h2>
          {draft.items
            .slice()
            .sort((a, b) => {
              const aOrder =
                a.navbar?.order ?? a.footer?.order ?? Number.MAX_SAFE_INTEGER;
              const bOrder =
                b.navbar?.order ?? b.footer?.order ?? Number.MAX_SAFE_INTEGER;

              return aOrder - bOrder || a.id.localeCompare(b.id);
            })
            .map((item) => {
              const footerGroupId = item.footer?.groupId ?? FOOTER_GROUP_IDS[0];
              const isHome = item.id === "home";

              return (
                <div
                  key={item.id}
                  className="rounded-md border border-gray-200 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium">{tNav(item.id)}</p>
                      <p className="text-foreground-light text-sm">{item.id}</p>
                    </div>
                    {item.parentId ? (
                      <span className="text-foreground-light text-xs">
                        Parent: {tNav(item.parentId)}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    {item.navbar ? (
                      <div className="flex flex-col gap-3 rounded-md bg-gray-50 p-3">
                        <div className="flex items-center justify-between gap-4 text-sm">
                          <span className="font-medium">Navbar</span>
                          <Switch
                            checked={item.navbar.enabled}
                            disabled={isHome}
                            onCheckedChange={(checked) => {
                              updateDraft((current) => ({
                                ...current,
                                items: current.items.map((entry) =>
                                  entry.id === item.id && entry.navbar
                                    ? {
                                        ...entry,
                                        navbar: {
                                          ...entry.navbar,
                                          enabled: checked,
                                        },
                                      }
                                    : entry,
                                ),
                              }));
                            }}
                          />
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="flex flex-col gap-2">
                            <Label htmlFor={`navbar-order-${item.id}`}>
                              Order
                            </Label>
                            <Input
                              id={`navbar-order-${item.id}`}
                              type="number"
                              value={item.navbar.order}
                              onChange={(event) => {
                                updateOrder(event.target.value, (order) => {
                                  updateDraft((current) => ({
                                    ...current,
                                    items: current.items.map((entry) =>
                                      entry.id === item.id && entry.navbar
                                        ? {
                                            ...entry,
                                            navbar: {
                                              ...entry.navbar,
                                              order,
                                            },
                                          }
                                        : entry,
                                    ),
                                  }));
                                });
                              }}
                            />
                          </div>

                          <div className="flex flex-col gap-2">
                            <Label>Visibility group</Label>
                            <Select
                              value={item.navbar.visibility}
                              onValueChange={(value) => {
                                updateDraft((current) => ({
                                  ...current,
                                  items: current.items.map((entry) =>
                                    entry.id === item.id && entry.navbar
                                      ? {
                                          ...entry,
                                          navbar: {
                                            ...entry.navbar,
                                            visibility: value as
                                              | "essential"
                                              | "secondary",
                                          },
                                        }
                                      : entry,
                                  ),
                                }));
                              }}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="essential">
                                  Essential
                                </SelectItem>
                                <SelectItem value="secondary">
                                  Secondary
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {item.footer ? (
                      <div className="flex flex-col gap-3 rounded-md bg-gray-50 p-3">
                        <div className="flex items-center justify-between gap-4 text-sm">
                          <span className="font-medium">Footer</span>
                          <Switch
                            checked={item.footer.enabled}
                            disabled={isHome}
                            onCheckedChange={(checked) => {
                              updateDraft((current) => ({
                                ...current,
                                items: current.items.map((entry) =>
                                  entry.id === item.id && entry.footer
                                    ? {
                                        ...entry,
                                        footer: {
                                          ...entry.footer,
                                          enabled: checked,
                                        },
                                      }
                                    : entry,
                                ),
                              }));
                            }}
                          />
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="flex flex-col gap-2">
                            <Label htmlFor={`footer-order-${item.id}`}>
                              Order
                            </Label>
                            <Input
                              id={`footer-order-${item.id}`}
                              type="number"
                              value={item.footer.order}
                              onChange={(event) => {
                                updateOrder(event.target.value, (order) => {
                                  updateDraft((current) => ({
                                    ...current,
                                    items: current.items.map((entry) =>
                                      entry.id === item.id && entry.footer
                                        ? {
                                            ...entry,
                                            footer: {
                                              ...entry.footer,
                                              order,
                                            },
                                          }
                                        : entry,
                                    ),
                                  }));
                                });
                              }}
                            />
                          </div>

                          <div className="flex flex-col gap-2">
                            <Label>Footer group</Label>
                            <Select
                              value={footerGroupId}
                              onValueChange={(value: FooterGroupId) => {
                                updateDraft((current) => ({
                                  ...current,
                                  items: current.items.map((entry) =>
                                    entry.id === item.id && entry.footer
                                      ? {
                                          ...entry,
                                          footer: {
                                            ...entry.footer,
                                            groupId: value,
                                          },
                                        }
                                      : entry,
                                  ),
                                }));
                              }}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {draft.footerGroups
                                  .slice()
                                  .sort((a, b) => a.order - b.order)
                                  .map((group) => (
                                    <SelectItem key={group.id} value={group.id}>
                                      {tFooter(group.labelKey)}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {isHome ? (
                    <p className="text-foreground-light mt-4 text-xs">
                      Home is protected and cannot be hidden.
                    </p>
                  ) : null}
                </div>
              );
            })}
            </section>
          </div>
        </div>
      </div>
    </Card>
  );
}

function SortableNavigationList({
  items,
  onDragEnd,
}: {
  items: {
    id: string;
    label: string;
    meta?: string;
  }[];
  onDragEnd: (event: DragEndEvent) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  if (items.length === 0) {
    return (
      <div className="text-foreground-light rounded-md border border-dashed border-gray-300 px-3 py-4 text-sm">
        Nothing to reorder here.
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={items.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-2">
          {items.map((item, index) => (
            <SortableNavigationRow
              key={item.id}
              id={item.id}
              index={index}
              label={item.label}
              meta={item.meta}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableNavigationRow({
  id,
  index,
  label,
  meta,
}: {
  id: string;
  index: number;
  label: string;
  meta?: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-md border border-gray-200 bg-white px-3 py-2"
    >
      <button
        type="button"
        className="cursor-grab touch-none text-gray-400 hover:text-gray-600"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <span className="text-foreground-light w-8 text-sm">{index + 1}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{label}</p>
        {meta ? (
          <p className="text-foreground-light truncate text-xs">{meta}</p>
        ) : null}
      </div>
    </div>
  );
}
