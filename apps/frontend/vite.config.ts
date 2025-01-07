import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    TanStackRouterVite(),
    react(),
    {
      name: 'markdown-loader',
      transform(code, id) {
        if (id.slice(-3) === '.md') {
          // For .md files, get the raw content
          return `export default ${JSON.stringify(code)};`;
        }
      },
    },
  ],

  resolve: {
    alias: {
      '@components': path.resolve(__dirname, 'src/components/'),
      '@content': path.resolve(__dirname, 'src/content/'),
    },
  },

  server: {
    host: process.env.HUMANDBS_FRONTEND_HOST || '127.0.0.1',
    port: parseInt(process.env.HUMANDBS_FRONTEND_PORT || '3000'),
  },
  preview: {
    host: process.env.HUMANDBS_FRONTEND_HOST || '127.0.0.1',
    port: parseInt(process.env.HUMANDBS_FRONTEND_PORT || '3000'),
  },
  define: {
    __APP_VERSION: JSON.stringify(process.env.npm_package_version || '0.0.0'),
  },
});
