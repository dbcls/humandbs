import type { ResearchDetail } from "@humandbs/backend/types";

import type { Document, DocumentVersion } from "@/db/schema";
import type { Alert, ContentItem, NewsItem } from "@/db/types";
import type { SessionUser } from "@/utils/jwt-helpers";

export const USER_ROLES = {
  ADMIN: "admin",
  USER: "user",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

type PermissionCheck<Key extends keyof Permissions> =
  | boolean
  | ((user: SessionUser | null, data: Permissions[Key]["dataType"]) => boolean);

type RolesWithPermissions = Record<
  UserRole,
  Partial<{
    [Key in keyof Permissions]: Partial<Record<Permissions[Key]["action"], PermissionCheck<Key>>>;
  }>
>;

export interface Permissions {
  users: {
    dataType: SessionUser;
    action: "view" | "delete" | "changeRole";
  };
  documents: {
    dataType: Document;
    action: "view" | "create" | "update" | "delete" | "list";
  };
  contents: {
    dataType: ContentItem;
    action: "list" | "view" | "create" | "update" | "delete";
  };
  documentVersions: {
    dataType: DocumentVersion;
    action: "view" | "publish" | "update" | "create" | "delete" | "list";
  };
  assets: {
    dataType: { path: string };
    action: "view" | "list" | "create" | "delete" | "move";
  };
  news: {
    dataType: NewsItem;
    action: "view" | "update" | "create" | "delete";
  };
  alerts: {
    dataType: Alert;
    action: "list" | "update" | "create" | "delete";
  };
  "admin-panel": {
    dataType: never;
    action: "view-cms";
  };
}

const ROLES = {
  admin: {
    users: {
      view: true,
      delete: true,
      changeRole: true,
    },
    documents: {
      view: true,
      create: true,
      update: true,
      delete: true,
      list: true,
    },
    documentVersions: {
      view: true,
      create: true,
      publish: true,
      update: true,
      delete: true,
      list: true,
    },

    contents: {
      list: true,
      view: true,
      create: true,
      update: true,
      delete: true,
    },
    assets: {
      view: true,
      create: true,
      delete: true,
      list: true,
      move: true,
    },
    news: {
      view: true,
      update: true,
      create: true,
      delete: true,
    },
    alerts: {
      list: true,
      update: true,
      create: true,
      delete: true,
    },
    "admin-panel": {
      "view-cms": true,
    },
  },
  user: {},
} as const satisfies RolesWithPermissions;

export const roles = Object.keys(ROLES) as (keyof RolesWithPermissions)[];

// === Access control for research/dataset workflow ===

export interface AccessResources {
  researches: {
    action:
      | "create" // POST /research/new                  — admin only
      | "update" // PUT  /research/{humId}/update|patch  — owner or admin (draft → /update, published → /patch)
      | "delete" // POST /research/{humId}/delete       — admin only (logical delete)
      | "submit" // POST /research/{humId}/submit       — owner or admin (draft → review)
      | "approve" // POST /research/{humId}/approve      — admin only (review → published)
      | "reject" // POST /research/{humId}/reject       — admin only (review → draft)
      | "unpublish" // POST /research/{humId}/unpublish    — admin only (published → draft)
      | "versions/new" // POST /research/{humId}/versions/new — owner or admin (published → draft)
      | "update-uids"; // PUT  /research/{humId}/uids          — admin only
    params?: { research?: Pick<ResearchDetail, "uids" | "status"> };
  };
  datasets: {
    // Dataset has no status of its own — operations derive from the parent research
    // status. create/delete require a draft parent; update additionally allows a
    // published parent (in-place patch via /dataset/{datasetId}/patch).
    action:
      | "create" // POST /research/{humId}/dataset/new  — owner or admin (research draft only)
      | "update" // PUT  /dataset/{datasetId}/update|patch — owner or admin (draft → /update, published → /patch)
      | "delete"; // POST /dataset/{datasetId}/delete    — admin only (research draft only)
    params?: { research?: Pick<ResearchDetail, "uids" | "status"> };
  };
  "admin-panel": {
    action: "view-cms"; // Documents, News, Content, Assets, Users nav items — admin only
    params?: never;
  };
}

export interface CanParams<R extends keyof AccessResources> {
  resource: R;
  action: AccessResources[R]["action"];
  params?: AccessResources[R]["params"];
}

export interface CanResult {
  can: boolean;
}

export function can<R extends keyof AccessResources>(
  user: SessionUser | null | undefined,
  { resource, action, params }: CanParams<R>,
): CanResult {
  const isAdmin = user?.role === USER_ROLES.ADMIN;
  const isAuthed = !!user;

  if (resource === "researches") {
    const research = (params as AccessResources["researches"]["params"])?.research;
    const isOwner = isAuthed && !!research && research.uids.includes(user!.id);
    const status = research?.status;

    switch (action as AccessResources["researches"]["action"]) {
      case "create":
        return { can: isAdmin };
      case "delete":
        return { can: isAdmin };
      case "update":
        // Loosened from draft-only: a published research can be patched in place
        // (PUT /research/{humId}/patch) with no version bump. Draft edits still go
        // to /update; the component routes by viewed version.
        return { can: (isAdmin || isOwner) && (status === "draft" || status === "published") };
      case "submit":
        return { can: (isAdmin || isOwner) && status === "draft" };
      case "approve":
        return { can: isAdmin && status === "review" };
      case "reject":
        return { can: isAdmin && status === "review" };
      case "unpublish":
        return { can: isAdmin && status === "published" };
      case "versions/new":
        return { can: (isAdmin || isOwner) && status === "published" };
      case "update-uids":
        return { can: isAdmin };
    }
  }

  if (resource === "datasets") {
    const research = (params as AccessResources["datasets"]["params"])?.research;
    const isOwner = isAuthed && !!research && research.uids.includes(user!.id);
    const isDraft = research?.status === "draft";
    const isPublished = research?.status === "published";

    switch (action as AccessResources["datasets"]["action"]) {
      case "create":
        return { can: (isAdmin || isOwner) && isDraft };
      case "update":
        // Loosened from draft-only: a dataset whose parent research is published
        // can be patched in place (PUT /dataset/{datasetId}/patch). The view routes
        // by parent status — draft → /update, published → /patch.
        return { can: (isAdmin || isOwner) && (isDraft || isPublished) };
      case "delete":
        return { can: isAdmin && isDraft };
    }
  }

  if (resource === "admin-panel") {
    return { can: isAdmin };
  }

  return { can: false };
}

export function hasPermission<Resource extends keyof Permissions>(
  user: SessionUser | null,
  resource: Resource,
  action: Permissions[Resource]["action"],
  data?: Permissions[Resource]["dataType"],
) {
  const permission = (ROLES as RolesWithPermissions)[user?.role || USER_ROLES.USER][resource]?.[
    action
  ];

  if (permission === null || permission === undefined) return false;

  if (typeof permission === "boolean") return permission;

  return !!data && permission(user, data);
}
