import tailwindcss from "@tailwindcss/vite"
import { TanStackRouterVite } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import path from "node:path"
import { defineConfig } from "vite"

function getGithubRepoName() {
  const repo = process.env.GITHUB_REPOSITORY
  const repoName = repo?.split("/")[1]
  return repoName
}

const repoName = getGithubRepoName()
console.log("repo name", repoName)

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    TanStackRouterVite(),
    react(),
    tailwindcss(),
    {
      name: "markdown-loader",
      transform(code, id) {
        if (id.slice(-3) === ".md") {
          // For .md files, get the raw content
          return `export default ${JSON.stringify(code)};`
        }
      },
    },
  ],

  base: repoName ? `/${repoName}/` : "/",

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),

    },
  },

  server: {
    host: process.env.HUMANDBS_FRONTEND_HOST || "127.0.0.1",
    port: parseInt(process.env.HUMANDBS_FRONTEND_PORT || "3000"),
  },
  preview: {
    host: process.env.HUMANDBS_FRONTEND_HOST || "127.0.0.1",
    port: parseInt(process.env.HUMANDBS_FRONTEND_PORT || "3000"),
  },
  define: {
    __APP_VERSION: JSON.stringify(process.env.npm_package_version || "0.0.0"),
    __PATH_PREFIX: JSON.stringify(repoName),
  },
})
