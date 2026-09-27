/**
 * The commit the running image was built from, which `scripts/deploy.sh` puts
 * into the image, or null where nothing did — the development server and an
 * image built by hand.
 */
export function appVersion(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env.HUMANDBS_VERSION?.trim() ?? ""
  return value === "" ? null : value
}
