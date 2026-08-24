import { Outlet } from "react-router"

import { requireActor } from "~/auth/actor.server"
import { PageWidthDefault } from "~/components/page"

import type { Route } from "./+types/admin-layout"

/**
 * What every management screen is inside.
 *
 * **It exists so that the area has one place rather than eighteen.** The
 * destinations, the width and the demand for a session are properties of the
 * area, and a screen added later — by somebody who has not read the other
 * seventeen — is held to them without having to know they exist.
 *
 * **A session, and not a capability.** The area's own front page is the one
 * screen a signed-in non-administrator may open: granting access needs a
 * `sub`, and nothing else on the portal shows a person theirs
 * (`docs/auth.md`). Each screen under here asks for the capability it needs, so
 * this guard being the weaker one loses nothing.
 *
 * **The navigation is not here.** It is in the bar with the wordmark, which is
 * drawn above the route tree (`root.tsx`), because the error boundary needs it
 * too.
 */
export async function loader({ request }: Route.LoaderArgs) {
  await requireActor(request)
  return null
}

export default function AdminLayout() {
  // The management screens are tables and side-by-side editors, so they take
  // the window rather than the reading measure the portal's pages hold to
  // (`docs/ui.md` の「幅」).
  return (
    <PageWidthDefault width="full">
      <Outlet />
    </PageWidthDefault>
  )
}
