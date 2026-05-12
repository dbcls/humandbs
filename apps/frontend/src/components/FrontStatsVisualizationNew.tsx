import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { Link, useNavigate } from "@tanstack/react-router";
import stubStats from "./stats.stub.json";
import { SkeletonLoading } from "@/components/Skeleton";

// --- Types & Data Fetching ---

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

  // Filter out facets that might not be useful for coverflow
  // e.g., fileTypes, hasPhenotypeData etc might be too generic.
  // We keep the top 8 most rich facets
  systems.sort((a, b) => b.total - a.total);

  return {
    researchTotal: Number(stats.research?.total ?? 0),
    datasetTotal: Number(stats.dataset?.total ?? 0),
    systems: systems.slice(0, 8),
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
        const payload = stubStats;
        await new Promise((resolve) => setTimeout(resolve, 300));
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

// --- Visual Components ---

const COLOR_PALETTES = [
  ["#1a5fbd", "#1a96d2", "#2ebedb"], // Blues
  ["#eb0075", "#ff618e", "#ff8fa3"], // Pinks
  ["#2a5b73", "#4caf50", "#8bc34a"], // Greens
  ["#673ab7", "#9c27b0", "#e1bee7"], // Purples
  ["#ff9800", "#ffc107", "#ffeb3b"], // Oranges
];

type SimNode = StatsSatellite & { 
  targetRadius: number;
  currentRadius: number;
  color: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  index?: number;
};

function FluidCluster({
  system,
  mode,
  isActive,
  isHovered,
  onHover,
  onLeave,
  onClickNode,
  paletteIndex
}: {
  system: StatsSystem;
  mode: "research" | "dataset";
  isActive: boolean;
  isHovered: boolean;
  onHover: () => void;
  onLeave: () => void;
  onClickNode: (facet: string, value: string) => void;
  paletteIndex: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<any>(null);
  const [nodes, setNodes] = useState<SimNode[]>([]);
  const containerSize = isActive ? 400 : 250;

  // We only show top 15 satellites to avoid clutter, filter out 0 values for current mode
  const satellites = useMemo(() => {
    return system.satellites
      .filter((s) => s[mode] > 0)
      .slice(0, 15);
  }, [system, mode]);

  useEffect(() => {
    if (satellites.length === 0) {
      setNodes([]);
      return;
    }

    const palette = COLOR_PALETTES[paletteIndex % COLOR_PALETTES.length]!;
    
    const extent = d3.extent(satellites, (d: StatsSatellite) => d[mode]) as [number, number];
    const maxVal = Math.max(1, extent[1] ?? 1);
    const radiusScale = d3.scaleSqrt().domain([0, maxVal]).range([5, isActive ? 45 : 25]);

    // Initialize or update nodes
    setNodes((prevNodes) => {
      const newNodes = satellites.map((sat, i) => {
        const existing = prevNodes.find((n) => n.id === sat.id);
        const targetRadius = radiusScale(sat[mode]);
        return {
          ...sat,
          x: existing?.x ?? (Math.random() - 0.5) * 50,
          y: existing?.y ?? (Math.random() - 0.5) * 50,
          vx: existing?.vx ?? 0,
          vy: existing?.vy ?? 0,
          targetRadius,
          currentRadius: existing?.currentRadius ?? targetRadius,
          color: palette[i % palette.length]!,
        };
      });
      return newNodes;
    });
  }, [satellites, mode, isActive, paletteIndex]);

  useEffect(() => {
    if (nodes.length === 0) return;

    // Simulation forces
    const strengthHover = isHovered ? -20 : 2; // Repel when hovered, attract when not
    const collideMargin = isHovered ? 8 : -2;  // Gap when hovered, overlap when gooey

    const simulation = (d3.forceSimulation as any)(nodes)
      .force("charge", (d3.forceManyBody() as any).strength(strengthHover))
      .force(
        "collide",
        (d3.forceCollide() as any).radius((d: SimNode) => d.targetRadius + collideMargin).iterations(3)
      )
      .force("x", d3.forceX(0).strength(isHovered ? 0.05 : 0.08))
      .force("y", d3.forceY(0).strength(isHovered ? 0.05 : 0.08))
      .alpha(isHovered ? 1 : 0.3) // Reheat simulation gently
      .alphaDecay(0.02)
      .on("tick", () => {
        // Smoothly interpolate radius for transitions
        setNodes((current) =>
          current.map((n) => {
            n.currentRadius += (n.targetRadius - n.currentRadius) * 0.1;
            return { ...n };
          })
        );
      });

    simulationRef.current = simulation;

    return () => {
      simulation.stop();
    };
  }, [nodes.length, isHovered, isActive]); // We don't want to re-run on every nodes update, just state changes

  const centerOffset = containerSize / 2;

  return (
    <div
      className={`relative rounded-full transition-all duration-700 cursor-pointer flex items-center justify-center`}
      style={{
        width: containerSize,
        height: containerSize,
      }}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      <svg
        ref={svgRef}
        width={containerSize}
        height={containerSize}
        className="absolute inset-0 overflow-visible"
        style={{ filter: isHovered ? "none" : `url(#gooey-${system.facet})` }}
      >
        <defs>
          <filter id={`gooey-${system.facet}`}>
            <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>

        <g transform={`translate(${centerOffset},${centerOffset})`}>
          {nodes.map((node) => (
            <g
              key={node.id}
              transform={`translate(${node.x || 0},${node.y || 0})`}
              className={`transition-opacity duration-300 ${isHovered ? "opacity-100 hover:opacity-80" : "opacity-90"}`}
              onClick={(e) => {
                if (isHovered) {
                  e.stopPropagation();
                  onClickNode(node.facet, node.value);
                }
              }}
            >
              <circle
                r={Math.max(0, node.currentRadius)}
                fill={node.color}
                className="transition-all duration-300"
              />
            </g>
          ))}
        </g>
      </svg>
      
      {/* Labels rendered outside SVG for better text rendering and absolute positioning */}
      {isHovered && isActive && (
        <div className="absolute inset-0 pointer-events-none">
          {nodes.map((node) => (
            <div
              key={`label-${node.id}`}
              className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center pointer-events-none transition-all duration-100"
              style={{
                left: centerOffset + (node.x || 0),
                top: centerOffset + (node.y || 0),
                width: node.currentRadius * 2,
              }}
            >
              {node.currentRadius > 15 && (
                <>
                  <span className="text-white font-bold text-[10px] leading-tight text-center px-1 drop-shadow-md truncate w-full">
                    {node.value}
                  </span>
                  {node.currentRadius > 25 && (
                    <span className="text-white/90 font-medium text-[9px] drop-shadow-md">
                      {node[mode].toLocaleString()}
                    </span>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Main Facet Label - fades out on hover */}
      <div 
        className={`absolute pointer-events-none flex flex-col items-center justify-center transition-opacity duration-500 bg-white/80 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg ${isHovered ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}
        style={{ transform: `translateY(${isActive ? '140px' : '90px'})` }}
      >
        <h3 className="font-bold text-slate-800 text-sm tracking-wide uppercase">{system.facet}</h3>
        <p className="text-xs text-slate-500 font-medium">
          {d3.sum(satellites, (d: StatsSatellite) => d[mode]).toLocaleString()} items
        </p>
      </div>
    </div>
  );
}

// --- Main Container ---

export default function FrontStatsVisualizationNew() {
  const { loading, error, stats } = useStats();
  const [mode, setMode] = useState<"dataset" | "research">("dataset");
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  
  // Custom navigation to handle search params
  const navigate = useNavigate();

  // Auto-play logic
  useEffect(() => {
    if (isHovered || !stats) return;
    
    const interval = setInterval(() => {
      setActiveIndex((current) => (current + 1) % stats.systems.length);
    }, 4000);
    
    return () => clearInterval(interval);
  }, [isHovered, stats]);

  const handleNodeClick = (facet: string, value: string) => {
    const filters = encodeURIComponent(JSON.stringify({ [facet]: [value] }));
    const to = `/${mode === 'dataset' ? 'dataset' : 'research'}` as any;
    // Note: since this is dynamic routing, we construct the search string manually or use navigate with search obj if supported
    navigate({
      to,
      search: { filters: JSON.parse(decodeURIComponent(filters)), page: 1, limit: 20, order: 'asc' } as any
    });
  };

  if (loading) {
    return (
      <div className="w-full h-[500px] flex items-center justify-center mt-8">
        <SkeletonLoading />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="w-full p-8 bg-red-50 text-red-600 mt-8 rounded-xl">
        {error || "No data available"}
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center gap-8 py-12 rounded-2xl mt-8 overflow-hidden">
      
      {/* Toggle Switch */}
      <div className="flex items-center bg-white p-1.5 rounded-full shadow-sm border border-slate-200">
        <button
          onClick={() => setMode("dataset")}
          className={`px-8 py-2.5 rounded-full text-sm font-bold transition-all duration-300 ${
            mode === "dataset"
              ? "bg-secondary text-white shadow-md"
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          }`}
        >
          Dataset <span className="ml-2 opacity-80 font-normal">({stats.datasetTotal.toLocaleString()})</span>
        </button>
        <button
          onClick={() => setMode("research")}
          className={`px-8 py-2.5 rounded-full text-sm font-bold transition-all duration-300 ${
            mode === "research"
              ? "bg-accent text-white shadow-md"
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          }`}
        >
          Research <span className="ml-2 opacity-80 font-normal">({stats.researchTotal.toLocaleString()})</span>
        </button>
      </div>

      {/* Coverflow Carousel */}
      <div className="relative w-full max-w-6xl h-[450px] flex items-center justify-center perspective-[1200px]">
        {stats.systems.map((system, i) => {
          // Calculate relative position (-2, -1, 0, 1, 2)
          let offset = i - activeIndex;
          const total = stats.systems.length;
          
          // Wrap around logic for circular carousel
          if (offset < -Math.floor(total / 2)) offset += total;
          if (offset > Math.floor(total / 2)) offset -= total;
          
          const isActive = offset === 0;
          const isVisible = Math.abs(offset) <= 2; // only show 5 items max
          
          if (!isVisible) return null;

          // Compute Transform
          const translateX = offset * 220; // px spacing
          const translateZ = Math.abs(offset) * -150; // push back
          const rotateY = offset * -25; // angle inwards
          const opacity = isActive ? 1 : 1 - Math.abs(offset) * 0.3;

          return (
            <div
              key={system.facet}
              className="absolute top-1/2 left-1/2 transition-all duration-700 ease-out"
              style={{
                transform: `translate(-50%, -50%) translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotateY}deg)`,
                zIndex: 10 - Math.abs(offset),
                opacity: opacity,
              }}
            >
              <FluidCluster
                system={system}
                mode={mode}
                isActive={isActive}
                isHovered={isActive && isHovered}
                onHover={() => {
                  if (isActive) setIsHovered(true);
                  if (!isActive) setActiveIndex(i); // click/hover to focus
                }}
                onLeave={() => {
                  if (isActive) setIsHovered(false);
                }}
                onClickNode={handleNodeClick}
                paletteIndex={i}
              />
            </div>
          );
        })}
      </div>

      {/* Indicators */}
      <div className="flex gap-2 mt-4">
        {stats.systems.map((sys, i) => (
          <button
            key={`indicator-${sys.facet}`}
            onClick={() => setActiveIndex(i)}
            className={`transition-all duration-300 rounded-full h-2 ${
              i === activeIndex ? "bg-secondary w-8" : "bg-slate-300 hover:bg-slate-400 w-2"
            }`}
            aria-label={`Go to ${sys.facet}`}
          />
        ))}
      </div>
    </div>
  );
}
