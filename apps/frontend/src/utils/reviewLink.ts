export const REVIEW_LINK_TARGETS = ["detail", "list", "releases"] as const;
export type ReviewLinkTarget = (typeof REVIEW_LINK_TARGETS)[number];

/**
 * Builds the public login URL for a reviewer from the browser's current
 * origin. This preserves the host the reviewer actually opened, including
 * local and proxied deployments.
 */
export function buildReviewLink(
  systemBaseUrl: string,
  humId: string,
  target: ReviewLinkTarget = "detail",
) {
  const loginUrl = new URL("/auth/login", new URL(systemBaseUrl).origin);
  const encodedHumId = encodeURIComponent(humId);
  let redirect = `/research/${encodedHumId}`;

  if (target === "list") {
    redirect = `/research?${new URLSearchParams({ query: humId })}`;
  } else if (target === "releases") {
    redirect = `/research/${encodedHumId}/versions`;
  }

  loginUrl.searchParams.set("redirect", redirect);
  return loginUrl.href;
}
