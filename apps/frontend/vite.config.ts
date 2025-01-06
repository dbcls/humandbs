import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  root: "./src",
  build: {
    outDir: "../dist",
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
  }
})
