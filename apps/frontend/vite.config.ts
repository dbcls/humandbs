import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";
import tsConfigPaths from "vite-tsconfig-paths";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  server: {
    port: 3000,
    host: "0.0.0.0",
    allowedHosts: [
      "humandbs-staging.ddbj.nig.ac.jp",
      "frontend",
      "humandbs-frontend-dev",
      "localhost",
    ],
  },

  logLevel: "error",

  plugins: [
    tanstackStart({
      srcDirectory: "src",
    }),
    tailwindcss(),

    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),

    svgr({
      svgrOptions: {
        expandProps: "start",
        svgProps: {
          className: `{props.className ? props.className : ''}`,
        },
      },
    }),

    react(),
  ],
});
