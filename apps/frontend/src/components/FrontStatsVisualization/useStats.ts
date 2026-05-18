import { useState, useEffect } from "react";
import type { StatsState } from "./types";
import { normalizeStatsResponse } from "./utils";

export default function useStats() {
  const [state, setState] = useState<StatsState>({ loading: true, error: "", stats: null });
  
  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const response = await fetch("https://humandbs-staging.ddbj.nig.ac.jp/api/stats");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const payload = await response.json();
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
