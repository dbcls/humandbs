import { forwardToAssistant } from "~/assistant/proxy.server"
import { fromSameSite } from "~/assistant/target"
import { requireCapability } from "~/auth/actor.server"

import type { Route } from "./+types/admin-assistant-api"

/**
 * The one way into the assistant.
 *
 * **The service holds no authorisation of its own.** It is not published
 * outside the compose network and does not read a token, so being reachable
 * here is what decides who may use it — which is why the check is the first
 * thing either handler does, and why nothing else in the portal is allowed to
 * call the service (`docs/assistant.md`).
 *
 * **The second check is the one the framework cannot make.** React Router turns
 * away a mutation sent from another site, but not on a route that answers with
 * data rather than with a page — and this one hands every method on to a
 * service whose endpoints the portal knows nothing about (`assistant/target.ts`
 * の `fromSameSite`).
 *
 * **Every method arrives at one of two exports.** React Router gives a route a
 * `loader` for reads and an `action` for everything else, so the split here is
 * the framework's rather than the assistant's: both hand the request on
 * untouched.
 */
async function forward(request: Request, rest: string | undefined): Promise<Response> {
  await requireCapability(request, "use-assistant")
  if (!fromSameSite(request)) {
    throw new Response(null, { status: 400, statusText: "Bad Request" })
  }
  return forwardToAssistant(request, rest ?? "")
}

export async function loader({ request, params }: Route.LoaderArgs) {
  return forward(request, params["*"])
}

export async function action({ request, params }: Route.ActionArgs) {
  return forward(request, params["*"])
}
