import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import svgr from "vite-plugin-svgr";
import packageJson from "./package.json";

export default defineConfig(async () => {
  console.log("ver", packageJson.version);

  return {
    server: {
      port: 3000,
      allowedHosts: ["frontend"],
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
      viteReact(),
    ],
    define: {
      VITE_APP_VER: JSON.stringify(`v${packageJson.version}`),
    },
  };
});
