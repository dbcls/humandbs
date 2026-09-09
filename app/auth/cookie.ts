/**
 * The name the signed-in session is carried under.
 *
 * **It is on its own so that something outside the application can read it.**
 * The e2e run hands a browser a session it did not sign in for
 * (`playwright.config.ts`), and importing the name from `session.server.ts`
 * would drag the database and the configuration into a file that is loaded
 * before either exists.
 */
export const SESSION_COOKIE = "humandbs_session"
