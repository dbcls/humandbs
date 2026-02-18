import { useSessionRefresh } from "@/hooks/useSessionRefresh";
import type { SessionMeta } from "@/utils/jwt-helpers";

type SessionRefreshHandlerProps = {
  session: SessionMeta | null | undefined;
};

export function SessionRefreshHandler({
  session,
}: SessionRefreshHandlerProps) {
  useSessionRefresh({ session });
  return null;
}
