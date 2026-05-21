import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";
import tsConfigPaths from "vite-tsconfig-paths";

import packageJson from "./package.json";

function getCommitHash(): string {
  try {
    const head = readFileSync("../../.git/HEAD", "utf8").trim();
    if (head.startsWith("ref: ")) {
      return readFileSync(`../../.git/${head.slice(5)}`, "utf8").trim();
    }
    return head;
  } catch {
    return process.env.VITE_COMMIT_HASH ?? "unknown";
  }
}

export default defineConfig(async () => {
  const commitHash = getCommitHash();
  console.log("ver", packageJson.version, commitHash);

  return {
    server: {
      port: 3000,
      allowedHosts: ["frontend"],
      watch: {
        usePolling: true,
      },
    },
    resolve: {
      alias: {
        "@humandbs/backend/types": fileURLToPath(
          new URL("../backend/types/shared-types.ts", import.meta.url),
        ),
      },
    },
    plugins: [
      tanstackStart({
        srcDirectory: "src",
        server: {
          build: {
            staticNodeEnv: false, // for Runtime environment detection for understand, where to save asset files
          },
        },
      }),
      tailwindcss(),
      tsConfigPaths({
        projects: ["./tsconfig.json"],
      }),
      svgr(),
      viteReact({ babel: { plugins: ["babel-plugin-react-compiler"] } }),
    ],
    define: {
      APP_VERSION: JSON.stringify(`v${packageJson.version}`),
      APP_VERSION_HASH: JSON.stringify(commitHash),
    },
  };
});
