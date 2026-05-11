import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import MDEditor from "@uiw/react-md-editor";
import { Plus, Trash2Icon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Card } from "@/components/Card";
import { DateRangePicker } from "@/components/DatePicker";
import { ListItem } from "@/components/ListItem";
import { MarkdownClientPreview } from "@/components/markdown/MarkdownClientPreview";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { i18n, type Locale } from "@/config/i18n";
import { hasPermission } from "@/config/permissions";
import { useFilters } from "@/hooks/useFilters";
import { cn } from "@/lib/utils";
import type { AlertRecord } from "@/repositories/alert";
import {
  $createAlert,
  $deleteAlert,
  $updateAlert,
  getAllAlertsInfiniteQueryOptions,
} from "@/serverFunctions/alert";
import useConfirmationStore from "@/stores/confirmationStore";
import { alertsAdminSearchParamsSchema } from "@/utils/queryParams";
import type { DateStringRange } from "@/utils/dates";
import { toDateString } from "@/utils/dates";

import { AddNewButton } from "./-components/AddNewButton";
import { AdminListItem } from "./-components/AdminListItem";
import { AlertsFiltersBar } from "./-components/AlertsFiltersBar";
import { TitleValue } from "./-components/TitleValue";

const NEW_ALERT_ID = "__new_alert__";

type AlertTranslationMap = Record<Locale, string>;

type AlertFormValues = {
  enabled: boolean;
  from: string | null;
  to: string | null;
  translations: AlertTranslationMap;
};

export const Route = createFileRoute("/{-$lang}/_layout/_authed/admin/alerts")({
  validateSearch: alertsAdminSearchParamsSchema,
  component: RouteComponent,
});

function RouteComponent() {
  const { selectedId: urlSelectedId } = Route.useSearch();
  const { setFilters } = useFilters(Route.id);
  const [selectedId, setSelectedId] = useState<string | undefined>(
    urlSelectedId,
  );

  if (selectedId !== urlSelectedId && urlSelectedId !== undefined) {
    setSelectedId(urlSelectedId);
  }

  function handleSelectAlert(id: string | undefined) {
    setSelectedId(id);
    setFilters({ selectedId: id });
  }

  return (
    <>
      <AlertsList
        selectedAlertId={selectedId}
        onSelectAlert={handleSelectAlert}
      />
      {selectedId ? (
        <AlertDetails
          key={selectedId}
          selectedAlertId={selectedId}
          onSelectAlert={handleSelectAlert}
        />
      ) : null}
    </>
  );
}

function AlertsList({
  selectedAlertId,
  onSelectAlert,
}: {
  selectedAlertId?: string;
  onSelectAlert: (id?: string) => void;
}) {
  const { user } = useRouteContext({ from: "__root__" });
  const canCreate = hasPermission(user, "alerts", "create");
  const canDelete = hasPermission(user, "alerts", "delete");
  const canUpdate = hasPermission(user, "alerts", "update");
  const { openConfirmation } = useConfirmationStore();
  const queryClient = useQueryClient();
  const { q, activeFrom, activeTo } = Route.useSearch();
  const alertsQO = getAllAlertsInfiniteQueryOptions({
    q,
    activeFrom,
    activeTo,
  });
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isPending,
  } = useInfiniteQuery(alertsQO);
  const alerts = data?.pages.flat() ?? [];
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const listItems = useMemo(() => {
    if (selectedAlertId !== NEW_ALERT_ID) return alerts;

    return [
      {
        id: NEW_ALERT_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
        enabled: true,
        authorId: user?.id ?? "",
        author: { name: user?.name ?? null },
        updatedById: user?.id ?? "",
        updatedBy: { name: user?.name ?? null },
        from: null,
        to: null,
        translations: {} as Partial<Record<Locale, { content: string }>>,
      },
      ...alerts,
    ];
  }, [alerts, selectedAlertId, user?.id, user?.name]);

  function handleDeleteAlert(id: string) {
    openConfirmation({
      title: "Delete alert?",
      description:
        "This will permanently remove the alert and its translations.",
      onAction: async () => {
        const prevAlerts = queryClient.getQueryData<
          InfiniteData<AlertRecord[], number>
        >(alertsQO.queryKey);

        queryClient.setQueryData<InfiniteData<AlertRecord[], number>>(
          alertsQO.queryKey,
          (prev) =>
            updateInfiniteAlertPages(prev, (page) =>
              page.filter((alert) => alert.id !== id),
            ),
        );
        onSelectAlert(undefined);

        try {
          await $deleteAlert({ data: { id } });
        } catch (error) {
          queryClient.setQueryData(alertsQO.queryKey, prevAlerts);
          throw error;
        } finally {
          queryClient.invalidateQueries({ queryKey: ["alerts"] });
        }
      },
      cancelLabel: "Cancel",
      actionLabel: (
        <>
          <Trash2Icon className="mr-2 inline size-5 text-white" />
          Delete
        </>
      ),
    });
  }

  async function handleToggleEnabled(targetAlert: AlertRecord) {
    const prevAlerts = queryClient.getQueryData<
      InfiniteData<AlertRecord[], number>
    >(alertsQO.queryKey);
    const now = new Date();
    const optimisticAlert: AlertRecord = {
      ...targetAlert,
      enabled: !targetAlert.enabled,
      updatedAt: now,
      updatedById: user?.id ?? targetAlert.updatedById,
      updatedBy: {
        name: user?.name ?? targetAlert.updatedBy.name,
      },
    };

    queryClient.setQueryData<InfiniteData<AlertRecord[], number>>(
      alertsQO.queryKey,
      (prev) =>
        updateInfiniteAlertPages(prev, (page) =>
          page.map((alert) =>
            alert.id === targetAlert.id ? optimisticAlert : alert,
          ),
        ),
    );

    try {
      const saved = await $updateAlert({
        data: {
          id: targetAlert.id,
          enabled: !targetAlert.enabled,
          from: targetAlert.from ?? undefined,
          to: targetAlert.to ?? undefined,
          translations: i18n.locales
            .map((lang) => ({
              lang,
              content: targetAlert.translations[lang]?.content?.trim() ?? "",
            }))
            .filter((translation) => translation.content.length > 0),
        },
      });

      queryClient.setQueryData<InfiniteData<AlertRecord[], number>>(
        alertsQO.queryKey,
        (prev) =>
          updateInfiniteAlertPages(prev, (page) =>
            page.map((alert) => (alert.id === saved.id ? saved : alert)),
          ),
      );
    } catch (error) {
      queryClient.setQueryData(alertsQO.queryKey, prevAlerts);
      throw error;
    } finally {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    }
  }

  return (
    <Card
      caption="Alerts"
      className="w-cms-list-panel flex h-full flex-col"
      containerClassName="flex-1 flex flex-col max-h-full"
    >
      <div>
        <AlertsFiltersBar />
        {canCreate ? (
          <AddNewButton
            className="mb-5"
            onClick={() => onSelectAlert(NEW_ALERT_ID)}
          >
            <Plus className="size-5" />
            <span className="ml-2">Add alert</span>
          </AddNewButton>
        ) : null}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : (
          <ul
            className={cn(
              "h-full overflow-y-auto transition-opacity",
              isFetching && !isFetchingNextPage && "opacity-60",
            )}
          >
            {listItems.map((alert, index) => {
              const isDraft = alert.id === NEW_ALERT_ID;
              const previewTranslations = i18n.locales
                .map((translationLocale) => ({
                  locale: translationLocale,
                  content: alert.translations[translationLocale]?.content,
                }))
                .filter(
                  (
                    translation,
                  ): translation is { locale: Locale; content: string } =>
                    !!translation.content,
                );

              return (
                <li key={alert.id}>
                  <ListItem
                    onClick={() => onSelectAlert(alert.id)}
                    isActive={selectedAlertId === alert.id}
                    className={cn("mb-2", { "border border-dashed": isDraft })}
                  >
                    <AdminListItem
                      id={alert.id}
                      header={isDraft ? "New alert" : ""}
                      translations={
                        previewTranslations.length > 0
                          ? previewTranslations.map((translation) => ({
                              lang: translation.locale,
                              statuses: {
                                published: translation.content,
                              },
                            }))
                          : [
                              {
                                lang: i18n.defaultLocale,
                                statuses: {
                                  published: "Untitled alert",
                                },
                              },
                            ]
                      }
                      meta={
                        <div className="space-y-1">
                          {!alert.enabled ? (
                            <div className="text-foreground-light text-xs group-data-[active=true]:text-white/80">
                              Disabled
                            </div>
                          ) : null}
                          {(alert.from || alert.to) && !isDraft ? (
                            <div className="text-foreground-light font-mono text-xs group-data-[active=true]:text-white/80">
                              {alert.from ?? "Any time"} -{" "}
                              {alert.to ?? "Open ended"}
                            </div>
                          ) : null}
                        </div>
                      }
                      menuItems={[
                        ...(!isDraft && canUpdate
                          ? [
                              {
                                label: (
                                  <Label>
                                    {alert.enabled ? "Disable" : "Enable"}
                                  </Label>
                                ),
                                onSelect: () => {
                                  void handleToggleEnabled(alert);
                                },
                              },
                            ]
                          : []),
                        ...(!isDraft && canDelete
                          ? [
                              {
                                label: (
                                  <Label className="flex justify-between">
                                    <Trash2Icon className="size-4" />
                                    Delete
                                  </Label>
                                ),
                                onSelect: () => handleDeleteAlert(alert.id),
                                variant: "destructive" as const,
                              },
                            ]
                          : []),
                      ]}
                    />
                  </ListItem>
                  {index < listItems.length - 1 ? (
                    <hr className="my-2 border-gray-200" />
                  ) : null}
                </li>
              );
            })}
            <div ref={sentinelRef} className="h-4 shrink-0">
              {isFetchingNextPage ? (
                <span className="text-foreground-light block py-2 text-center text-xs">
                  Loading more…
                </span>
              ) : null}
            </div>
          </ul>
        )}

        {isFetching && !isFetchingNextPage && data ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10">
            <div className="bg-primary/20 mx-2 h-1 rounded-full">
              <div className="bg-primary h-full w-1/3 animate-pulse rounded-full" />
            </div>
          </div>
        ) : null}

        {!isPending && data && alerts.length === 0 ? (
          <div className="text-foreground-light flex h-full items-center justify-center text-sm">
            No alerts found
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function AlertDetails({
  selectedAlertId,
  onSelectAlert,
}: {
  selectedAlertId: string;
  onSelectAlert: (id?: string) => void;
}) {
  const { user } = useRouteContext({ from: "__root__" });
  const canCreate = hasPermission(user, "alerts", "create");
  const canUpdate = hasPermission(user, "alerts", "update");

  const queryClient = useQueryClient();
  const { q, activeFrom, activeTo } = Route.useSearch();
  const alertsQO = getAllAlertsInfiniteQueryOptions({
    q,
    activeFrom,
    activeTo,
  });
  const { data } = useInfiniteQuery(alertsQO);
  const alerts = data?.pages.flat() ?? [];
  const alert = alerts.find((item) => item.id === selectedAlertId);
  const isNew = selectedAlertId === NEW_ALERT_ID;
  const canSave = isNew ? canCreate : canUpdate;
  const initialValues = buildInitialValues(alert);

  const [activeLocale, setActiveLocale] = useState<Locale>(i18n.defaultLocale);
  const [values, setValues] = useState<AlertFormValues>(() => initialValues);
  const hasAnyContent = Object.values(values.translations).some(
    (translation) => translation.trim().length > 0,
  );
  const isDirty = isNew
    ? hasAnyContent
    : areAlertValuesDirty(values, initialValues);
  const dateRange =
    values.from || values.to
      ? { from: values.from ?? undefined, to: values.to ?? undefined }
      : undefined;

  const { mutate: saveAlert, isPending } = useMutation({
    mutationFn: async () => {
      const payload = {
        enabled: values.enabled,
        from: values.from ?? undefined,
        to: values.to ?? undefined,
        translations: i18n.locales
          .map((lang) => ({
            lang,
            content: values.translations[lang].trim(),
          }))
          .filter((translation) => translation.content.length > 0),
      };

      if (isNew) {
        return $createAlert({ data: payload });
      }

      return $updateAlert({
        data: {
          id: selectedAlertId,
          ...payload,
        },
      });
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["alerts"] });

      const prevAlerts =
        queryClient.getQueryData<InfiniteData<AlertRecord[], number>>(
          alertsQO.queryKey,
        ) ?? emptyInfiniteAlertData();
      const now = new Date();
      const optimisticAlert = buildOptimisticAlertRecord({
        id: isNew ? `optimistic-alert-${now.getTime()}` : selectedAlertId,
        values,
        createdAt: alert?.createdAt ?? now,
        updatedAt: now,
        authorId: alert?.authorId ?? user?.id ?? "",
        authorName: alert?.author.name ?? user?.name ?? null,
        updatedById: user?.id ?? alert?.updatedById ?? "",
        updatedByName: user?.name ?? alert?.updatedBy.name ?? null,
      });

      queryClient.setQueryData<InfiniteData<AlertRecord[], number>>(
        alertsQO.queryKey,
        (prev) => {
          if (isNew) {
            return prependAlertToInfinitePages(prev, optimisticAlert);
          }

          return updateInfiniteAlertPages(prev, (page) =>
            page.map((item) =>
              item.id === selectedAlertId ? optimisticAlert : item,
            ),
          );
        },
      );

      if (isNew) {
        onSelectAlert(optimisticAlert.id);
      }

      return { prevAlerts, optimisticId: optimisticAlert.id };
    },
    onSuccess: async (saved, _vars, context) => {
      queryClient.setQueryData<InfiniteData<AlertRecord[], number>>(
        alertsQO.queryKey,
        (prev) =>
          updateInfiniteAlertPages(prev, (page) =>
            page.map((item) =>
              item.id === saved.id ||
              item.id === context?.optimisticId ||
              (!isNew && item.id === selectedAlertId)
                ? saved
                : item,
            ),
          ),
      );
      onSelectAlert(saved.id);
    },
    onError: (_error, _vars, context) => {
      queryClient.setQueryData(alertsQO.queryKey, context?.prevAlerts);
      if (isNew) {
        onSelectAlert(NEW_ALERT_ID);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
  });

  if (!isNew && !alert) {
    return (
      <Card className="flex h-full flex-1 flex-col" caption="Alert details">
        Alert not found.
      </Card>
    );
  }

  return (
    <Card
      caption="Alert details"
      className="flex h-full flex-1 flex-col"
      containerClassName="flex flex-1 flex-col gap-4"
    >
      <div className="flex items-center justify-end gap-4">
        <Button
          disabled={!canSave || isPending || !hasAnyContent || !isDirty}
          size="lg"
          onClick={() => saveAlert()}
        >
          {isNew ? "Create" : "Update"}
        </Button>
      </div>

      {!isNew && alert ? (
        <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
          <TitleValue
            title="Author"
            value={alert.author.name ?? alert.authorId}
          />
          <TitleValue
            title="Created at"
            value={toDateString(alert.createdAt)}
          />
          <TitleValue
            title="Updated by"
            value={alert.updatedBy.name ?? alert.updatedById}
          />
          <TitleValue
            title="Updated at"
            value={toDateString(alert.updatedAt)}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-start gap-6">
        <TitleValue
          title="Enabled"
          value={
            <Switch
              checked={values.enabled}
              disabled={!canSave || isPending}
              onCheckedChange={(checked) =>
                setValues((prev) => ({ ...prev, enabled: checked }))
              }
            />
          }
        />

        <TitleValue
          title="Active date range"
          value={
            <DateRangePicker
              value={dateRange}
              onSelect={(range: DateStringRange) =>
                setValues((prev) => ({
                  ...prev,
                  from: range.from ?? null,
                  to: range.to ?? null,
                }))
              }
              onClear={() =>
                setValues((prev) => ({
                  ...prev,
                  from: null,
                  to: null,
                }))
              }
            />
          }
        />
      </div>

      <Tabs
        value={activeLocale}
        onValueChange={(value) => setActiveLocale(value as Locale)}
        className="flex flex-1 flex-col"
      >
        <TabsList variant="line">
          {i18n.locales.map((translationLocale) => (
            <TabsTrigger
              key={translationLocale}
              value={translationLocale}
              variant="line"
            >
              {translationLocale.toUpperCase()}
            </TabsTrigger>
          ))}
        </TabsList>

        {i18n.locales.map((translationLocale) => (
          <TabsContent
            key={translationLocale}
            value={translationLocale}
            className="flex flex-1 flex-col gap-2"
          >
            <Label className="text-sm font-medium">Content</Label>
            <div data-color-mode="light" className="min-h-0 flex-1">
              <MDEditor
                value={values.translations[translationLocale]}
                onChange={(value) =>
                  setValues((prev) => ({
                    ...prev,
                    translations: {
                      ...prev.translations,
                      [translationLocale]: value || "",
                    },
                  }))
                }
                height="100%"
                className="md-editor flex-1"
                preview="edit"
                textareaProps={{
                  placeholder: "Alert content",
                  disabled: !canSave || isPending,
                }}
                components={{
                  preview: (source) => (
                    <MarkdownClientPreview source={source} />
                  ),
                }}
              />
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </Card>
  );
}

function buildInitialValues(alert?: {
  enabled: boolean;
  from: string | null;
  to: string | null;
  translations: Partial<Record<Locale, { content: string }>>;
}): AlertFormValues {
  return {
    enabled: alert?.enabled ?? true,
    from: alert?.from ?? null,
    to: alert?.to ?? null,
    translations: {
      en: alert?.translations.en?.content ?? "",
      ja: alert?.translations.ja?.content ?? "",
    },
  };
}

function areAlertValuesDirty(
  current: AlertFormValues,
  initial: AlertFormValues,
): boolean {
  if (current.enabled !== initial.enabled) return true;
  if (current.from !== initial.from) return true;
  if (current.to !== initial.to) return true;

  return i18n.locales.some(
    (locale) => current.translations[locale] !== initial.translations[locale],
  );
}

function buildOptimisticAlertRecord({
  id,
  values,
  createdAt,
  updatedAt,
  authorId,
  authorName,
  updatedById,
  updatedByName,
}: {
  id: string;
  values: AlertFormValues;
  createdAt: Date;
  updatedAt: Date;
  authorId: string;
  authorName: string | null;
  updatedById: string;
  updatedByName: string | null;
}): AlertRecord {
  return {
    id,
    createdAt,
    updatedAt,
    enabled: values.enabled,
    authorId,
    author: {
      name: authorName,
    },
    updatedById,
    updatedBy: {
      name: updatedByName,
    },
    from: values.from,
    to: values.to,
    translations: Object.fromEntries(
      i18n.locales
        .map((locale) => [locale, values.translations[locale].trim()])
        .filter(([, content]) => content.length > 0)
        .map(([locale, content]) => [locale, { content }]),
    ) as Partial<Record<Locale, { content: string }>>,
  };
}

function emptyInfiniteAlertData(): InfiniteData<AlertRecord[], number> {
  return {
    pages: [[]],
    pageParams: [0],
  };
}

function updateInfiniteAlertPages(
  data: InfiniteData<AlertRecord[], number> | undefined,
  mapPage: (page: AlertRecord[]) => AlertRecord[],
): InfiniteData<AlertRecord[], number> {
  if (!data) return emptyInfiniteAlertData();

  return {
    ...data,
    pages: data.pages.map(mapPage),
  };
}

function prependAlertToInfinitePages(
  data: InfiniteData<AlertRecord[], number> | undefined,
  alert: AlertRecord,
): InfiniteData<AlertRecord[], number> {
  if (!data || data.pages.length === 0) {
    return {
      pages: [[alert]],
      pageParams: [0],
    };
  }

  return {
    ...data,
    pages: data.pages.map((page, index) =>
      index === 0 ? [alert, ...page] : page,
    ),
  };
}
