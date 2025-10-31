import {
  Asset,
  Document,
  DocumentVersion,
  DocumentVersionTranslation,
} from "@/db/schema";
import { Alert, ContentItem, NewsItem } from "@/db/types";
import { SessionUser } from "@/serverFunctions/user";

export const USER_ROLES = {
  ADMIN: "admin",
  EDITOR: "editor",
  USER: "user",
} as const;

type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

type PermissionCheck<Key extends keyof Permissions> =
  | boolean
  | ((user: SessionUser, data: Permissions[Key]["dataType"]) => boolean);

type RolesWithPermissions = {
  [R in UserRole]: Partial<{
    [Key in keyof Permissions]: Partial<{
      [Action in Permissions[Key]["action"]]: PermissionCheck<Key>;
    }>;
  }>;
};

export type Permissions = {
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
    action: "view" | "publish" | "update" | "create" | "delete";
  };
  documentVersionTranslations: {
    dataType: DocumentVersionTranslation;
    action: "view" | "update" | "create" | "delete";
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
};

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
    },
    documentVersionTranslations: {
      view: true,
      update: true,
      create: true,
      delete: true,
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
  editor: {
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
      delete: false,
    },
    documentVersionTranslations: {
      view: true,
      update: true,
      create: true,
      delete: true,
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

export const roles = Object.keys(ROLES) as Array<keyof RolesWithPermissions>;

export function hasPermission<Resource extends keyof Permissions>(
  user: SessionUser,
  resource: Resource,
  action: Permissions[Resource]["action"],
  data?: Permissions[Resource]["dataType"]
) {
  const permission = (ROLES as RolesWithPermissions)[user?.role || "user"][
    resource
  ]?.[action];

  if (permission === null || permission === undefined) return false;

  if (typeof permission === "boolean") return permission;

  return !!data && permission(user, data);
}
