import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { write } from "bun";
import { eq, or } from "drizzle-orm";
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { db } from "@/db/database";
import { asset } from "@/db/schema";
import { hasPermissionMiddleware } from "@/middleware/authMiddleware";

// In production, static files are served from ./dist/client (see server.ts).
// In dev, Vite serves from ./public. Use ASSET_PUBLIC_DIR to override.
const PUBLIC_DIR =
  process.env.ASSET_PUBLIC_DIR ??
  (process.env.NODE_ENV === "development" ? "./public" : "./dist/client");
const ASSETS_SUBDIR = `files`;
const ASSET_DIR = `${PUBLIC_DIR}/${ASSETS_SUBDIR}`;
const MAX_FILE_SIZE = 1024 * 1024 * 50; // 50MB

function normalizeRelativeAssetPath(input: string) {
  const normalized = path.posix
    .normalize(input.trim().replace(/^\/+|\/+$/g, ""))
    .replace(/^\/+/, "");

  if (
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    normalized === ".."
  ) {
    throw new Error("Invalid asset path.");
  }

  return normalized;
}

function getAbsoluteAssetPath(relativePath: string) {
  return path.join(ASSET_DIR, relativePath);
}

export interface AssetHierarchyFile {
  type: "file";
  name: string;
  path: string;
  url: string;
  mimeType: string;
  size: number;
}

export interface AssetHierarchyFolder {
  type: "folder";
  name: string;
  path: string;
  children: AssetHierarchyItem[];
}

export type AssetHierarchyItem = AssetHierarchyFolder | AssetHierarchyFile;

async function readAssetFolder(
  relativePath = "",
): Promise<AssetHierarchyFolder> {
  const folderPath = getAbsoluteAssetPath(relativePath);
  const entries = await readdir(folderPath, { withFileTypes: true });

  const children = await Promise.all(
    entries
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) {
          return a.isDirectory() ? -1 : 1;
        }

        return a.name.localeCompare(b.name);
      })
      .map(async (entry): Promise<AssetHierarchyItem> => {
        const entryRelativePath = relativePath
          ? path.posix.join(relativePath, entry.name)
          : entry.name;

        if (entry.isDirectory()) {
          return readAssetFolder(entryRelativePath);
        }

        const file = Bun.file(path.join(folderPath, entry.name));

        return {
          type: "file",
          name: entry.name,
          path: entryRelativePath,
          url: `/${ASSETS_SUBDIR}/${entryRelativePath}`,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
        };
      }),
  );

  return {
    type: "folder",
    name: relativePath ? path.posix.basename(relativePath) : "files",
    path: relativePath,
    children,
  };
}

export const $getAsset = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      id: z.uuidv4(),
    }),
  )
  .handler(async ({ data }) => {
    const res = await db.query.asset.findFirst({
      where: eq(asset.id, data.id),
    });
    return res;
  });

export const $listAssets = createServerFn({ method: "GET" })
  .middleware([hasPermissionMiddleware])
  .handler(({ context }) => {
    context.checkPermission("assets", "list");

    return db.query.asset.findMany();
  });

export const $getAssetHierarchy = createServerFn({ method: "GET" })
  .middleware([hasPermissionMiddleware])
  .handler(async ({ context }) => {
    context.checkPermission("assets", "list");

    return readAssetFolder();
  });

export const $searchAssets = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      query: z.string().min(1).max(100).default(""),
      limit: z.number().min(1).max(100).default(10),
      offset: z.number().min(0).default(0),
    }),
  )
  .handler(({ data }) =>
    db.query.asset.findMany({
      where: or(eq(asset.name, data.query), eq(asset.description, data.query)),
      limit: data.limit,
      offset: data.offset,
    }),
  );

const assetPathSchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value) => {
      try {
        normalizeRelativeAssetPath(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Invalid asset path." },
  );

const assetFolderPathSchema = z
  .string()
  .trim()
  .default("")
  .refine(
    (value) => {
      try {
        if (!value) return true;
        normalizeRelativeAssetPath(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Invalid folder path." },
  );

async function uploadAssetFileToFolder(file: File, folderPath: string) {
  const safeName = path.posix.basename(file.name);
  const relativePath = folderPath
    ? path.posix.join(folderPath, safeName)
    : safeName;

  await mkdir(path.dirname(getAbsoluteAssetPath(relativePath)), {
    recursive: true,
  });
  await write(getAbsoluteAssetPath(relativePath), file);

  return {
    safeName,
    relativePath,
  };
}

export const $uploadAsset = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .inputValidator(z.instanceof(FormData))
  .handler(async ({ context, data }) => {
    context.checkPermission("assets", "create");

    const file = data.get("file") as File;

    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File size exceeds limit of ${MAX_FILE_SIZE} MB`);
    }

    if (!(file instanceof File)) {
      throw new Error("Invalid file");
    }

    const folderPath = normalizeRelativeAssetPath(
      assetFolderPathSchema.parse((data.get("folderPath") as string) ?? ""),
    );
    const name = ((data.get("name") as string) || file.name).trim();
    const description = ((data.get("description") as string) || "").trim();

    const { relativePath } = await uploadAssetFileToFolder(file, folderPath);

    const result = await db
      .insert(asset)
      .values({
        mimeType: file.type,
        name,
        description,
        url: `/${ASSETS_SUBDIR}/${relativePath}`,
      })
      .returning();

    return result[0];
  });

export const $createAssetFolder = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .inputValidator(
    z.object({
      parentPath: assetFolderPathSchema,
      folderName: z.string().trim().min(1),
    }),
  )
  .handler(async ({ context, data }) => {
    context.checkPermission("assets", "create");

    const parentPath = data.parentPath
      ? normalizeRelativeAssetPath(data.parentPath)
      : "";
    const folderName = path.posix.basename(data.folderName.trim());
    const folderPath = parentPath
      ? path.posix.join(parentPath, folderName)
      : folderName;

    const normalizedFolderPath = normalizeRelativeAssetPath(folderPath);

    await mkdir(getAbsoluteAssetPath(normalizedFolderPath), {
      recursive: false,
    });

    return { path: normalizedFolderPath };
  });

export const $deleteAsset = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .inputValidator(z.object({ id: z.uuidv4() }))
  .handler(async ({ context, data }) => {
    context.checkPermission("assets", "delete");

    const id = data.id;

    const result = await db.delete(asset).where(eq(asset.id, id)).returning();

    const key = result[0].url.split("/").pop();

    await deleteAssetFile(key);

    return result;
  });

export const $deleteAssetByPath = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .inputValidator(
    z.object({
      assetPath: assetPathSchema,
    }),
  )
  .handler(async ({ context, data }) => {
    context.checkPermission("assets", "delete");

    const assetPath = normalizeRelativeAssetPath(data.assetPath);
    const assetUrl = `/${ASSETS_SUBDIR}/${assetPath}`;

    await rm(getAbsoluteAssetPath(assetPath));

    const deleted = await db
      .delete(asset)
      .where(eq(asset.url, assetUrl))
      .returning();

    return deleted;
  });

export const $deleteAssetFolder = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .inputValidator(
    z.object({
      folderPath: assetPathSchema,
    }),
  )
  .handler(async ({ context, data }) => {
    context.checkPermission("assets", "delete");

    const folderPath = normalizeRelativeAssetPath(data.folderPath);
    await rm(getAbsoluteAssetPath(folderPath), { recursive: false });

    return { path: folderPath };
  });

export function getAssetQueryOptions({ id }: { id: string }) {
  return queryOptions({
    queryKey: ["assets", id],
    queryFn: () => $getAsset({ data: { id } }),
  });
}

export function listAssetsQueryOptions() {
  return queryOptions({
    queryKey: ["assets", "list"],
    queryFn: () => $listAssets(),
  });
}

export function assetHierarchyQueryOptions() {
  return queryOptions({
    queryKey: ["assets", "hierarchy"],
    queryFn: () => $getAssetHierarchy(),
  });
}

export function searchAssetsQueryOptions({
  query,
  limit,
  offset,
}: {
  query: string;
  limit: number;
  offset: number;
}) {
  return queryOptions({
    queryKey: ["assets", { query, limit, offset }],
    queryFn: () => $searchAssets({ data: { query, limit, offset } }),
  });
}
