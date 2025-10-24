export function redirectWithCookies(
  to: string,
  cookies: string[],
  status = 302
) {
  const headers = new Headers();
  for (const c of cookies) headers.append("Set-Cookie", c);
  headers.set("Location", to);
  return new Response(null, { status, headers });
}
