import { useState, useEffect } from "react";
import type { StatsState } from "./types";
import { normalizeStatsResponse } from "./utils";
import { api } from "@/services/backend";

export default function useStats() {
  const [state, setState] = useState<StatsState>({ loading: true, error: "", stats: null });
  
  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const payload = await api.getStats();
        const normalized = normalizeStatsResponse(payload);
        if (!normalized) throw new Error("Unexpected stats payload format");
        if (mounted) setState({ loading: false, error: "", stats: normalized });
      } catch (err) {
        if (mounted) setState({ loading: false, error: "Could not load stats.", stats: null });
      }
    }
    load();
    return () => { mounted = false; };
  }, []);
  
  return state;
}
