import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// import { nitro } from "nitro/vite";
import svgr from "vite-plugin-svgr";

export default defineConfig({
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
    }),
    tailwindcss(),
    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    svgr(),
    viteReact(),
    // nitro(),
  ],
});
