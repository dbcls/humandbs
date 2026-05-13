import React, { useEffect, useMemo, useRef, useState, Suspense } from "react";
import * as d3 from "d3";
import { Link, useNavigate } from "@tanstack/react-router";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Environment, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
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

const INITIAL_CAROUSEL_RADIUS = 560;
const INITIAL_CAROUSEL_ROTATION_SPEED = 0.05; // Radians per second
const BLOB_RESOLUTION = 45; // Optimized resolution for smooth rendering without hitting poly limits
const INITIAL_BLOB_SCALE = 210; // Scale of the [0,1] MarchingCubes grid in 3D units
const INITIAL_BLOB_ISOLATION = 80; // Controls metaball fusion. Higher = less fusion, more distinct particles.
const INITIAL_CAMERA_Y = 30;    // Vertical position of the camera
const INITIAL_CAMERA_Z = 880;  // Zoom distance of the camera (adjust based on your preference!)
const INITIAL_LIGHT_AMBIENT = 1.0;
const INITIAL_LIGHT_AMBIENT_COLOR = "#ffffff";
const INITIAL_LIGHT_DIRECTIONAL = 1.0;
const INITIAL_LIGHT_POINT_1 = 1.0;
const INITIAL_LIGHT_POINT_2 = 0.8;
const INITIAL_MATERIAL_TRANSMISSION = 0.4;
const INITIAL_MATERIAL_CLEARCOAT = 1.0;
const INITIAL_MATERIAL_THICKNESS = 2.5;

// Vibrant, highly saturated palettes so they don't wash out into white under strong lighting
const COLOR_PALETTES = [
  ["#ff006e", "#ffbe0b", "#fb5607", "#8338ec"], // Vibrant Sunset
  ["#3a0ca3", "#4361ee", "#4cc9f0", "#7209b7"], // Deep Neon
  ["#06d6a0", "#118ab2", "#073b4c", "#ef476f"], // Teal Pink
  ["#e5383b", "#ba1826", "#a4161a", "#660708"], // Crimson
  ["#2b9348", "#55a630", "#80b918", "#aacc00"], // Toxic Green
  ["#0077b6", "#0096c7", "#00b4d8", "#48cae4"], // Bright Ocean
  ["#f72585", "#b5179e", "#7209b7", "#560bad"], // Cyber Pink
  ["#ffd166", "#06d6a0", "#118ab2", "#ef476f"], // Pop Art
];

// Shared material for all blobs for maximum performance and unified lighting
const blobMaterial = new THREE.MeshPhysicalMaterial({
  roughness: 0.1,
  transmission: 0.4,
  thickness: 2.5,
  clearcoat: 1.0,
  clearcoatRoughness: 0.1,
  envMapIntensity: 0.8, // Reduced to prevent white blowout with Environment map
});

const blobGeometry = new THREE.SphereGeometry(1, 32, 32);

type SimNode = StatsSatellite & { 
  d3Radius: number;
  strength: number;
  currentStrength: number;
  color: THREE.Color;
  x?: number;
  y?: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
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
  blobScale,
  blobIsolation
}: {
  system: StatsSystem;
  mode: "research" | "dataset";
  isActive: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
  paletteIndex: number;
  onClick: (facet: string, value: string) => void;
  blobScale: number;
  blobIsolation: number;
}) {
  const nodesRef = useRef<SimNode[]>([]);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  
  // Use up to 50 largest satellites to show all items while keeping performance reasonable
  const satellites = useMemo(() => {
    return system.satellites.filter((s) => s[mode] > 0).slice(0, 50);
  }, [system, mode]);

  useEffect(() => {
    if (satellites.length === 0) return;

    const palette = COLOR_PALETTES[paletteIndex % COLOR_PALETTES.length]!;
    const extent = d3.extent(satellites, (d: StatsSatellite) => d[mode]) as [number, number];
    const maxVal = Math.max(1, extent[1] ?? 1);
    
    // Scale for physical collision
    const radiusScale = d3.scaleSqrt().domain([0, maxVal]).range([8, 25]);
    // Scale for visual size in MarchingCubes (strength). 
    // Increased strength slightly so separated particles don't become too small
    const strengthScale = d3.scaleSqrt().domain([0, maxVal]).range([0.15, 0.35]);

    nodesRef.current = satellites.map((sat, i) => {
      const existing = nodesRef.current.find((n) => n.id === sat.id);
      const d3Radius = radiusScale(sat[mode]);
      const strength = strengthScale(sat[mode]);
      return {
        ...sat,
        x: existing?.x ?? (Math.random() - 0.5) * 40,
        y: existing?.y ?? (Math.random() - 0.5) * 40,
        z: existing?.z ?? (Math.random() - 0.5) * 40,
        vx: existing?.vx ?? 0,
        vy: existing?.vy ?? 0,
        vz: existing?.vz ?? 0,
        d3Radius,
        strength,
        currentStrength: existing?.currentStrength ?? strength,
        color: existing?.color ?? new THREE.Color(palette[i % palette.length]),
      };
    });
  }, [satellites, mode, paletteIndex]);

  // Update the InstancedMesh every frame with a custom 3D Verlet physics engine
  useFrame((state, delta) => {
    const nodes = nodesRef.current;
    
    // Cap delta to prevent physics explosions on lag spikes
    const dt = Math.min(delta, 0.05);

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      // Pull to center - much weaker now to allow them to spread like a bunch of grapes
      const pull = isActive ? 0.03 : 0.1;
      node.vx = (node.vx || 0) + (0 - (node.x || 0)) * pull * dt;
      node.vy = (node.vy || 0) + (0 - (node.y || 0)) * pull * dt;
      node.vz = (node.vz || 0) + (0 - (node.z || 0)) * pull * dt;

      // Gentle organic wander
      node.vx += (Math.random() - 0.5) * 1.5;
      node.vy += (Math.random() - 0.5) * 1.5;
      node.vz += (Math.random() - 0.5) * 1.5;

      // 3D Collision Repulsion
      for (let j = i + 1; j < nodes.length; j++) {
        const other = nodes[j];
        const dx = (node.x || 0) - (other.x || 0);
        const dy = (node.y || 0) - (other.y || 0);
        const dz = (node.z || 0) - (other.z || 0);
        const distSq = dx*dx + dy*dy + dz*dz;
        const dist = Math.sqrt(distSq) + 0.001;
        const minDist = node.d3Radius + other.d3Radius + 2;

        if (dist < minDist) {
          // Stronger repulsion to keep them apart
          const force = (minDist - dist) * 15.0 * dt;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          const fz = (dz / dist) * force;
          node.vx += fx; node.vy += fy; node.vz += fz;
          other.vx = (other.vx || 0) - fx; 
          other.vy = (other.vy || 0) - fy; 
          other.vz = (other.vz || 0) - fz;
        }
      }
    }

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      // Friction
      node.vx = (node.vx || 0) * 0.85; 
      node.vy = (node.vy || 0) * 0.85; 
      node.vz = (node.vz || 0) * 0.85;
      
      // Velocity
      node.x = (node.x || 0) + node.vx * dt * 10;
      node.y = (node.y || 0) + node.vy * dt * 10;
      node.z = (node.z || 0) + node.vz * dt * 10;
      
      // Strength animation
      node.currentStrength += (node.strength - node.currentStrength) * 0.1;

      // Update InstancedMesh matrix and color
      // blobScale slider controls the overall size multiplier
      const scale = node.currentStrength * blobScale * 0.15;
      dummy.position.set(node.x, node.y, node.z);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      
      if (meshRef.current) {
        meshRef.current.setMatrixAt(i, dummy.matrix);
        meshRef.current.setColorAt(i, node.color);
      }
    }
    
    if (meshRef.current) {
      meshRef.current.count = nodes.length;
      meshRef.current.instanceMatrix.needsUpdate = true;
      if (meshRef.current.instanceColor) {
        meshRef.current.instanceColor.needsUpdate = true;
      }
    }
  });

  // Calculate center of mass for label
  const center = useMemo(() => {
    if (nodesRef.current.length === 0) return new THREE.Vector3();
    const x = d3.mean(nodesRef.current, (d) => d.x || 0) || 0;
    const y = d3.mean(nodesRef.current, (d) => d.y || 0) || 0;
    const z = d3.mean(nodesRef.current, (d) => d.z || 0) || 0;
    return new THREE.Vector3(x, y, z);
  }, [satellites, isActive]);

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
        <instancedMesh ref={meshRef} args={[blobGeometry, blobMaterial, 50]} castShadow receiveShadow />
      </group>
      
      {/* HTML Label perfectly attached to the 3D group */}
      <Html center position={[center.x, center.y - 12, center.z]} zIndexRange={[100, 0]}>
        <div 
          className={`flex flex-col items-center justify-center transition-all duration-700 pointer-events-none 
            ${isActive ? 'opacity-100 scale-110 drop-shadow-xl' : 'opacity-40 scale-90'}`}
          style={{ width: 'max-content' }}
        >
          <div className="bg-white/90 backdrop-blur-md px-4 py-2 rounded-full shadow-lg border border-white/20">
            <h3 className="font-bold text-slate-800 text-base tracking-widest uppercase">{system.facet.replace(/_/g, " ")}</h3>
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
  blobScale,
  blobIsolation,
  lightAmbient,
  lightAmbientColor,
  lightDirectional,
  lightPoint1,
  lightPoint2
}: { 
  stats: NormalizedStats, 
  mode: "dataset" | "research", 
  navigate: any,
  carouselRadius: number,
  rotationSpeed: number,
  blobScale: number,
  blobIsolation: number,
  lightAmbient: number,
  lightAmbientColor: string,
  lightDirectional: number,
  lightPoint1: number,
  lightPoint2: number
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
      {/* User controllable lighting */}
      <ambientLight intensity={lightAmbient} color={lightAmbientColor} />
      <directionalLight position={[10, 20, 15]} intensity={lightDirectional} color="#ffffff" castShadow />
      
      {/* Side lights to add colorful reflections to the glass */}
      <directionalLight position={[-20, -10, -20]} intensity={lightPoint1} color="#c6d8ff" />
      <directionalLight position={[20, -10, 20]} intensity={lightPoint2} color="#ffc8dd" />

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
                blobIsolation={blobIsolation}
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
function CameraUpdater({ cameraY, cameraZ, radius }: { cameraY: number, cameraZ: number, radius: number }) {
  const { camera, scene } = useThree();

  useEffect(() => {
    const fogStart = cameraZ - radius * 0.8;
    const fogEnd = cameraZ + radius * 1.5;

    camera.position.set(0, cameraY, cameraZ);
    (camera as THREE.PerspectiveCamera).far = 5000;
    camera.updateProjectionMatrix();

    if (scene.fog) {
      scene.fog.near = fogStart;
      scene.fog.far = fogEnd;
    }
  }, [cameraY, cameraZ, radius, camera, scene]);

  return null;
}

// --- Application Shell ---

export default function FrontStatsVisualizationNew() {
  const { loading, error, stats } = useStats();
  const [mode, setMode] = useState<"dataset" | "research">("dataset");
  const [isMounted, setIsMounted] = useState(false);
  
  // Real-time Debug Parameters with LocalStorage persistence
  const [debugParams, setDebugParams] = useState(() => {
    const defaults = {
      carouselRadius: INITIAL_CAROUSEL_RADIUS,
      blobScale: INITIAL_BLOB_SCALE,
      blobIsolation: INITIAL_BLOB_ISOLATION,
      rotationSpeed: INITIAL_CAROUSEL_ROTATION_SPEED,
      transmission: INITIAL_MATERIAL_TRANSMISSION,
      clearcoat: INITIAL_MATERIAL_CLEARCOAT,
      thickness: INITIAL_MATERIAL_THICKNESS,
      cameraY: INITIAL_CAMERA_Y,
      cameraZ: INITIAL_CAMERA_Z,
      lightAmbient: INITIAL_LIGHT_AMBIENT,
      lightAmbientColor: INITIAL_LIGHT_AMBIENT_COLOR,
      lightDirectional: INITIAL_LIGHT_DIRECTIONAL,
      lightPoint1: INITIAL_LIGHT_POINT_1,
      lightPoint2: INITIAL_LIGHT_POINT_2,
    };
    
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("blob_debug_params_v2");
      if (saved) {
        try {
          return { ...defaults, ...JSON.parse(saved) };
        } catch (e) {
          console.warn("Failed to parse debug params from localStorage", e);
        }
      }
    }
    return defaults;
  });

  // Save to localStorage whenever params change
  useEffect(() => {
    localStorage.setItem("blob_debug_params_v2", JSON.stringify(debugParams));
  }, [debugParams]);

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
          <label className="block space-y-1">
            <div className="flex justify-between"><span>Blob Scale</span><span className="font-mono text-accent">{debugParams.blobScale}</span></div>
            <input type="range" min="50" max="400" step="10" value={debugParams.blobScale} onChange={(e) => setDebugParams(p => ({...p, blobScale: Number(e.target.value)}))} />
          </label>
          <label className="block space-y-1">
            <div className="flex justify-between"><span>Blob Fusion (Isolation)</span><span className="font-mono text-accent">{debugParams.blobIsolation}</span></div>
            <input type="range" min="10" max="250" step="5" value={debugParams.blobIsolation} onChange={(e) => setDebugParams(p => ({...p, blobIsolation: Number(e.target.value)}))} />
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
          <label className="flex flex-col gap-1">
            <div className="flex justify-between"><span>Camera Y (Up/Down)</span><span className="font-mono text-accent">{debugParams.cameraY}</span></div>
            <input type="range" min="-300" max="500" step="10" value={debugParams.cameraY} onChange={(e) => setDebugParams(p => ({...p, cameraY: Number(e.target.value)}))} />
          </label>
          <label className="flex flex-col gap-1">
            <div className="flex justify-between"><span>Camera Z (Zoom)</span><span className="font-mono text-accent">{debugParams.cameraZ}</span></div>
            <input type="range" min="100" max="2000" step="10" value={debugParams.cameraZ} onChange={(e) => setDebugParams(p => ({...p, cameraZ: Number(e.target.value)}))} />
          </label>

          {/* Lighting Controls */}
          <div className="space-y-1 mt-4 border-t pt-2 border-slate-200">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <span className="whitespace-nowrap">Ambient Color</span>
              <input type="color" value={debugParams.lightAmbientColor} onChange={(e) => setDebugParams(p => ({...p, lightAmbientColor: e.target.value}))} className="w-8 h-6 p-0 border-0 cursor-pointer" />
            </div>
            <div className="flex justify-between items-center text-xs font-bold text-slate-700">
              <span>Ambient Light</span>
              <span className="text-pink-500">{debugParams.lightAmbient.toFixed(1)}</span>
            </div>
            <input type="range" min="0" max="3" step="0.1" value={debugParams.lightAmbient} onChange={(e) => setDebugParams(p => ({...p, lightAmbient: parseFloat(e.target.value)}))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
            
            <div className="flex justify-between items-center text-xs font-bold text-slate-700">
              <span>Directional Light</span>
              <span className="text-pink-500">{debugParams.lightDirectional.toFixed(1)}</span>
            </div>
            <input type="range" min="0" max="3" step="0.1" value={debugParams.lightDirectional} onChange={(e) => setDebugParams(p => ({...p, lightDirectional: parseFloat(e.target.value)}))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
            
            <div className="flex justify-between items-center text-xs font-bold text-slate-700">
              <span>Point Light (Blue)</span>
              <span className="text-pink-500">{debugParams.lightPoint1.toFixed(1)}</span>
            </div>
            <input type="range" min="0" max="3" step="0.1" value={debugParams.lightPoint1} onChange={(e) => setDebugParams(p => ({...p, lightPoint1: parseFloat(e.target.value)}))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
            
            <div className="flex justify-between items-center text-xs font-bold text-slate-700">
              <span>Point Light (Pink)</span>
              <span className="text-pink-500">{debugParams.lightPoint2.toFixed(1)}</span>
            </div>
            <input type="range" min="0" max="3" step="0.1" value={debugParams.lightPoint2} onChange={(e) => setDebugParams(p => ({...p, lightPoint2: parseFloat(e.target.value)}))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
          </div>

          <button 
            className="mt-2 bg-slate-200 hover:bg-slate-300 text-slate-700 py-1 rounded font-bold transition-colors"
            onClick={() => {
              localStorage.removeItem("blob_debug_params_v2");
              setDebugParams({
                carouselRadius: INITIAL_CAROUSEL_RADIUS,
                blobScale: INITIAL_BLOB_SCALE,
                blobIsolation: INITIAL_BLOB_ISOLATION,
                rotationSpeed: INITIAL_CAROUSEL_ROTATION_SPEED,
                transmission: INITIAL_MATERIAL_TRANSMISSION,
                clearcoat: INITIAL_MATERIAL_CLEARCOAT,
                thickness: INITIAL_MATERIAL_THICKNESS,
                cameraY: INITIAL_CAMERA_Y,
                cameraZ: INITIAL_CAMERA_Z,
                lightAmbient: INITIAL_LIGHT_AMBIENT,
                lightAmbientColor: INITIAL_LIGHT_AMBIENT_COLOR,
                lightDirectional: INITIAL_LIGHT_DIRECTIONAL,
                lightPoint1: INITIAL_LIGHT_POINT_1,
                lightPoint2: INITIAL_LIGHT_POINT_2,
              });
            }}
          >
            Reset Defaults
          </button>
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
        <Canvas camera={{ position: [0, debugParams.cameraY, debugParams.cameraZ], fov: 45, far: 5000 }}>
          <CameraUpdater cameraY={debugParams.cameraY} cameraZ={debugParams.cameraZ} radius={debugParams.carouselRadius} />
          {/* Environment map is CRITICAL for glass materials to look realistic and not blow out into white */}
          <Environment preset="city" />
          {/* Subtle atmospheric fog to blend the distant carousel items into the background */}
          <fog attach="fog" args={['#f8fafc', debugParams.cameraZ - debugParams.carouselRadius * 0.8, debugParams.cameraZ + debugParams.carouselRadius * 1.5]} />
          
          <Suspense fallback={null}>
            <CarouselScene 
              stats={stats} 
              mode={mode} 
              navigate={navigate} 
              carouselRadius={debugParams.carouselRadius}
              rotationSpeed={debugParams.rotationSpeed}
              blobScale={debugParams.blobScale}
              blobIsolation={debugParams.blobIsolation}
              lightAmbient={debugParams.lightAmbient}
              lightAmbientColor={debugParams.lightAmbientColor}
              lightDirectional={debugParams.lightDirectional}
              lightPoint1={debugParams.lightPoint1}
              lightPoint2={debugParams.lightPoint2}
            />
          </Suspense>
        </Canvas>
      </div>
    </div>
  );
}
