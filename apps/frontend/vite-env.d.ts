/// <reference types="vite-plugin-svgr/client" />
/// <reference types="vite/client" />
declare const APP_VERSION: string;
declare const APP_VERSION_HASH: string;
declare const DU_APPLICATION_URL: string;
declare const DS_SUBMISSION_URL: string;
declare const DS_NAVIGATION_URL: string;
declare const PUBLIC_FILES_SUBDIR: string;

declare module "*.css?url" {
  const content: string;
  export default content;
}
