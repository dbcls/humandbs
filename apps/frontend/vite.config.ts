import { tanstackStart } from "@tanstack/react-start/plugin/vite";
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
