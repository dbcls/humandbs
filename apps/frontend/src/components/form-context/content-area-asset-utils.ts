import type { AssetHierarchyFile } from "@/serverFunctions/assets";

export function buildAssetMarkdown(asset: AssetHierarchyFile) {
  const encodedUrl = asset.url.split("/").map(encodeURIComponent).join("/");
  if (asset.mimeType.startsWith("image/")) {
    return `![${asset.name}](${encodedUrl})`;
  }

  return `[${asset.name}](${encodedUrl})`;
}
