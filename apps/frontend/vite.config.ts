import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  server: {
    port: 3000,
    host: "0.0.0.0",
    allowedHosts: ["localhost"],
  },

  plugins: [
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

    tanstackStart({
      srcDirectory: "src",
    }),
    react(),
  ],
});
