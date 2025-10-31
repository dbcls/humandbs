import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { write } from "bun";
import { eq, or } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

import { asset } from "@/db/schema";
import { db } from "@/db/database";
import { hasPermissionMiddleware } from "@/middleware/authMiddleware";

const PUBLIC_DIR = "./public";
const ASSETS_SUBDIR = `assets`;
const ASSET_DIR = `${PUBLIC_DIR}/${ASSETS_SUBDIR}`;
const MAX_FILE_SIZE = 1024 * 1024 * 50; // 50MB

export const $getAsset = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      id: z.uuidv4(),
    })
  )
  .handler(({ data }) =>
    db.query.asset.findFirst({
      where: eq(asset.id, data.id),
    })
  );

export const $listAssets = createServerFn({ method: "GET" })
  .middleware([hasPermissionMiddleware])
  .handler(({ context }) => {
    context.checkPermission("assets", "list");

    return db.query.asset.findMany();
  });

export const $searchAssets = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      query: z.string().min(1).max(100).default(""),
      limit: z.number().min(1).max(100).default(10),
      offset: z.number().min(0).default(0),
    })
  )
  .handler(({ data }) =>
    db.query.asset.findMany({
      where: or(eq(asset.name, data.query), eq(asset.description, data.query)),
      limit: data.limit,
      offset: data.offset,
    })
  );

async function uploadAssetFile(file: File) {
  const ext = file.name.split(".").pop();
  const asssetKey = `${uuidv4()}.${ext}`;

  await write(`${ASSET_DIR}/${asssetKey}`, file);

  return asssetKey;
}

async function deleteAssetFile(id: string | undefined) {
  const path = `${ASSET_DIR}/${id}`;

  const file = Bun.file(path);

  return file.delete();
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

    const name = data.get("name") as string;

    const description = data.get("description") as string;

    if (!(file instanceof File)) {
      throw new Error("Invalid file");
    }

    const key = await uploadAssetFile(file);

    const result = await db
      .insert(asset)
      .values({
        mimeType: file.type,
        name,
        description,
        url: `/${ASSETS_SUBDIR}/${key}`,
      })
      .returning();

    return result[0];
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
