import { reactRouter } from "@react-router/dev/vite"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    // The dev server is reached through the proxy on 8080, so the HMR client
    // must connect there rather than to the container-internal port.
    hmr: { clientPort: Number(process.env.HUMANDBS_PUBLIC_PORT ?? 8080) },
    // The proxy passes the Host it was asked with, so a request from another
    // container arrives naming the service rather than localhost. Only the dev
    // server checks this; what is deployed is a build and serves any host.
    allowedHosts: ["localhost", "proxy"],
  },
})
