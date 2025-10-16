import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  server: {
    port: 3000,
    host: "0.0.0.0",
  },

  plugins: [
    tailwindcss(),

    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),

    tanstackStart({
      srcDirectory: "src",
      // public: {
      //   dir: "assets",
      // },
    }),
    react(),
  ],
});
