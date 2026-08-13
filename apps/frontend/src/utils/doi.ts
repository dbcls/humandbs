const URL_SCHEME_PATTERN = /^https?:\/\//i;

export function normalizeDoiUrl(doi: string): string {
  return URL_SCHEME_PATTERN.test(doi) ? doi : `https://doi.org/${doi}`;
}
