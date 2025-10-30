# JWT Refresh Feature Plan

## Current State
- OIDC login via Keycloak stores `access_token`, `refresh_token`, `id_token`, and `expires_in` inside the HTTP-only `session_tokens` cookie during `/api/auth/callback` (see `src/routes/api/auth.callback.ts`).
- Server utilities in `src/utils/jwt-helpers.ts` already expose helpers (`verifyAccessToken`, `refreshAccessToken`, `verifyOrRefreshToken`, `createSessionCookie`) but the refresh flow is not wired into the app lifecycle.
- `$getAuthUser` (`src/serverFunctions/user.ts`) calls `verifyOrRefreshToken` but never persists refreshed tokens back to the response, so downstream middleware (`hasPermissionMiddleware`) continues using stale JWTs when talking to the Hono backend.
- `/api/auth/refresh` exists as a stub, so there is no dedicated refresh endpoint for client-initiated refresh or proactive renewals.
- Admin routes under `/admin/...` rely on `beforeLoad` guards plus `hasPermissionMiddleware`, which currently fetches `Authorization` headers from whatever token happens to be in the cookie and does not retry with a refreshed token.

## Goals
1. Keep authenticated users logged in by transparently refreshing the access token and refresh token pair before or immediately after expiration without user interaction.
2. Ensure both server-side code paths (TanStack server functions, `beforeLoad`, middleware) and any future client-side fetches reuse the latest tokens so requests to the Hono backend remain authorized.
3. Provide a resilient failure path that clears the session and redirects to login if refresh fails (e.g., revoked refresh token).
4. Maintain compatibility with existing Keycloak configuration and avoid breaking the admin permission checks.

## Implementation Steps

1. **Session Data & Utilities**
   - Extend the `Session` shape in `src/utils/jwt-helpers.ts` (and any consuming types) to include an explicit `expires_at` timestamp computed from `expires_in` when the tokens are issued or refreshed. This will allow proactive refresh before expiry.
   - Refactor helper logic into an `ensureFreshSession` function that returns `{ session, claims }` and internally runs verification/refresh, reusing the existing `verifyOrRefreshToken` and `createSessionCookie`.
   - Update `createSessionCookie` to use `expires_at` (if present) when calculating `maxAge` so the cookie lifetime matches the token TTL.

2. **OIDC Callback & Logout Flow**
   - In `/api/auth/callback`, compute and store `expires_at` when persisting the new `session_tokens` cookie so downstream logic has the timestamp available.
   - Optionally capture `refresh_expires_in` if Keycloak provides it, to help decide when to force re-authentication.
   - Confirm `/api/auth/logout` clears any new fields that are added to the cookie.

3. **Server-Side Session Integration**
   - Inside `$getAuthUser` (`src/serverFunctions/user.ts`), switch to the new `ensureFreshSession`, call `setCookie("session_tokens", ...)` when a refresh occurs, and return the decoded claims mapped to the `SessionUser` shape (including `id` derived from `sub`).
   - Adjust `authMiddleware` to receive both the `SessionUser` and the raw `access_token`, passing them through context so `hasPermissionMiddleware` does not need to re-parse the cookie.
   - Update `hasPermissionMiddleware` to consume the fresh token from context (refreshing again only if necessary), and make sure it propagates any refreshed cookie to the response before calling the Hono backend.
   - Audit other server functions and routes that call `getJWT()` or `getSession()` directly, replacing with the fresh session from context where available, to prevent parallel refresh logic from diverging.

4. **`/api/auth/refresh` Endpoint**
   - Implement the POST handler to read the `session_tokens` cookie, call `ensureFreshSession`, set the updated cookie, and return a JSON payload containing new expiry metadata (`expiresAt`, `idTokenPresent`, etc.).
   - Respond with HTTP 401 and clear session cookies if refresh fails, so clients can trigger a re-login.
   - Reuse this endpoint in integration tests or future SPA-based token refresh flows.

5. **Client-Side Proactive Refresh**
   - Create a lightweight client hook (e.g., `useSessionRefresh`) mounted in `RootDocument` or a top-level provider that:
     - Reads the expiry metadata injected via `Route.useRouteContext()` or from a `data-session` attribute.
     - Schedules a refresh call a safe buffer (e.g., 60 seconds) before expiry using `/api/auth/refresh`.
     - Cancels timers on logout and handles 401 responses by redirecting to `/api/auth/login`.
   - Ensure the hook no-ops during SSR and only runs in the browser.

6. **State & Type Updates**
   - Update `Context` definitions in `src/router.tsx` and related components (e.g., `Navbar`) to work with the refined `SessionUser` contract (with `id`, `role` populated).
   - Ensure admin routes still guard properly when `SessionUser.role` is fetched from `hasPermissionMiddleware`.
   - Review any existing usage expecting `context.user.id` and confirm the new mapping (`claims.sub`) matches Keycloak identifiers.

7. **Failure Handling & UX**
   - Centralize error handling so that a failed refresh clears cookies, invalidates TanStack queries, and prompts a login redirect (possibly via a shared `handleAuthFailure` utility).
   - Optionally display a toast or inline message if repeated refresh failures occur while the user is active on admin pages.

8. **Testing & Verification**
   - Add unit coverage around `ensureFreshSession`, mocking `oidc.refreshTokenGrant`.
   - Introduce integration tests for `/api/auth/refresh` using a mocked Keycloak discovery endpoint (or dependency injection) to verify cookie updates and failure responses.
   - Manually test with a short-lived Keycloak access token configuration to validate:
     - Background refresh keeps the session alive (watch network tab for `/api/auth/refresh` calls).
     - Admin actions continue to function, including `hasPermissionMiddleware` calls to `/users/is-admin`.
     - Logout clears cookies and cancels scheduled refresh.
   - Consider adding logging around refresh attempts to aid future diagnostics.

## Open Questions / Follow-Ups
- Confirm whether the backend should validate JWT signatures instead of using `decodeJwt`; if security requirements increase, plan for verifying signatures using the same JWKS leveraged on the frontend.
- Decide if refresh attempts should be rate-limited or debounced to avoid race conditions when multiple server functions trigger refresh simultaneously; if necessary, store a per-request flag in context.
- Clarify Keycloak refresh token rotation policy (some realms rotate refresh tokens). If rotation is enabled, ensure the new refresh token from each response overwrites the old one in the cookie.

## Definition of Done
- Automatic refresh works for both SSR and CSR flows without requiring manual page reload.
- Admin-only pages remain accessible across token refresh cycles.
- Refresh failures result in a controlled logout path.
- Tests and documentation (this plan plus any README updates) reflect the new flow.
