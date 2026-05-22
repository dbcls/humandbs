import { asc } from "drizzle-orm";
import { v5 as uuidv5 } from "uuid";

import type {
  NavigationGroup,
  NavigationItem,
  NavPriority,
  SiteNavigationConfig,
} from "@/config/site-navigation";
import { getDefaultSiteNavigationConfig } from "@/config/site-navigation";
import { normalizeSiteNavigationConfig } from "@/config/site-navigation.schema";
import type { db } from "@/db/database";
import { document } from "@/db/schema";

const NAVBAR_GROUP_NAMESPACE = "62ca65af-a081-4daf-8db6-a491d694c7a6";
const FOOTER_GROUP_NAMESPACE = "f6456547-d0b8-4b1f-9830-c80caefb7631";

type DbLike = typeof db;

type TemplateGroup = {
  label: Record<string, string>;
  priority?: NavPriority;
  links: NavigationItem[];
};

type DocumentRecord = {
  id: string;
  contentId: string;
};

function getRootSegment(contentId: string): string {
  return contentId.split("/")[0] ?? contentId;
}

function humanizeSegment(segment: string): string {
  return segment
    .split("-")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function compareDocuments(a: DocumentRecord, b: DocumentRecord): number {
  const aIsRoot = a.contentId === getRootSegment(a.contentId);
  const bIsRoot = b.contentId === getRootSegment(b.contentId);
  if (aIsRoot !== bIsRoot) return aIsRoot ? -1 : 1;

  const aDepth = a.contentId.split("/").length;
  const bDepth = b.contentId.split("/").length;
  if (aDepth !== bDepth) return aDepth - bDepth;

  return a.contentId.localeCompare(b.contentId);
}

function buildTemplateGroups(
  groups: NavigationGroup[],
  itemById: Map<string, NavigationItem>,
): Map<string, TemplateGroup> {
  const templateGroups = new Map<string, TemplateGroup>();

  for (const group of groups) {
    const documentItems = group.items
      .map((ref) => itemById.get(ref.id))
      .filter(
        (item): item is NavigationItem =>
          item !== undefined && item.type === "document" && item.contentId !== undefined,
      );

    const rootContentId = documentItems[0]?.contentId;
    if (!rootContentId) continue;

    const root = getRootSegment(rootContentId);
    const links = group.items
      .map((ref) => itemById.get(ref.id))
      .filter((item): item is NavigationItem => item?.type === "link");

    templateGroups.set(root, {
      label: group.label,
      ...(group.priority ? { priority: group.priority } : {}),
      links,
    });
  }

  return templateGroups;
}

function getOrderedRoots(
  documents: DocumentRecord[],
  templateGroups: Map<string, TemplateGroup>,
  options?: { includeHome?: boolean },
): string[] {
  const templateRoots = [...templateGroups.keys()];
  const extraRoots = [...new Set(documents.map((doc) => getRootSegment(doc.contentId)))]
    .filter((root) => !templateGroups.has(root))
    .filter((root) => options?.includeHome || root !== "home")
    .sort((a, b) => a.localeCompare(b));

  return [...templateRoots, ...extraRoots];
}

function buildNavbarGroups(
  documents: DocumentRecord[],
  templateGroups: Map<string, TemplateGroup>,
): NavigationGroup[] {
  return getOrderedRoots(documents, templateGroups).flatMap((root) => {
    const docsInRoot = documents
      .filter((doc) => getRootSegment(doc.contentId) === root)
      .sort(compareDocuments);
    const template = templateGroups.get(root);
    const links = template?.links ?? [];

    const linkedDoc = docsInRoot.find((doc) => doc.contentId === root) ?? docsInRoot[0];
    const linkedItemId = linkedDoc?.id ?? links[0]?.id;

    if (!linkedItemId) return [];

    const remainingDocIds = docsInRoot
      .filter((doc) => doc.id !== linkedItemId)
      .map((doc) => ({ id: doc.id, enabled: true }));
    const remainingLinkIds = links
      .filter((item) => item.id !== linkedItemId)
      .map((item) => ({ id: item.id, enabled: true }));

    return [
      {
        id: uuidv5(`navbar:${root}`, NAVBAR_GROUP_NAMESPACE),
        label: template?.label ?? {
          en: humanizeSegment(root),
          ja: humanizeSegment(root),
        },
        enabled: true,
        priority: template?.priority ?? "important",
        items: [{ id: linkedItemId, enabled: true }, ...remainingDocIds, ...remainingLinkIds],
      },
    ];
  });
}

function buildFooterGroups(
  documents: DocumentRecord[],
  templateGroups: Map<string, TemplateGroup>,
): NavigationGroup[] {
  return getOrderedRoots(documents, templateGroups, {
    includeHome: true,
  }).flatMap((root) => {
    const docsInRoot = documents
      .filter((doc) => getRootSegment(doc.contentId) === root)
      .sort(compareDocuments);
    const template = templateGroups.get(root);
    const links = template?.links ?? [];

    const itemIds = [
      ...docsInRoot.map((doc) => ({ id: doc.id, enabled: true })),
      ...links.map((item) => ({ id: item.id, enabled: true })),
    ];

    if (itemIds.length === 0) return [];

    return [
      {
        id: uuidv5(`footer:${root}`, FOOTER_GROUP_NAMESPACE),
        label: template?.label ?? {
          en: humanizeSegment(root),
          ja: humanizeSegment(root),
        },
        enabled: true,
        items: itemIds,
      },
    ];
  });
}

export async function buildNavigationConfig(database: DbLike): Promise<SiteNavigationConfig> {
  const defaultConfig = getDefaultSiteNavigationConfig();
  const defaultItemsById = new Map(defaultConfig.items.map((item) => [item.id, item]));

  const [documents] = await Promise.all([
    database
      .select({ id: document.id, contentId: document.contentId })
      .from(document)
      .orderBy(asc(document.contentId)),
  ]);

  const documentItems: NavigationItem[] = documents.map((doc) => ({
    id: doc.id,
    type: "document",
    documentId: doc.id,
  }));

  const templateNavbarGroups = buildTemplateGroups(
    defaultConfig.zones.navbar.groups,
    defaultItemsById,
  );
  const templateFooterGroups = buildTemplateGroups(
    defaultConfig.zones.footer.groups,
    defaultItemsById,
  );

  const linkItems = defaultConfig.items.filter((item) => item.type === "link");

  return normalizeSiteNavigationConfig({
    items: [...documentItems, ...linkItems],
    zones: {
      navbar: {
        groups: buildNavbarGroups(documents, templateNavbarGroups),
      },
      footer: {
        groups: buildFooterGroups(documents, templateFooterGroups),
      },
    },
  });
}
