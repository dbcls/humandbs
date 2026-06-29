import { mkdir, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { write } from "bun";

import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getAssetDir, getAssetFilesSubdir } from "@/lib/assetDir";
import { hasPermissionMiddleware } from "@/middleware/authMiddleware";

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
  const ASSET_DIR = getAssetDir();
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

async function readAssetFolder(relativePath = ""): Promise<AssetHierarchyFolder> {
  const folderPath = getAbsoluteAssetPath(relativePath);
  const entries = await readdir(folderPath, { withFileTypes: true });

  const FILES_SUBDIR = getAssetFilesSubdir();

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
          url: `/${FILES_SUBDIR}/${entryRelativePath}`,
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

export const $getAssetHierarchy = createServerFn({ method: "GET" })
  .middleware([hasPermissionMiddleware])
  .handler(async ({ context }) => {
    context.checkPermission("assets", "list");

    return readAssetFolder();
  });

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
  const relativePath = folderPath ? path.posix.join(folderPath, safeName) : safeName;

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

    const { relativePath } = await uploadAssetFileToFolder(file, folderPath);

    const FILES_SUBDIR = getAssetFilesSubdir();

    return { url: `/${FILES_SUBDIR}/${relativePath}` };
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

    const parentPath = data.parentPath ? normalizeRelativeAssetPath(data.parentPath) : "";
    const folderName = path.posix.basename(data.folderName.trim());
    const folderPath = parentPath ? path.posix.join(parentPath, folderName) : folderName;

    const normalizedFolderPath = normalizeRelativeAssetPath(folderPath);

    await mkdir(getAbsoluteAssetPath(normalizedFolderPath), {
      recursive: false,
    });

    return { path: normalizedFolderPath };
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
    await rm(getAbsoluteAssetPath(assetPath));

    return { path: assetPath };
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
    await rm(getAbsoluteAssetPath(folderPath), { recursive: true });

    return { path: folderPath };
  });

export const $renameAsset = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .inputValidator(
    z.object({
      assetPath: assetPathSchema,
      newName: z.string().trim().min(1),
    }),
  )
  .handler(async ({ context, data }) => {
    context.checkPermission("assets", "move");

    const assetPath = normalizeRelativeAssetPath(data.assetPath);
    const newName = path.posix.basename(data.newName.trim());
    const parentDir = path.posix.dirname(assetPath);
    const newRelativePath = parentDir === "." ? newName : path.posix.join(parentDir, newName);
    const normalizedNewPath = normalizeRelativeAssetPath(newRelativePath);

    await rename(getAbsoluteAssetPath(assetPath), getAbsoluteAssetPath(normalizedNewPath));

    return { path: normalizedNewPath };
  });

export const $renameAssetFolder = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .inputValidator(
    z.object({
      folderPath: assetPathSchema,
      newName: z.string().trim().min(1),
    }),
  )
  .handler(async ({ context, data }) => {
    context.checkPermission("assets", "move");

    const folderPath = normalizeRelativeAssetPath(data.folderPath);
    const newName = path.posix.basename(data.newName.trim());
    const parentDir = path.posix.dirname(folderPath);
    const newRelativePath = parentDir === "." ? newName : path.posix.join(parentDir, newName);
    const normalizedNewPath = normalizeRelativeAssetPath(newRelativePath);

    await rename(getAbsoluteAssetPath(folderPath), getAbsoluteAssetPath(normalizedNewPath));

    return { path: normalizedNewPath };
  });

export function assetHierarchyQueryOptions() {
  return queryOptions({
    queryKey: ["assets", "hierarchy"],
    queryFn: () => $getAssetHierarchy(),
  });
}
