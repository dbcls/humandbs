import { tanstackStart } from "@tanstack/react-start-plugin";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

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
    }),
  ],
});
