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
import { Switch } from "@/components/ui/switch";
import type { Locale } from "@/config/i18n";
import type { NavigationItem } from "@/config/siteNavigation";
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
import type { FooterGroupWithItems, ItemsRecord } from "./types";

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
  return value.startsWith("footer-group-items:") ? value.slice("footer-group-items:".length) : null;
}

export type FooterEditorProps = {
  groups: FooterGroupWithItems[];
  allItems: NavigationItem[];
  documents: DocumentsListItemResponse[];
  lang: Locale;
  onCommit: (groups: FooterGroupWithItems[]) => void;
  onToggleGroupEnabled: (groupId: string, enabled: boolean) => void;
  onRenameGroup: (groupId: string, label: { en: string; ja: string }) => void;
  onDeleteGroup: (groupId: string) => void;
  onAddGroup: (label: { en: string; ja: string }) => void;
  onAssignDocument: (contentId: string, groupId: string, documentId?: string) => void;
  onAddLinkToGroup: (groupId: string, url: string, label: { en: string; ja: string }) => void;
  onCreateUnassignedLinkItem: (url: string, label: { en: string; ja: string }) => void;
  onDeleteLinkItem: (itemId: string) => void;
  onUpdateLinkLabel: (
    itemId: string,
    value: { url: string; label: { en: string; ja: string } },
  ) => void;
  onRemoveItem: (itemId: string) => void;
  onToggleItemEnabled: (itemId: string, enabled: boolean) => void;
};

export function FooterEditor({
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
}: FooterEditorProps) {
  const [groups, setGroups] = useState<FooterGroupWithItems[]>(groupsProp);
  const isDraggingRef = useRef(false);
  const snapshotRef = useRef<FooterGroupWithItems[]>(groupsProp);
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
    ? (groups.flatMap((g) => g.items).find((i) => i.item.id === draggingItemId) ?? null)
    : null;

  const assignedItemIds = new Set(groups.flatMap((g) => g.items.map((i) => i.item.id)));
  const documentPathById = new Map(documents.map((doc) => [doc.id, doc.contentId] as const));

  const docItemMap = new Map<string, NavigationItem>(
    allItems
      .filter((i) => i.type === "document")
      .flatMap((item) => [
        ...(item.documentId ? ([[item.documentId, item]] as const) : []),
        ...(item.contentId ? ([[item.contentId, item]] as const) : []),
      ]),
  );

  const unassignedLinkItems = allItems.filter(
    (i): i is Extract<NavigationItem, { type: "link" }> =>
      i.type === "link" && !assignedItemIds.has(i.id),
  );

  const documentTitleByContentId = new Map([
    ...documents.map((doc) => [doc.contentId, getDocumentLabel(doc, lang)] as const),
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
    const groupOrder = record._groups as string[];
    const groupById = new Map(prevGroups.map((g) => [getFooterGroupSortId(g.group.id), g.group]));
    const itemById = new Map(
      prevGroups.flatMap((g) => g.items.map((i) => [i.item.id, i] as const)),
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
          if (src.data?.type === FOOTER_ITEM_TYPE || src.data?.type === FOOTER_GROUP_TYPE) {
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

          if (src?.data?.type === FOOTER_UNASSIGNED_DOC_TYPE) {
            const contentId = String(src.data.contentId);
            if (dest) {
              const groupId = parseFooterGroupItemsId(String(dest.id));
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
              const groupId = parseFooterGroupItemsId(String(dest.id));
              if (groupId) {
                const updated = snapshotRef.current.map((g) =>
                  g.group.id === groupId
                    ? {
                        ...g,
                        items: [
                          ...g.items,
                          {
                            item: unassignedLinkItems.find((item) => item.id === itemId)!,
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

          if (src?.data?.type === FOOTER_ITEM_TYPE && dest) {
            const destId = String(dest.id);
            if (
              destId === FOOTER_UNASSIGNED_POOL_ID ||
              destId === FOOTER_UNASSIGNED_POOL_ID + "-droppable"
            ) {
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
              item={unassignedLinkItems.find((item) => item.id === draggingLinkItemId)!}
              lang={lang}
              documentPathById={documentPathById}
              documentTitleByContentId={documentTitleByContentId}
            />
          ) : draggingDocContentId ? (
            <FooterDocOverlay
              label={
                documents.find((d) => d.contentId === draggingDocContentId)
                  ? getDocumentLabel(
                      documents.find((d) => d.contentId === draggingDocContentId)!,
                      lang,
                    )
                  : draggingDocContentId
              }
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
  unassignedLinkItems: Array<Extract<NavigationItem, { type: "link" }>>;
  groups: FooterGroupWithItems[];
  documentTitleByContentId: Map<string, string>;
  onCreateLinkItem: (url: string, label: { en: string; ja: string }) => void;
  onDeleteLinkItem: (itemId: string) => void;
}) {
  const tNav = useTranslations("admin.navigation");
  const [showAddLink, setShowAddLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkEn, setLinkEn] = useState("");
  const [linkJa, setLinkJa] = useState("");
  const { ref: poolDropRef, isDropTarget: isPoolDropTarget } = useDroppable({
    id: FOOTER_UNASSIGNED_POOL_ID + "-droppable",
    collisionPriority: CollisionPriority.Low,
  });

  const itemGroupName = new Map<string, string>();
  for (const g of groups) {
    for (const item of g.items) {
      itemGroupName.set(
        item.item.id,
        g.group.label[lang] ?? g.group.label.en ?? g.group.label.ja ?? "",
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
        "flex h-fit min-h-[300px] w-72 shrink-0 flex-col rounded-md border border-gray-200 bg-gray-50 p-3 transition-colors lg:w-80",
        isPoolDropTarget ? "border-blue-300 bg-blue-50" : "",
      ].join(" ")}
    >
      <p className="mb-2 shrink-0 font-semibold text-gray-500 text-xs uppercase">
        Available documents
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <ul className="flex flex-col gap-1">
          {(() => {
            const navDocuments = documents.filter((doc) => !doc.hideFromNav);
            return (
              <>
                {navDocuments.map((doc) => {
                  const navItem = docItemMap.get(doc.id) ?? docItemMap.get(doc.contentId);
                  const isAssigned = navItem ? assignedItemIds.has(navItem.id) : false;
                  const groupName = navItem ? itemGroupName.get(navItem.id) : undefined;
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
                {navDocuments.length === 0 && (
                  <li className="py-2 text-foreground-light text-xs">{tNav("no-documents")}</li>
                )}
              </>
            );
          })()}
        </ul>

        {unassignedLinkItems.length > 0 && (
          <>
            <p className="mt-3 mb-2 font-semibold text-gray-500 text-xs uppercase">
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

      <div className="mt-3 border-gray-200 border-t pt-2">
        {showAddLink ? (
          <div className="flex flex-col gap-1.5">
            <EditorTextInput
              value={linkUrl}
              onChange={setLinkUrl}
              placeholder="URL"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Escape") cancelAddLink();
              }}
            />
            <LabeledInputRow
              label="EN"
              value={linkEn}
              onChange={setLinkEn}
              placeholder="English label"
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmAddLink();
                if (e.key === "Escape") cancelAddLink();
              }}
            />
            <LabeledInputRow
              label="JA"
              value={linkJa}
              onChange={setLinkJa}
              placeholder="Japanese label"
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmAddLink();
                if (e.key === "Escape") cancelAddLink();
              }}
            />
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
            className="flex w-full items-center gap-1 rounded px-1 py-1 text-gray-400 text-xs hover:bg-gray-100 hover:text-gray-600"
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
      <CardWithPath path={doc.contentId}>
        <div className="flex items-start gap-1.5">
          <GripVertical className="mt-0.5 size-3 shrink-0 text-gray-400" />
          <FileText className="mt-0.5 size-3 shrink-0 text-sky-600" />
          <div className="min-w-0 flex-1">
            <span className="break-words">{label}</span>
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

function FooterPoolItemCard({
  item,
  index,
  lang,
  documentTitleByContentId,
  onDelete,
}: {
  item: Extract<NavigationItem, { type: "link" }>;
  index: number;
  lang: Locale;
  documentTitleByContentId: Map<string, string>;
  onDelete: () => void;
}) {
  const tNav = useTranslations("admin.navigation");
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
        title={tNav("delete-link")}
      >
        <Trash2 className="size-3.5" />
      </button>
    </li>
  );
}

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
  onAddLinkToGroup: (groupId: string, url: string, label: { en: string; ja: string }) => void;
  onUpdateLinkLabel: (
    itemId: string,
    value: { url: string; label: { en: string; ja: string } },
  ) => void;
  onRemoveItem: (itemId: string) => void;
  onToggleItemEnabled: (itemId: string, enabled: boolean) => void;
}) {
  const tNav = useTranslations("admin.navigation");
  const [showAddLink, setShowAddLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkEn, setLinkEn] = useState("");
  const [linkJa, setLinkJa] = useState("");
  const { ref: groupDropRef, isDropTarget } = useDroppable({
    id: getFooterGroupItemsId(g.group.id),
    accept: [FOOTER_ITEM_TYPE, FOOTER_UNASSIGNED_DOC_TYPE, FOOTER_UNASSIGNED_LINK_TYPE],
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
        "min-w-40 max-w-96 shrink-0 rounded-md bg-white shadow-sm ring-1 ring-gray-200 transition-opacity",
        isDragging ? "opacity-40" : "",
        !g.group.enabled ? "opacity-50" : "",
        isDropTarget && !isDragging ? "ring-2 ring-blue-400" : "",
      ].join(" ")}
    >
      <div className="flex min-w-0 items-center gap-1 border-gray-100 border-b px-3 py-2">
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

      <ul ref={groupDropRef as Ref<HTMLUListElement>} className="flex min-h-8 flex-col gap-1 p-2">
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
          <li className="px-2 py-3 text-foreground-light text-xs">{tNav("no-items")}</li>
        )}
      </ul>

      <div className="border-gray-100 border-t px-2 pt-1 pb-2">
        {showAddLink ? (
          <div className="flex flex-col gap-1.5 pt-1">
            <EditorTextInput
              value={linkUrl}
              onChange={setLinkUrl}
              placeholder="URL"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Escape") cancelAddLink();
              }}
            />
            <LabeledInputRow
              label="EN"
              value={linkEn}
              onChange={setLinkEn}
              placeholder="English label"
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmAddLink();
                if (e.key === "Escape") cancelAddLink();
              }}
            />
            <LabeledInputRow
              label="JA"
              value={linkJa}
              onChange={setLinkJa}
              placeholder="Japanese label"
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmAddLink();
                if (e.key === "Escape") cancelAddLink();
              }}
            />
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
            className="flex w-full items-center gap-1 rounded px-1 py-1 text-gray-400 text-xs hover:bg-gray-50 hover:text-gray-600"
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
  const tNav = useTranslations("admin.navigation");
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
            onSave={(value) => onUpdateLinkLabel(item.id, value)}
          />
        </div>
      </CardWithPath>
      <Switch
        checked={enabled}
        onCheckedChange={(checked) => onToggleEnabled(item.id, checked)}
        className="shrink-0 scale-75"
      />
      <button
        type="button"
        onClick={() => onRemoveItem(item.id)}
        className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
        title={tNav("remove-item")}
      >
        <Trash2 className="size-3.5" />
      </button>
    </li>
  );
}

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
        {g.items.map(({ item, enabled }) => (
          <li key={item.id} className="flex items-start gap-1 rounded px-1 py-1">
            <NavigationItemLeadingIcon item={item} />
            <span className="min-w-0 flex-1 whitespace-normal break-words text-xs">
              {getEditorItemLabel(item, lang, documentTitleByContentId)}
            </span>
            {!enabled ? <span className="text-2xs text-gray-400">off</span> : null}
          </li>
        ))}
        {g.items.length === 0 && (
          <li className="px-2 py-3 text-foreground-light text-xs">{tNav("no-items")}</li>
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
