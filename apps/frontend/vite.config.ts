import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import react from "@vitejs/plugin-react";

export default defineConfig({
  server: {
    port: 3000,
    host: "0.0.0.0",
  },

  plugins: [
    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),

    tanstackStart({
      target: "bun",
      public: {
        dir: "assets",
      },
      customViteReactPlugin: true,
    }),
    react(),
  ],
});
