import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

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

  // define: {
  //   VITE_OIDC_ISSUER_URL: process.env.OIDC_ISSUER_URL,
  //   VITE_OIDC_CLIENT_ID: process.env.OIDC_CLIENT_ID,
  // },
});
