import type { AssetHierarchyFile } from "@/serverFunctions/assets";

export function buildAssetMarkdown(asset: AssetHierarchyFile) {
  if (asset.mimeType.startsWith("image/")) {
    return `![${asset.name}](${asset.url})`;
  }

  return `[${asset.name}](${asset.url})`;
}
