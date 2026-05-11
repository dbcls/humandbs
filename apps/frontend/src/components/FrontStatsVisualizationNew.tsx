import { useEffect, useMemo, useState } from "react";
import stubStats from "./stats.stub.json";
import { Card } from "@/components/Card";
import { SkeletonLoading } from "@/components/Skeleton";

// Re-using the same normalization logic for now
type StatsSatellite = {
  id: string;
  facet: string;
  value: string;
  research: number;
  dataset: number;
  total: number;
};

type StatsSystem = {
  facet: string;
  total: number;
  satellites: StatsSatellite[];
};

type NormalizedStats = {
  researchTotal: number;
  datasetTotal: number;
  systems: StatsSystem[];
  nodes: StatsSatellite[];
};

type StatsState = {
  loading: boolean;
  error: string;
  stats: NormalizedStats | null;
};

function normalizeStatsResponse(payload: unknown): NormalizedStats | null {
  const data =
    typeof payload === "object" && payload && "data" in payload
      ? (payload as { data?: unknown }).data
      : payload;

  if (!data || typeof data !== "object") {
    return null;
  }

  const stats = data as {
    research?: { total?: number };
    dataset?: { total?: number };
    facets?: Record<
      string,
      Record<string, { research?: number; dataset?: number } | undefined>
    >;
  };

  if (!stats.research?.total && !stats.dataset?.total && !stats.facets) {
    return null;
  }

  const systems: StatsSystem[] = [];

  for (const [facet, values] of Object.entries(stats.facets ?? {})) {
    const satellites: StatsSatellite[] = [];

    for (const [value, counts] of Object.entries(values ?? {})) {
      const research = Number(counts?.research ?? 0);
      const dataset = Number(counts?.dataset ?? 0);
      const total = research + dataset;

      if (total <= 0) continue;

      satellites.push({
        id: `${facet}:${value}`,
        facet,
        value,
        research,
        dataset,
        total,
      });
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
    systems,
    nodes: systems.flatMap((system) => system.satellites),
  };
}

function useStats() {
  const [state, setState] = useState<StatsState>({
    loading: true,
    error: "",
    stats: null,
  });

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        // --- TEMPORARY STUB START ---
        const payload = stubStats;
        await new Promise(resolve => setTimeout(resolve, 500));
        // --- TEMPORARY STUB END ---

        const normalized = normalizeStatsResponse(payload);

        if (!normalized) {
          throw new Error("Unexpected stats payload format");
        }

        if (mounted) {
          setState({ loading: false, error: "", stats: normalized });
        }
      } catch (error) {
        if (mounted) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          setState({
            loading: false,
            error: `Could not load stats (${message}).`,
            stats: null,
          });
        }
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  return state;
}

function BentoStats({ stats }: { stats: NormalizedStats }) {
  const topSystems = useMemo(() => stats.systems.slice(0, 6), [stats.systems]);

  return (
    <div className="w-full flex flex-col gap-6 p-4 bg-transparent rounded-xl mt-8">
      <div className="flex items-end gap-4 mb-4">
        <h2 className="text-3xl font-bold text-slate-800">Project Statistics</h2>
        <p className="text-slate-500 mb-1">New modern dashboard view</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white p-6 shadow-lg border-0 transform transition-transform hover:-translate-y-1 hover:shadow-xl duration-300">
          <p className="text-indigo-100 font-medium text-sm uppercase tracking-wider mb-2">Total Datasets</p>
          <div className="text-5xl font-black">{stats.datasetTotal.toLocaleString()}</div>
        </Card>
        
        <Card className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white p-6 shadow-lg border-0 transform transition-transform hover:-translate-y-1 hover:shadow-xl duration-300">
          <p className="text-emerald-100 font-medium text-sm uppercase tracking-wider mb-2">Total Research</p>
          <div className="text-5xl font-black">{stats.researchTotal.toLocaleString()}</div>
        </Card>
      </div>

      <h3 className="text-xl font-bold text-slate-700 mt-6 mb-2">Top Facets</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {topSystems.map((system) => (
          <Card key={system.facet} className="flex flex-col p-6 shadow-sm hover:shadow-md transition-shadow bg-white border border-slate-100">
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-bold text-slate-800 text-lg truncate pr-4" title={system.facet}>{system.facet}</h4>
              <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-1 rounded-full">
                {system.total.toLocaleString()} total
              </span>
            </div>
            
            <div className="flex-1 flex flex-col gap-3">
              {system.satellites.slice(0, 5).map((sat) => {
                const percentage = Math.max(2, Math.round((sat.total / system.total) * 100));
                return (
                  <div key={sat.id} className="flex flex-col gap-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600 truncate max-w-[180px]" title={sat.value}>{sat.value}</span>
                      <span className="text-slate-900 font-medium">{sat.total.toLocaleString()}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5">
                      <div 
                        className="bg-indigo-400 h-1.5 rounded-full" 
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {system.satellites.length > 5 && (
                <div className="text-xs text-slate-400 font-medium mt-2 text-center">
                  + {system.satellites.length - 5} more items
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function FrontStatsVisualizationNew() {
  const { loading, error, stats } = useStats();

  if (loading) {
    return (
      <Card className="w-full h-64 flex items-center justify-center mt-8">
        <SkeletonLoading />
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full p-8 bg-red-50 text-red-600 mt-8">
        {error}
      </Card>
    );
  }

  if (!stats) return null;

  return <BentoStats stats={stats} />;
}
