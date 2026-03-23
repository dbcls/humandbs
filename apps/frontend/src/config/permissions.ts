import type { Asset, Document, DocumentVersion } from "@/db/schema";
import type { Alert, ContentItem, NewsItem } from "@/db/types";
import type { ResearchDetail } from "@humandbs/backend/types";
import { type SessionUser } from "@/utils/jwt-helpers";

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
    [Key in keyof Permissions]: Partial<
      Record<Permissions[Key]["action"], PermissionCheck<Key>>
    >;
  }>
>;

export interface Permissions {
  users: {
    dataType: SessionUser;
    action: "view" | "delete" | "changeRole";
  };
  documents: {
    dataType: Document;
    action: "view" | "create" | "update" | "delete";
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
    dataType: Asset;
    action: "view" | "list" | "create" | "delete";
  };
  news: {
    dataType: NewsItem;
    action: "view" | "update" | "create" | "delete";
  };
  alerts: {
    dataType: Alert;
    action: "list" | "update" | "create" | "delete";
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
  },
  user: {},
} as const satisfies RolesWithPermissions;

export const roles = Object.keys(ROLES) as (keyof RolesWithPermissions)[];

// === Access control for research/dataset workflow ===

export interface AccessResources {
  researches: {
    action:
      | "create"        // POST /research/new                  — admin only
      | "update"        // PUT  /research/{humId}/update       — owner (draft) or admin
      | "delete"        // POST /research/{humId}/delete       — admin only (logical delete)
      | "submit"        // POST /research/{humId}/submit       — owner or admin (draft → review)
      | "approve"       // POST /research/{humId}/approve      — admin only (review → published)
      | "reject"        // POST /research/{humId}/reject       — admin only (review → draft)
      | "unpublish"     // POST /research/{humId}/unpublish    — admin only (published → draft)
      | "versions/new"; // POST /research/{humId}/versions/new — owner or admin (published → draft)
    params?: { research?: Pick<ResearchDetail, "uids" | "status"> };
  };
  datasets: {
    // Dataset has no status of its own — all operations require parent research to be draft
    action:
      | "create"  // POST /research/{humId}/dataset/new  — owner or admin (research draft only)
      | "update"  // PUT  /dataset/{datasetId}/update    — owner or admin (research draft only)
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
      case "create":       return { can: isAdmin };
      case "delete":       return { can: isAdmin };
      case "update":       return { can: (isAdmin || isOwner) && status === "draft" };
      case "submit":       return { can: (isAdmin || isOwner) && status === "draft" };
      case "approve":      return { can: isAdmin && status === "review" };
      case "reject":       return { can: isAdmin && status === "review" };
      case "unpublish":    return { can: isAdmin && status === "published" };
      case "versions/new": return { can: (isAdmin || isOwner) && status === "published" };
    }
  }

  if (resource === "datasets") {
    const research = (params as AccessResources["datasets"]["params"])?.research;
    const isOwner = isAuthed && !!research && research.uids.includes(user!.id);
    const isDraft = research?.status === "draft";

    switch (action as AccessResources["datasets"]["action"]) {
      case "create": return { can: (isAdmin || isOwner) && isDraft };
      case "update": return { can: (isAdmin || isOwner) && isDraft };
      case "delete": return { can: isAdmin && isDraft };
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
  data?: Permissions[Resource]["dataType"]
) {
  const permission = (ROLES as RolesWithPermissions)[
    user?.role || USER_ROLES.USER
  ][resource]?.[action];

  if (permission === null || permission === undefined) return false;

  if (typeof permission === "boolean") return permission;

  return !!data && permission(user, data);
}
