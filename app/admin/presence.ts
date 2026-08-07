/**
 * How often an open editor says it is still there, and how long that is
 * believed for.
 *
 * The two belong together: the window has to outlast more than one missed
 * heartbeat, or a slow request would make somebody flicker out of the list of
 * who is editing. **Expiry is applied when the list is read** rather than by
 * deleting rows on a timer, so nothing depends on a sweep having run.
 */

export const PRESENCE_HEARTBEAT_SECONDS = 30

export const PRESENCE_WINDOW_SECONDS = 90
