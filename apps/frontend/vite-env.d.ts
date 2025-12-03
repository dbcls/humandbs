/// <reference types="vite-plugin-svgr/client" />
/// <reference types="vite/client" />
declare const __APP_VERSION: string;
declare const __PATH_PREFIX: string;

declare module "*.css?url" {
  const content: string;
  export default content;
}
