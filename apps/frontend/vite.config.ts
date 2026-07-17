import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";
import tsConfigPaths from "vite-tsconfig-paths";

import packageJson from "./package.json";

function observabilityDevEndpoint(): Plugin {
  return {
    name: "humandbs-observability-client-errors",
    configureServer(server) {
      server.middlewares.use("/api/observability/client-errors", (request, response, next) => {
        if (request.method !== "POST") return next();
        const chunks: Buffer[] = [];
        request.on("data", (chunk: Buffer) => chunks.push(chunk));
        request.on("error", () => response.end());
        request.on("end", async () => {
          try {
            const { handleClientErrorReport } = await import("./src/observability/server");
            const result = await handleClientErrorReport(
              new Request("http://localhost/api/observability/client-errors", {
                method: "POST",
                headers: request.headers as HeadersInit,
                body: Buffer.concat(chunks),
              }),
            );
            response.statusCode = result.status;
            response.end();
          } catch {
            response.statusCode = 400;
            response.end();
          }
        });
      });
    },
  };
}

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
        ignored: ["**/e2e/**"],
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
      observabilityDevEndpoint(),
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
      PUBLIC_FILES_SUBDIR: JSON.stringify(
        process.env.HUMANDBS_FRONTEND_PUBLIC_FILES_DIR ?? "public-files",
      ),
      DU_APPLICATION_URL: JSON.stringify(
        process.env.HUMANDBS_FRONTEND_DU_APPLICATION_URL ??
          "https://humandbs.ddbj.nig.ac.jp/nbdc/application/dataset_import",
      ),
    },
  };
});
