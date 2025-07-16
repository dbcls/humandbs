import {
  Document,
  DocumentVersion,
  DocumentVersionTranslation,
  UserRole,
} from "@/db/schema";
import { SessionUser } from "@/router";

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
    action: "view";
  };
  documentVersions: {
    dataType: DocumentVersion;
    action: "view" | "update" | "create" | "delete";
  };
  documentVersionTranslations: {
    dataType: DocumentVersionTranslation;
    action: "view" | "update" | "create" | "delete";
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
    },
    documentVersions: {
      view: true,
      update: true,
      create: true,
      delete: true,
    },
    documentVersionTranslations: {
      view: true,
      update: true,
      create: true,
      delete: true,
    },
  },
  editor: {
    documents: {
      view: true,
    },
    documentVersions: {
      view: true,
      update: true,
      create: true,
      delete: true,
    },
    documentVersionTranslations: {
      view: true,
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
  const permission = (ROLES as RolesWithPermissions)[user.role][resource]?.[
    action
  ];

  if (permission === null || permission === undefined) return false;

  if (typeof permission === "boolean") return permission;

  return !!data && permission(user, data);
}
