/// <reference types="vite-plugin-svgr/client" />
/// <reference types="vite/client" />
declare const APP_VERSION: string;
declare const APP_VERSION_HASH: string;
declare const DU_APPLICATION_URL: string;

declare module "*.css?url" {
  const content: string;
  export default content;
}
