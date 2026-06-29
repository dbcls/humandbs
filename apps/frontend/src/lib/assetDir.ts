import path from "node:path";

/**
 * Single source of truth for where uploaded "public-files" assets live and how
 * they are exposed.
 *
 * Used by the assets manager (src/serverFunctions/assets.ts), the production
 * server (server.ts), and CMS data transfer (src/lib/cmsDataTransferArchive.ts).
 * Keep all three resolving through here so the upload, serve, and restore paths
 * can never drift apart.
 *
 * These are plain functions (no `createServerOnlyFn`): they only read
 * `process.env`, and every consumer is server-side — including the plain `bun`
 * production server and the export/restore scripts, which cannot import
 * server-fn/middleware modules.
 */

/** Read an env var, treating empty/whitespace-only values as unset. */
function envOr(name: string, fallback: string) {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

/** URL/folder name for assets, e.g. `public-files`. */
export function getAssetFilesSubdir() {
  return envOr("HUMANDBS_FRONTEND_PUBLIC_FILES_DIR", "public-files");
}

/**
 * Persistent base dir that contains the assets folder. Must live OUTSIDE the
 * build output (`dist/`), otherwise `vite build` wipes uploaded files. In dev the
 * base is `./public` so Vite serves the files; in prod it defaults to `./data`,
 * which is backed by a dedicated Docker volume (see compose.yml).
 */
export function getAssetBaseDir() {
  return envOr(
    "HUMANDBS_FRONTEND_PUBLIC_FILES_BASE",
    process.env.NODE_ENV === "development" ? "./public" : "./data",
  );
}

/** Absolute path to the assets directory (`<base>/<subdir>`). */
export function getAssetDir() {
  return path.resolve(getAssetBaseDir(), getAssetFilesSubdir());
}
