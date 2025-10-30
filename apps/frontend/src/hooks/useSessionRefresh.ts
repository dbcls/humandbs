import { useCallback, useEffect, useRef, useState } from "react";

import type { SessionMeta } from "@/utils/jwt-helpers";

type UseSessionRefreshOptions = {
  session: SessionMeta | null | undefined;
  refreshUrl?: string;
  bufferSeconds?: number;
  onUnauthorized?: () => void;
};

type RefreshResponse = {
  refreshed?: boolean;
  session?: {
    expires_at?: string | null;
    expiresAt?: string | null;
    refresh_expires_at?: string | null;
    refreshExpiresAt?: string | null;
  };
};

export function useSessionRefresh({
  session,
  refreshUrl = "/api/auth/refresh",
  bufferSeconds = 60,
  onUnauthorized,
}: UseSessionRefreshOptions) {
  const [expiresAt, setExpiresAt] = useState<string | null>(
    session?.expires_at ?? null
  );
  const timeoutRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const clearTimer = () => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const handleUnauthorized = useCallback(() => {
    if (onUnauthorized) {
      onUnauthorized();
    } else {
      window.location.assign("/api/auth/login");
    }
  }, [onUnauthorized]);

  const refresh = useCallback(async () => {
    try {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const response = await fetch(refreshUrl, {
        method: "POST",
        signal: controller.signal,
      });

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!response.ok) {
        console.error("Unexpected refresh response", response.status);
        return;
      }

      const data = (await response.json()) as RefreshResponse;
      const nextExpiresAt =
        data?.session?.expires_at ??
        data?.session?.expiresAt ??
        null;

      if (nextExpiresAt) {
        setExpiresAt(nextExpiresAt);
      }

      const refreshExpiresAt =
        data?.session?.refresh_expires_at ??
        data?.session?.refreshExpiresAt ??
        null;

      if (refreshExpiresAt) {
        // If refresh token already expired, force re-login.
        const refreshExpiryMs = Date.parse(refreshExpiresAt);
        if (!Number.isNaN(refreshExpiryMs) && refreshExpiryMs <= Date.now()) {
          handleUnauthorized();
        }
      }
    } catch (error) {
      if ((error as { name?: string }).name === "AbortError") {
        return;
      }

      console.error("Failed to refresh session", error);
    }
  }, [handleUnauthorized, refreshUrl]);

  useEffect(() => {
    setExpiresAt(session?.expires_at ?? null);
  }, [session?.expires_at]);

  useEffect(() => {
    if (!session?.refresh_expires_at) {
      return;
    }

    const refreshExpiryMs = Date.parse(session.refresh_expires_at);
    if (!Number.isNaN(refreshExpiryMs) && refreshExpiryMs <= Date.now()) {
      handleUnauthorized();
    }
  }, [handleUnauthorized, session?.refresh_expires_at]);

  useEffect(() => {
    clearTimer();

    if (!expiresAt) {
      return;
    }

    const expiryMs = Date.parse(expiresAt);
    if (Number.isNaN(expiryMs)) {
      return;
    }

    const delay = Math.max(expiryMs - Date.now() - bufferSeconds * 1000, 0);

    if (delay === 0) {
      void refresh();
      return;
    }

    timeoutRef.current = window.setTimeout(() => {
      void refresh();
    }, delay);

    return () => {
      clearTimer();
      abortRef.current?.abort();
    };
  }, [bufferSeconds, expiresAt, refresh]);
}
