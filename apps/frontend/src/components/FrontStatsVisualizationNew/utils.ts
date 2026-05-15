import * as THREE from "three";
import type { StatsSatellite, StatsSystem, NormalizedStats } from "./types";

export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function oklchToThreeColor(l: number, c: number, h: number): THREE.Color {
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b;
  const l_cubed = l_ * l_ * l_;
  const m_cubed = m_ * m_ * m_;
  const s_cubed = s_ * s_ * s_;
  const r_lin = +4.0767416621 * l_cubed - 3.3077115913 * m_cubed + 0.2309699292 * s_cubed;
  const g_lin = -1.2684380046 * l_cubed + 2.6097574011 * m_cubed - 0.3413193965 * s_cubed;
  const b_lin = -0.0041960863 * l_cubed - 0.7034186147 * m_cubed + 1.7076147010 * s_cubed;
  const gamma = (v: number) => {
    v = Math.max(0, Math.min(1, v));
    return v > 0.0031308 ? 1.055 * Math.pow(v, 1 / 2.4) - 0.055 : 12.92 * v;
  };
  return new THREE.Color(gamma(r_lin), gamma(g_lin), gamma(b_lin));
}

export function capitalize(str: string) {
  if (!str) return "";
  const s = str.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// Removed global blobMaterial. Using inline material per cluster.
export function normalizeStatsResponse(payload: unknown): NormalizedStats | null {
  const data = typeof payload === "object" && payload && "data" in payload ? (payload as any).data : payload;
  if (!data || typeof data !== "object") return null;

  const stats = data as any;
  if (!stats.research?.total && !stats.dataset?.total && !stats.facets) return null;

  const systems: StatsSystem[] = [];
  for (const [facet, values] of Object.entries(stats.facets ?? {})) {
    const satellites: StatsSatellite[] = [];
    for (const [value, counts] of Object.entries(values as any ?? {})) {
      const research = Number((counts as any)?.research ?? 0);
      const dataset = Number((counts as any)?.dataset ?? 0);
      const total = research + dataset;
      if (total <= 0) continue;
      satellites.push({ id: `${facet}:${value}`, facet, value, research, dataset, total });
    }
    satellites.sort((a, b) => b.total - a.total);
    if (satellites.length === 0) continue;
    systems.push({
      facet,
      total: satellites.reduce((acc, sat) => acc + sat.total, 0),
      satellites,
    });
  }

  systems.sort((a, b) => b.total - a.total);
  return {
    researchTotal: Number(stats.research?.total ?? 0),
    datasetTotal: Number(stats.dataset?.total ?? 0),
    systems: systems,
  };
}
