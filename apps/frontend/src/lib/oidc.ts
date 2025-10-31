import * as oidc from "openid-client";

let _config: oidc.Configuration | null = null;

export async function getConfig() {
  if (_config) return _config;
  const server = new URL(process.env.OIDC_ISSUER_URL!);
  const clientId = process.env.OIDC_CLIENT_ID!;
  // v6 discovery works with public clients too; no secret needed
  _config = await oidc.discovery(server, clientId);
  return _config;
}

export async function getLogoutUrl(
  idTokenHint?: string,
  postLogoutRedirectUri?: string
) {
  const cfg = await getConfig();
  const endSession = cfg.serverMetadata().end_session_endpoint;
  if (!endSession) return null;
  const url = new URL(endSession);
  if (idTokenHint) url.searchParams.set("id_token_hint", idTokenHint);
  if (postLogoutRedirectUri)
    url.searchParams.set("post_logout_redirect_uri", postLogoutRedirectUri);
  return url;
}
