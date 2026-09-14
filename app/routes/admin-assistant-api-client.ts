import { assistantApiPath } from "~/admin/urls"
import { normalizeQuery } from "~/public/urls"

import { record } from "./admin-assistant-decoders"

type SignInRedirect = () => void

export function assistantLoginPath(pathname: string, search: string): string {
  const query = new URLSearchParams({
    redirect: `${pathname}${normalizeQuery(search)}`,
  })
  return `/auth/login?${query.toString()}`
}

function redirectToSignIn(): void {
  window.location.assign(
    assistantLoginPath(window.location.pathname, window.location.search),
  )
}

function jsonResponse(response: Response): boolean {
  const contentType = response.headers.get("content-type")?.toLowerCase()
  return contentType?.includes("/json") === true
    || contentType?.includes("+json") === true
}

function expiredSession(
  response: Response,
  requireJson: boolean,
): boolean {
  if (!response.ok) return false
  if (response.redirected) return true
  if (response.status === 204) return false
  return requireJson
    ? !jsonResponse(response)
    : response.headers.get("content-type")?.toLowerCase().includes("text/html")
      === true
}

async function responseError(
  response: Response,
  fallback: string,
): Promise<Error> {
  if (!jsonResponse(response)) return new Error(fallback)
  try {
    const body = record(await response.json())
    return new Error(
      body !== undefined && typeof body.detail === "string"
        ? body.detail
        : fallback,
    )
  } catch {
    return new Error(fallback)
  }
}

export async function assistantResponseJson(
  response: Response,
  fallback: string,
  signIn: SignInRedirect = redirectToSignIn,
): Promise<unknown> {
  if (expiredSession(response, true)) {
    signIn()
    throw new Error(fallback)
  }
  if (!response.ok) throw await responseError(response, fallback)
  try {
    return await response.json()
  } catch {
    throw new Error(fallback)
  }
}

async function assistantResponse(
  response: Response,
  fallback: string,
  signIn: SignInRedirect = redirectToSignIn,
): Promise<void> {
  if (expiredSession(response, false)) {
    signIn()
    throw new Error(fallback)
  }
  if (!response.ok) throw await responseError(response, fallback)
}

export async function assistantJson(
  path: string,
  fallback: string,
  init?: RequestInit,
): Promise<unknown> {
  return assistantResponseJson(
    await fetch(assistantApiPath(path), init),
    fallback,
  )
}

export async function assistantRequest(
  path: string,
  fallback: string,
  init?: RequestInit,
): Promise<void> {
  await assistantResponse(await fetch(assistantApiPath(path), init), fallback)
}
