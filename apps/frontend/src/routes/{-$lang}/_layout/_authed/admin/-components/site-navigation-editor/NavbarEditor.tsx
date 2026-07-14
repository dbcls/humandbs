import { CollisionPriority } from "@dnd-kit/abstract";
import { move } from "@dnd-kit/helpers";
import { DragDropProvider, DragOverlay, useDroppable } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { Check, FileText, GripVertical, Link2, Plus, Trash2, X } from "lucide-react";
import { useTranslations } from "use-intl";

import type { Ref } from "react";
import { useEffect, useRef, useState } from "react";

import { LocaleInlineEditor } from "@/components/LocaleInlineEditor";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { Locale } from "@/config/i18n";
import type { NavigationItem, NavPriority } from "@/config/siteNavigation";
import type { DocumentsListItemResponse } from "@/repositories/document";

import {
  CardWithPath,
  EditableLinkLabel,
  EditorTextInput,
  FooterDocOverlay,
  getDocumentLabel,
  getEditorItemLabel,
  getEditorItemPath,
  LabeledInputRow,
  NavigationItemLeadingIcon,
} from "./shared";
import type { ItemsRecord, NavbarGroupWithItems } from "./types";

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
  return value.startsWith("navbar-group-sub:") ? value.slice("navbar-group-sub:".length) : null;
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
    subItems: group.subItems.map((item) => (item.item.id === itemId ? updater(item) : item)),
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

export type NavbarEditorProps = {
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
};

export function NavbarEditor({
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
}: NavbarEditorProps) {
  const [groups, setGroups] = useState<NavbarGroupWithItems[]>(groupsProp);
  const isDraggingRef = useRef(false);
  const snapshotRef = useRef<NavbarGroupWithItems[]>(groupsProp);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabelEn, setNewLabelEn] = useState("");
  const [newLabelJa, setNewLabelJa] = useState("");

  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [draggingDocContentId, setDraggingDocContentId] = useState<string | null>(null);
  const [draggingLinkItemId, setDraggingLinkItemId] = useState<string | null>(null);

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
          ...(group.linkedItem ? [{ item: group.linkedItem.item, enabled: true }] : []),
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

  const documentPathById = new Map(documents.map((doc) => [doc.id, doc.contentId] as const));

  const docItemMap = new Map<string, NavigationItem>(
    allItems
      .filter((item) => item.type === "document")
      .flatMap((item) => [
        ...(item.documentId ? ([[item.documentId, item]] as const) : []),
        ...(item.contentId ? ([[item.contentId, item]] as const) : []),
      ]),
  );

  const unassignedLinkItems = allItems.filter(
    (item): item is Extract<NavigationItem, { type: "link" }> =>
      item.type === "link" && !assignedItemIds.has(item.id),
  );

  const documentTitleByContentId = new Map([
    ...documents.map((doc) => [doc.contentId, getDocumentLabel(doc, lang)] as const),
    ...documents.map((doc) => [doc.id, getDocumentLabel(doc, lang)] as const),
  ]);

  function normalizeGroups(nextGroups: NavbarGroupWithItems[]): NavbarGroupWithItems[] {
    return nextGroups.map((group) => ({
      ...group,
      group: {
        ...group.group,
        enabled: group.linkedItem || group.subItems.length > 0 ? group.group.enabled : false,
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
      record[getNavbarGroupSubItemsId(group.group.id)] = group.subItems.map((item) => item.item.id);
    }

    return record;
  }

  function applyItemsRecord(
    record: ItemsRecord,
    prevGroups: NavbarGroupWithItems[],
  ): NavbarGroupWithItems[] {
    const groupOrder = record._groups as string[];
    const groupById = new Map(
      prevGroups.map((group) => [getNavbarGroupSortId(group.group.id), group]),
    );
    const itemById = new Map(
      prevGroups.flatMap((group) => [
        ...(group.linkedItem
          ? [[group.linkedItem.item.id, { item: group.linkedItem.item, enabled: true }] as const]
          : []),
        ...group.subItems.map((item) => [item.item.id, item] as const),
      ]),
    );

    return groupOrder
      .map((groupSortId) => {
        const group = groupById.get(groupSortId);
        if (!group) return null;

        const linkedItemId = record[getNavbarGroupLinkedSlotId(group.group.id)]?.[0];
        const linkedItem = linkedItemId ? itemById.get(linkedItemId) : undefined;

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
              return normalizeGroups(applyItemsRecord(next as ItemsRecord, prev));
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
          <NavbarUnassignedPool
            documents={documents}
            lang={lang}
            docItemMap={docItemMap}
            assignedItemIds={assignedItemIds}
            unassignedLinkItems={unassignedLinkItems}
            groups={groups}
            draggingItemId={draggingItemId}
            onDeleteLinkItem={onDeleteLinkItem}
          />

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
                      documents.find((doc) => doc.contentId === draggingDocContentId)!,
                      lang,
                    )
                  : draggingDocContentId
              }
            />
          ) : draggingLinkItemId ? (
            <NavbarItemOverlay
              item={unassignedLinkItems.find((item) => item.id === draggingLinkItemId)!}
              lang={lang}
              documentPathById={documentPathById}
              documentTitleByContentId={documentTitleByContentId}
            />
          ) : null}
        </DragOverlay>
      </DragDropProvider>

      {showAddForm ? (
        <div className="rounded-md border border-gray-200 bg-white p-3 shadow-sm">
          <p className="mb-2 font-medium text-gray-600 text-xs">New group</p>
          <div className="flex flex-col gap-2">
            <LabeledInputRow
              label="EN"
              value={newLabelEn}
              onChange={setNewLabelEn}
              placeholder="English name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddGroup();
                if (e.key === "Escape") cancelAddGroup();
              }}
            />
            <LabeledInputRow
              label="JA"
              value={newLabelJa}
              onChange={setNewLabelJa}
              placeholder="Japanese name"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddGroup();
                if (e.key === "Escape") cancelAddGroup();
              }}
            />
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

function NavbarUnassignedPool({
  documents,
  lang,
  docItemMap,
  assignedItemIds,
  unassignedLinkItems,
  groups,
  draggingItemId,
  onDeleteLinkItem,
}: {
  documents: DocumentsListItemResponse[];
  lang: Locale;
  docItemMap: Map<string, NavigationItem>;
  assignedItemIds: Set<string>;
  unassignedLinkItems: NavigationItem<"link">[];
  groups: NavbarGroupWithItems[];
  draggingItemId: string | null;
  onDeleteLinkItem: (itemId: string) => void;
}) {
  const { ref: poolDropRef, isDropTarget } = useDroppable({
    id: NAVBAR_UNASSIGNED_POOL_ID + "-droppable",
    collisionPriority: CollisionPriority.Low,
  });

  const itemGroupName = new Map<string, string>();
  for (const group of groups) {
    const label = group.group.label.en ?? group.group.label.ja ?? "";
    if (group.linkedItem) itemGroupName.set(group.linkedItem.item.id, label);
    for (const item of group.subItems) {
      itemGroupName.set(item.item.id, label);
    }
  }

  return (
    <div
      ref={poolDropRef}
      className={[
        "flex h-fit min-h-[300px] w-72 shrink-0 flex-col rounded-md border border-gray-200 bg-gray-50 p-3 transition-colors lg:w-80",
        isDropTarget ? "border-blue-300 bg-blue-50" : "",
      ].join(" ")}
    >
      <p className="mb-2 shrink-0 font-semibold text-gray-500 text-xs uppercase">
        Available navbar items
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <ul className="flex flex-col gap-1">
          {documents
            .filter((doc) => !doc.hideFromNav)
            .map((doc) => {
              const navItem = docItemMap.get(doc.id) ?? docItemMap.get(doc.contentId);
              const isAssigned = navItem ? assignedItemIds.has(navItem.id) : false;
              const groupName = navItem ? itemGroupName.get(navItem.id) : undefined;
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
            <p className="mt-3 mb-2 font-semibold text-gray-500 text-xs uppercase">
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
      <CardWithPath path={doc.contentId}>
        <div className="flex items-start gap-1.5">
          <GripVertical className="mt-0.5 size-3 shrink-0 text-gray-400" />
          <FileText className="mt-0.5 size-3 shrink-0 text-sky-600" />
          <div className="min-w-0 flex-1">
            <span className="break-words">{getDocumentLabel(doc, lang)}</span>
            {isAssigned && (
              <span className="mt-0.5 block w-fit rounded bg-gray-200 px-1 py-0.5 text-2xs text-gray-500">
                {groupName ?? "assigned"}
              </span>
            )}
          </div>
        </div>
      </CardWithPath>
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
  item: NavigationItem<"link">;
  index: number;
  lang: Locale;
  isDragSource: boolean;
  onDelete: () => void;
}) {
  const tNav = useTranslations("admin.navigation");
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
        title={tNav("delete-link")}
      >
        <Trash2 className="size-3.5" />
      </button>
    </li>
  );
}

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
  const tNav = useTranslations("admin.navigation");
  const [showLinkedAddLink, setShowLinkedAddLink] = useState(false);
  const [showSubAddLink, setShowSubAddLink] = useState(false);
  const [linkedUrl, setLinkedUrl] = useState("");
  const [linkedEn, setLinkedEn] = useState("");
  const [linkedJa, setLinkedJa] = useState("");
  const [subUrl, setSubUrl] = useState("");
  const [subEn, setSubEn] = useState("");
  const [subJa, setSubJa] = useState("");
  const { ref: linkedDropRef, isDropTarget: isLinkedDropTarget } = useDroppable({
    id: getNavbarGroupLinkedSlotId(g.group.id),
    accept: [NAVBAR_ASSIGNED_ITEM_TYPE, NAVBAR_UNASSIGNED_DOC_TYPE, NAVBAR_UNASSIGNED_LINK_TYPE],
    collisionPriority: CollisionPriority.Low,
    disabled: g.linkedItem !== undefined,
  });

  const { ref: subItemsDropRef, isDropTarget: isSubItemsDropTarget } = useDroppable({
    id: getNavbarGroupSubItemsId(g.group.id),
    accept: [NAVBAR_ASSIGNED_ITEM_TYPE, NAVBAR_UNASSIGNED_DOC_TYPE, NAVBAR_UNASSIGNED_LINK_TYPE],
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

  function updateCurrentGroup(updater: (group: NavbarGroupWithItems) => NavbarGroupWithItems) {
    onCommit(allGroups.map((group) => (group.group.id === g.group.id ? updater(group) : group)));
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
        "min-w-40 max-w-96 shrink-0 rounded-md bg-white shadow-sm ring-1 ring-gray-200 transition-opacity",
        isDragging ? "opacity-40" : "",
        !g.group.enabled ? "opacity-50" : "",
        (isLinkedDropTarget || isSubItemsDropTarget) && !isDragging ? "ring-2 ring-blue-400" : "",
      ].join(" ")}
    >
      <div className="flex flex-col gap-2 border-gray-100 border-b px-3 py-2">
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
                en: g.group.label.en ?? "",
                ja: g.group.label.ja ?? "",
              }}
              onChange={({ en, ja }) => onRenameGroup(g.group.id, { en, ja })}
              className="font-semibold text-gray-500 text-xs uppercase"
              required
            />
          </div>
          <Switch
            checked={g.group.enabled}
            disabled={!canEnableGroup}
            onCheckedChange={(checked) => onToggleGroupEnabled(g.group.id, checked)}
            className="shrink-0 scale-75"
          />
          <button
            type="button"
            onClick={() => onDeleteGroup(g.group.id)}
            className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
            title={tNav("delete-group")}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
        <Select
          value={priority}
          onValueChange={(value) => onChangePriority(g.group.id, value as NavPriority)}
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
          g.linkedItem ? "border-gray-200" : "border-gray-300 border-dashed bg-gray-50",
          isLinkedDropTarget ? "border-blue-400 bg-blue-50" : "",
        ].join(" ")}
      >
        <p className="mb-1 font-semibold text-2xs text-gray-400 uppercase">Linked item</p>
        {g.linkedItem ? (
          <NavbarLinkedItemRow
            item={g.linkedItem.item}
            groupId={g.group.id}
            lang={lang}
            documentPathById={documentPathById}
            documentTitleByContentId={documentTitleByContentId}
            onSave={(value) =>
              updateCurrentGroup((group) => {
                if (!group.linkedItem || group.linkedItem.item.id !== g.linkedItem!.item.id) {
                  return group;
                }

                return {
                  ...group,
                  linkedItem: {
                    item: {
                      ...group.linkedItem.item,
                      url: value.url,
                      label: value.label,
                    },
                  },
                };
              })
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
            <p className="text-foreground-light text-xs">{tNav("drop-document-or-link")}</p>
            <button
              type="button"
              onClick={() => setShowLinkedAddLink(true)}
              className="mt-2 flex items-center gap-1 rounded px-1 py-1 text-gray-400 text-xs hover:bg-gray-100 hover:text-gray-600"
            >
              <Plus className="size-3" />
              Add link
            </button>
          </div>
        )}
      </div>

      <div className="border-gray-100 border-t px-2 py-2">
        <p className="mb-1 font-semibold text-2xs text-gray-400 uppercase">Sub-groups</p>
        <ul
          ref={subItemsDropRef as Ref<HTMLUListElement>}
          className={[
            "flex min-h-8 flex-col gap-1 rounded border p-2",
            g.subItems.length === 0
              ? "border-gray-300 border-dashed bg-gray-50"
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
                  updateNavbarAssignedItem(allGroups, item.id, (currentItem) => ({
                    ...currentItem,
                    item: {
                      ...currentItem.item,
                      url: value.url,
                      label: value.label,
                    },
                  })),
                )
              }
              onRemove={() => onCommit(removeNavbarAssignedItem(allGroups, item.id))}
              onToggleEnabled={(checked) =>
                onCommit(
                  updateNavbarAssignedItem(allGroups, item.id, (currentItem) => ({
                    ...currentItem,
                    enabled: checked,
                  })),
                )
              }
            />
          ))}
          {g.subItems.length === 0 && (
            <li className="px-2 py-3 text-foreground-light text-xs">{tNav("drop-submenu-items")}</li>
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
              className="flex w-full items-center gap-1 rounded px-1 py-1 text-gray-400 text-xs hover:bg-gray-50 hover:text-gray-600"
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
  const tNav = useTranslations("admin.navigation");
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
      <CardWithPath path={itemPath}>
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
            className="min-w-0 flex-1 whitespace-normal break-words text-left text-xs"
            onSave={onSave}
          />
        </div>
      </CardWithPath>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
        title={tNav("remove-item")}
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
  const tNav = useTranslations("admin.navigation");
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
      <CardWithPath path={itemPath}>
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
            className="min-w-0 flex-1 whitespace-normal break-words text-left text-xs"
            onSave={onSave}
          />
        </div>
      </CardWithPath>
      <Switch checked={enabled} onCheckedChange={onToggleEnabled} className="shrink-0 scale-75" />
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
        title={tNav("remove-item")}
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
      <EditorTextInput
        value={url}
        onChange={onChangeUrl}
        placeholder="URL"
        autoFocus
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
      />
      <LabeledInputRow
        label="EN"
        value={labelEn}
        onChange={onChangeLabelEn}
        placeholder="English label"
        onKeyDown={(event) => {
          if (event.key === "Enter") onConfirm();
          if (event.key === "Escape") onCancel();
        }}
      />
      <LabeledInputRow
        label="JA"
        value={labelJa}
        onChange={onChangeLabelJa}
        placeholder="Japanese label"
        onKeyDown={(event) => {
          if (event.key === "Enter") onConfirm();
          if (event.key === "Escape") onCancel();
        }}
      />
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
  const tNav = useTranslations("admin.navigation");

  const groupLabel = g.group.label[lang] ?? g.group.label.en ?? g.group.label.ja ?? "";
  return (
    <div
      className={[
        "min-w-40 max-w-96 shrink-0 rounded-md bg-white shadow-lg ring-2 ring-blue-300",
        !g.group.enabled ? "opacity-50" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-1 border-gray-100 border-b px-3 py-2">
        <GripVertical className="size-4 shrink-0 text-gray-400" />
        <span className="flex-1 truncate font-semibold text-gray-500 text-xs uppercase">
          {groupLabel}
        </span>
      </div>
      <ul className="flex flex-col gap-1 p-2">
        {g.linkedItem ? (
          <li key={g.linkedItem.item.id} className="flex items-start gap-1 rounded px-1 py-1">
            <NavigationItemLeadingIcon item={g.linkedItem.item} />
            <span className="min-w-0 flex-1 whitespace-normal break-words text-xs">
              {getEditorItemLabel(g.linkedItem.item, lang, documentTitleByContentId)}
            </span>
          </li>
        ) : (
          <li className="px-2 py-2 text-foreground-light text-xs">{tNav("no-linked-item")}</li>
        )}
      </ul>
      <div className="border-gray-100 border-t px-2 py-2">
        <p className="mb-1 font-semibold text-2xs text-gray-400 uppercase">Sub-groups</p>
        <ul className="flex flex-col gap-1">
          {g.subItems.map(({ item, enabled }) => (
            <li key={item.id} className="flex items-start gap-1 rounded px-1 py-1">
              <NavigationItemLeadingIcon item={item} />
              <span className="min-w-0 flex-1 whitespace-normal break-words text-xs">
                {getEditorItemLabel(item, lang, documentTitleByContentId)}
              </span>
              {!enabled ? <span className="text-2xs text-gray-400">off</span> : null}
            </li>
          ))}
          {g.subItems.length === 0 && (
            <li className="px-2 py-2 text-foreground-light text-xs">{tNav("no-submenu-items")}</li>
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
      <CardWithPath path={itemPath}>
        <div className="flex items-start gap-1">
          <NavigationItemLeadingIcon item={item} />
          <span className="min-w-0 flex-1 whitespace-normal break-words text-xs">
            {getEditorItemLabel(item, lang, documentTitleByContentId)}
          </span>
        </div>
      </CardWithPath>
    </li>
  );
}
