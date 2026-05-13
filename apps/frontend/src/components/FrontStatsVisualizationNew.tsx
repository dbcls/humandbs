import React, { useEffect, useMemo, useRef, useState, Suspense } from "react";
import * as d3 from "d3";
import { Link, useNavigate } from "@tanstack/react-router";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Environment, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { MarchingCubes as MarchingCubesImpl } from "three-stdlib";
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
    systems: systems.slice(0, 8),
  };
}

function useStats() {
  const [state, setState] = useState<StatsState>({ loading: true, error: "", stats: null });
  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const payload = stubStats;
        await new Promise((resolve) => setTimeout(resolve, 300));
        const normalized = normalizeStatsResponse(payload);
        if (!normalized) throw new Error("Unexpected stats payload format");
        if (mounted) setState({ loading: false, error: "", stats: normalized });
      } catch (error) {
        if (mounted) setState({ loading: false, error: `Could not load stats.`, stats: null });
      }
    }
    load();
    return () => { mounted = false; };
  }, []);
  return state;
}

// --- Configuration & Materials ---

const INITIAL_CAROUSEL_RADIUS = 280;
const INITIAL_CAROUSEL_ROTATION_SPEED = 0.05; // Radians per second
const BLOB_RESOLUTION = 40;
const INITIAL_BLOB_SCALE = 160; // Scale of the [0,1] MarchingCubes grid in 3D units

// Beautiful, dreamy pastel palettes for the blobs
const COLOR_PALETTES = [
  ["#a2d2ff", "#bde0fe", "#ffafcc", "#ffc8dd"], // Cotton Candy
  ["#cbb2fe", "#e2cbf7", "#f1e3f3", "#c6d8ff"], // Lavender
  ["#9bf6ff", "#a0c4ff", "#bdb2ff", "#ffc6ff"], // Bright Pastels
  ["#ffcdb2", "#ffb4a2", "#e5989b", "#b5838d"], // Warm Sunset
  ["#a0e8af", "#ffb5a7", "#fcd5ce", "#f8edeb"], // Mint/Peach
  ["#caf0f8", "#90e0ef", "#00b4d8", "#0077b6"], // Deep Ocean
  ["#d8e2dc", "#ffe5d9", "#ffcad4", "#f4acb7"], // Rosy
  ["#e0aaff", "#c77dff", "#9d4edd", "#7b2cbf"], // Royal Purple
];

// Shared material for all blobs for maximum performance and unified lighting
const blobMaterial = new THREE.MeshPhysicalMaterial({
  roughness: 0.1,
  transmission: 0.4,
  thickness: 2.5,
  clearcoat: 1.0,
  clearcoatRoughness: 0.1,
  vertexColors: true,
  envMapIntensity: 1.5,
});

type SimNode = StatsSatellite & { 
  d3Radius: number;
  strength: number;
  currentStrength: number;
  color: THREE.Color;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
};

// --- Single Blob Cluster Component ---

function BlobCluster({
  system,
  mode,
  isActive,
  position,
  rotation,
  paletteIndex,
  onClick,
  blobScale
}: {
  system: StatsSystem;
  mode: "research" | "dataset";
  isActive: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
  paletteIndex: number;
  onClick: (facet: string, value: string) => void;
  blobScale: number;
}) {
  const [nodes, setNodes] = useState<SimNode[]>([]);
  const simulationRef = useRef<any>(null);
  
  // Create a raw MarchingCubes instance from three-stdlib
  const mc = useMemo(() => new MarchingCubesImpl(BLOB_RESOLUTION, blobMaterial, false, true, 10000), []);
  
  // Use up to 20 largest satellites to keep performance high and blobs chunky
  const satellites = useMemo(() => {
    return system.satellites.filter((s) => s[mode] > 0).slice(0, 20);
  }, [system, mode]);

  useEffect(() => {
    if (satellites.length === 0) return;

    const palette = COLOR_PALETTES[paletteIndex % COLOR_PALETTES.length]!;
    const extent = d3.extent(satellites, (d: StatsSatellite) => d[mode]) as [number, number];
    const maxVal = Math.max(1, extent[1] ?? 1);
    
    // Scale for physical collision (D3 space is roughly [-50, 50])
    const radiusScale = d3.scaleSqrt().domain([0, maxVal]).range([8, 25]);
    // Scale for visual size in MarchingCubes (strength)
    const strengthScale = d3.scaleSqrt().domain([0, maxVal]).range([0.4, 1.8]);

    setNodes((prev) => {
      return satellites.map((sat, i) => {
        const existing = prev.find((n) => n.id === sat.id);
        const d3Radius = radiusScale(sat[mode]);
        const strength = strengthScale(sat[mode]);
        return {
          ...sat,
          x: existing?.x ?? (Math.random() - 0.5) * 40,
          y: existing?.y ?? (Math.random() - 0.5) * 40,
          vx: existing?.vx ?? 0,
          vy: existing?.vy ?? 0,
          d3Radius,
          strength,
          currentStrength: existing?.currentStrength ?? strength,
          color: existing?.color ?? new THREE.Color(palette[i % palette.length]),
        };
      });
    });
  }, [satellites, mode, paletteIndex]);

  useEffect(() => {
    if (nodes.length === 0) return;

    // Organic D3 Force Setup
    const simulation = (d3.forceSimulation as any)(nodes)
      .force("charge", (d3.forceManyBody() as any).strength(2)) // Slight repulsion
      .force("collide", (d3.forceCollide() as any).radius((d: SimNode) => d.d3Radius - 2).iterations(3)) // -2 allows them to overlap and fuse visually
      .force("x", d3.forceX(0).strength(isActive ? 0.04 : 0.06)) // Active clusters are looser
      .force("y", d3.forceY(0).strength(isActive ? 0.04 : 0.06))
      .alpha(1)
      .alphaDecay(0.01)
      .on("tick", () => {
        setNodes((current) => current.map((n) => {
          n.currentStrength += (n.strength - n.currentStrength) * 0.1;
          return { ...n };
        }));
      });

    simulationRef.current = simulation;
    return () => simulation.stop();
  }, [nodes.length, isActive]);

  // Update the raw MarchingCubes mesh every frame
  useFrame(() => {
    mc.reset();
    
    // Map D3's [-50, 50] space to MarchingCubes [0, 1] space
    nodes.forEach(node => {
      const nx = 0.5 + (node.x || 0) * 0.01;
      const ny = 0.5 + (node.y || 0) * 0.01;
      const nz = 0.5; // Flattened depth slightly, but organic due to radii
      
      // Keep within bounds
      if (nx > 0 && nx < 1 && ny > 0 && ny < 1) {
        mc.addBall(nx, ny, nz, node.currentStrength, 12, node.color);
      }
    });
    
    mc.update();
  });

  return (
    <group position={position} rotation={rotation}>
      <group 
        onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = 'auto'; }}
        onClick={(e) => { 
          e.stopPropagation(); 
          if (satellites.length > 0) {
            onClick(system.facet, satellites[0].value); 
          }
        }}
      >
        {/* We center the [0,1] grid by moving it by -0.5 * blobScale */}
        <primitive object={mc} scale={blobScale} position={[-blobScale/2, -blobScale/2, -blobScale/2]} />
      </group>
      
      {/* HTML Label perfectly attached to the 3D group */}
      <Html center position={[0, -100, 0]} zIndexRange={[100, 0]} distanceFactor={600}>
        <div 
          className={`flex flex-col items-center justify-center transition-all duration-700 pointer-events-none 
            ${isActive ? 'opacity-100 scale-110 drop-shadow-xl' : 'opacity-30 scale-90'}`}
          style={{ width: 'max-content' }}
        >
          <div className="bg-white/90 backdrop-blur-md px-4 py-2 rounded-full shadow-lg border border-white/20">
            <h3 className="font-bold text-slate-800 text-base tracking-widest uppercase">{system.facet}</h3>
            <p className="text-xs text-slate-500 font-medium text-center mt-0.5">
              {d3.sum(satellites, (d: StatsSatellite) => d[mode]).toLocaleString()} items
            </p>
          </div>
        </div>
      </Html>
    </group>
  );
}

// --- Main Carousel 3D Engine ---

function CarouselScene({ 
  stats, 
  mode, 
  navigate, 
  carouselRadius,
  rotationSpeed,
  blobScale
}: { 
  stats: NormalizedStats, 
  mode: "dataset" | "research", 
  navigate: any,
  carouselRadius: number,
  rotationSpeed: number,
  blobScale: number
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  const total = stats.systems.length;

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    // Auto-rotation logic
    if (!isHovered) {
      groupRef.current.rotation.y += rotationSpeed * delta;
    }

    // Determine which cluster is currently at the front (closest to camera Z)
    let normalizedRot = groupRef.current.rotation.y % (Math.PI * 2);
    if (normalizedRot < 0) normalizedRot += Math.PI * 2;
    
    const slice = (Math.PI * 2) / total;
    let closestIdx = Math.round(normalizedRot / slice) % total;
    closestIdx = (total - closestIdx) % total;

    if (closestIdx !== activeIndex) {
      setActiveIndex(closestIdx);
    }
  });

  const handleFacetClick = (facet: string, value: string) => {
    const filters = encodeURIComponent(JSON.stringify({ [facet]: [value] }));
    const to = `/${mode === 'dataset' ? 'dataset' : 'research'}` as any;
    navigate({
      to,
      search: { filters: JSON.parse(decodeURIComponent(filters)), page: 1, limit: 20, order: 'asc' } as any
    });
  };

  return (
    <>
      {/* Soft, beautiful lighting for pastel organic surfaces */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 20, 15]} intensity={1.5} color="#ffffff" castShadow />
      <pointLight position={[-20, -10, -20]} intensity={1.5} color="#c6d8ff" />
      <pointLight position={[20, -10, 20]} intensity={1} color="#ffc8dd" />

      {/* A soft shadow plane underneath the carousel gives a premium grounded feel */}
      <ContactShadows position={[0, -150, 0]} opacity={0.4} scale={800} blur={2.5} far={200} />

      {/* Group tilted down slightly for a "carousel" projector view */}
      <group rotation={[-0.2, 0, 0]}>
        <group 
          ref={groupRef}
          onPointerEnter={() => setIsHovered(true)}
          onPointerLeave={() => setIsHovered(false)}
        >
          {stats.systems.map((sys, i) => {
            const angle = i * ((Math.PI * 2) / total);
            // Distribute in a circle in the XZ plane
            const x = Math.sin(angle) * carouselRadius;
            const z = Math.cos(angle) * carouselRadius;
            // Items face outwards
            const ry = angle;

            return (
              <BlobCluster
                key={sys.facet}
                system={sys}
                mode={mode}
                paletteIndex={i}
                isActive={activeIndex === i}
                position={[x, 0, z]}
                rotation={[0, ry, 0]}
                onClick={handleFacetClick}
                blobScale={blobScale}
              />
            );
          })}
        </group>
      </group>
    </>
  );
}

// --- Dynamic Camera Updater ---
// React Three Fiber's <Canvas camera={...}> prop is only used on initial mount.
// To dynamically update the camera/fog during HMR or state changes, we must use this component.
function CameraUpdater({ radius }: { radius: number }) {
  const { camera, scene } = useThree();

  useEffect(() => {
    const cameraZ = radius * 2.5;
    const fogStart = cameraZ - radius * 0.8;
    const fogEnd = cameraZ + radius * 1.5;

    camera.position.set(0, radius * 0.3, cameraZ);
    camera.updateProjectionMatrix();

    if (scene.fog) {
      scene.fog.near = fogStart;
      scene.fog.far = fogEnd;
    }
  }, [radius, camera, scene]);

  return null;
}

// --- Application Shell ---

export default function FrontStatsVisualizationNew() {
  const { loading, error, stats } = useStats();
  const [mode, setMode] = useState<"dataset" | "research">("dataset");
  const [isMounted, setIsMounted] = useState(false);
  
  // Real-time Debug Parameters
  const [debugParams, setDebugParams] = useState({
    carouselRadius: INITIAL_CAROUSEL_RADIUS,
    blobScale: INITIAL_BLOB_SCALE,
    rotationSpeed: INITIAL_CAROUSEL_ROTATION_SPEED,
    transmission: 0.4,
    clearcoat: 1.0,
    thickness: 2.5,
  });

  const navigate = useNavigate();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Sync debug params to material
  useEffect(() => {
    blobMaterial.transmission = debugParams.transmission;
    blobMaterial.clearcoat = debugParams.clearcoat;
    blobMaterial.thickness = debugParams.thickness;
    blobMaterial.needsUpdate = true;
  }, [debugParams]);

  if (!isMounted || loading) {
    return (
      <div className="w-full h-[650px] flex items-center justify-center mt-8">
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

  // Dynamic Camera & Fog settings based on Carousel Radius
  // If user increases carouselRadius, the camera pulls back automatically so items don't disappear.
  const cameraZ = debugParams.carouselRadius * 2.5; 
  const fogStart = cameraZ - debugParams.carouselRadius * 0.8;
  const fogEnd = cameraZ + debugParams.carouselRadius * 1.5;

  return (
    <div className="w-full flex flex-col items-center gap-8 py-12 rounded-3xl mt-8 overflow-hidden bg-slate-50 shadow-inner relative">
      
      {/* --- LIVE DEBUG PANEL (Development Only) --- */}
      <div className="absolute top-4 left-4 z-50 bg-white/90 backdrop-blur-md p-4 rounded-xl shadow-lg border border-slate-200 w-80 text-xs">
        <h3 className="font-bold mb-3 text-slate-800 text-sm">Real-time Tweaks</h3>
        
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <div className="flex justify-between"><span>Carousel Radius</span><span className="font-mono text-accent">{debugParams.carouselRadius}</span></div>
            <input type="range" min="100" max="600" step="10" value={debugParams.carouselRadius} onChange={(e) => setDebugParams(p => ({...p, carouselRadius: Number(e.target.value)}))} />
          </label>
          <label className="flex flex-col gap-1">
            <div className="flex justify-between"><span>Blob Scale</span><span className="font-mono text-accent">{debugParams.blobScale}</span></div>
            <input type="range" min="80" max="300" step="10" value={debugParams.blobScale} onChange={(e) => setDebugParams(p => ({...p, blobScale: Number(e.target.value)}))} />
          </label>
          <label className="flex flex-col gap-1">
            <div className="flex justify-between"><span>Rotation Speed</span><span className="font-mono text-accent">{debugParams.rotationSpeed}</span></div>
            <input type="range" min="0" max="0.3" step="0.01" value={debugParams.rotationSpeed} onChange={(e) => setDebugParams(p => ({...p, rotationSpeed: Number(e.target.value)}))} />
          </label>
          <label className="flex flex-col gap-1">
            <div className="flex justify-between"><span>Transmission (Glassy)</span><span className="font-mono text-accent">{debugParams.transmission}</span></div>
            <input type="range" min="0" max="1" step="0.05" value={debugParams.transmission} onChange={(e) => setDebugParams(p => ({...p, transmission: Number(e.target.value)}))} />
          </label>
          <label className="flex flex-col gap-1">
            <div className="flex justify-between"><span>Clearcoat (Shiny)</span><span className="font-mono text-accent">{debugParams.clearcoat}</span></div>
            <input type="range" min="0" max="1" step="0.05" value={debugParams.clearcoat} onChange={(e) => setDebugParams(p => ({...p, clearcoat: Number(e.target.value)}))} />
          </label>
          <label className="flex flex-col gap-1">
            <div className="flex justify-between"><span>Thickness</span><span className="font-mono text-accent">{debugParams.thickness}</span></div>
            <input type="range" min="0" max="10" step="0.5" value={debugParams.thickness} onChange={(e) => setDebugParams(p => ({...p, thickness: Number(e.target.value)}))} />
          </label>
        </div>
      </div>

      {/* Toggle Switch */}
      <div className="flex items-center bg-white p-1.5 rounded-full shadow-sm border border-slate-200 z-10">
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

      {/* The Unified 3D Space */}
      <div className="relative w-full max-w-[1400px] h-[650px] cursor-grab active:cursor-grabbing">
        {/* We use perspective camera for natural 3D depth. fov=45 gives a nice cinematic lens */}
        <Canvas camera={{ position: [0, debugParams.carouselRadius * 0.3, cameraZ], fov: 45 }}>
          <CameraUpdater radius={debugParams.carouselRadius} />
          {/* Subtle atmospheric fog to blend the distant carousel items into the background */}
          <fog attach="fog" args={['#f8fafc', fogStart, fogEnd]} />
          
          <Suspense fallback={null}>
            <CarouselScene 
              stats={stats} 
              mode={mode} 
              navigate={navigate} 
              carouselRadius={debugParams.carouselRadius}
              rotationSpeed={debugParams.rotationSpeed}
              blobScale={debugParams.blobScale}
            />
          </Suspense>
        </Canvas>
      </div>
    </div>
  );
}
