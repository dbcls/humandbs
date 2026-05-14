import React, { useEffect, useMemo, useRef, useState, Suspense } from "react";
import * as d3 from "d3";
import { Link, useNavigate } from "@tanstack/react-router";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Environment, ContactShadows, Text, Billboard } from "@react-three/drei";
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
    systems: systems,
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

const INITIAL_CAROUSEL_RADIUS = 1500;
const INITIAL_PARTICLE_SCALE = 400; // Global multiplier for physical marble size
const INITIAL_CAROUSEL_ROTATION_SPEED = 0.02; // Radians per second
const INITIAL_CAMERA_Y = 500;    // Vertical position of the camera
const INITIAL_CAMERA_Z = 2000;  // Zoom distance of the camera (adjust based on your preference!)
const INITIAL_SCENE_OFFSET_Y = 90; // Vertical offset to prevent cutoff at the bottom
const INITIAL_MATERIAL_ROUGHNESS = 0.8; // High roughness for a matte look
const INITIAL_LIGHT_AMBIENT = 3.0;
const INITIAL_LIGHT_AMBIENT_COLOR = "#6ee0e2";
const INITIAL_LIGHT_DIRECTIONAL = 0.0;
const INITIAL_LIGHT_POINT_1 = 3.0;
const INITIAL_LIGHT_POINT_2 = 3.0;

// Macromolecule OKLCH Color Parameters
const MACRO_COLOR_CHROMA = 0.16; // Constant C (Vividness)
const MACRO_COLOR_L_NEUTRAL = 0.98; // High L (Neutral/Off-white base)
const MACRO_COLOR_L_VIVID = 0.5;   // Low L (Vivid point)
const MACRO_VIVID_PROBABILITY = 0.1; // 20% chance for a particle to be a vivid point

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function oklchToThreeColor(l: number, c: number, h: number): THREE.Color {
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

function capitalize(str: string) {
  if (!str) return "";
  const s = str.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// Removed global blobMaterial. Using inline material per cluster.

type SimNode = StatsSatellite & { 
  d3Radius: number;
  color: THREE.Color;
  x?: number;
  y?: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  targetX: number;
  targetY: number;
  targetZ: number;
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
  particleScale,
  globalMaxCount,
  debugParams,
  onHover
}: {
  system: StatsSystem;
  mode: "research" | "dataset";
  isActive: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
  paletteIndex: number;
  onClick: (facet: string, value: string) => void;
  particleScale: number;
  globalMaxCount: number;
  debugParams: any;
  onHover: (state: boolean) => void;
}) {
  const nodesRef = useRef<SimNode[]>([]);
  const instancedMeshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const [isHovered, setIsHovered] = useState(false);
  const labelRefs = useRef<(THREE.Group | null)[]>([]);
  
  const satellites = useMemo(() => {
    return system.satellites.filter((s) => s[mode] > 0);
  }, [system, mode]);

  useEffect(() => {
    if (satellites.length === 0) return;

    // We use cube root so that the VOLUME of the 3D sphere is STRICTLY proportional to the count.
    // To maintain strict proportionality, the range must start at 0.
    const radiusScale = d3.scalePow().exponent(1/3).domain([0, globalMaxCount]).range([0, 50]);
    
    // Pre-calculate target grid positions for when the facet is focused
    const sorted = [...satellites].sort((a, b) => b[mode] - a[mode]);
    const columns = Math.ceil(Math.sqrt(sorted.length));
    const spacing = 18 * (particleScale / 260); // Base spacing scaled by user setting

    nodesRef.current = satellites.map((sat, i) => {
      const existing = nodesRef.current.find((n) => n.id === sat.id);
      // Math.max ensures that even count=1 items are at least barely visible (0.8 radius)
      const d3Radius = Math.max(0.8, radiusScale(sat[mode]));
      
      // Macromolecule coloring logic (OKLCH)
      const hash = hashString(sat.value || sat.facet);
      const hue = hash % 360;
      const isVivid = (hash % 100) < (MACRO_VIVID_PROBABILITY * 100);
      const lightness = isVivid ? MACRO_COLOR_L_VIVID : MACRO_COLOR_L_NEUTRAL;
      const color = oklchToThreeColor(lightness, MACRO_COLOR_CHROMA, hue);

      // Grid position assignment
      const orderIdx = sorted.findIndex(s => s.id === sat.id);
      const row = Math.floor(orderIdx / columns);
      const col = orderIdx % columns;
      const targetX = (col - (columns - 1) / 2) * spacing;
      const targetY = -(row - Math.floor(sorted.length / columns) / 2) * spacing + 40;
      const targetZ = 0;

      return {
        ...sat,
        x: existing?.x ?? (Math.random() - 0.5) * 40,
        y: existing?.y ?? (Math.random() - 0.5) * 40,
        z: existing?.z ?? (Math.random() - 0.5) * 40,
        vx: existing?.vx ?? 0,
        vy: existing?.vy ?? 0,
        vz: existing?.vz ?? 0,
        d3Radius,
        color, // Assign newly calculated color based on hash
        targetX,
        targetY,
        targetZ,
      };
    });
  // Added paletteIndex back to dependency array to fix React Fast Refresh size error during HMR
  }, [satellites, mode, paletteIndex, globalMaxCount]);

  // Update the InstancedMesh every frame with a custom 3D Verlet physics engine
  useFrame((state, delta) => {
    const nodes = nodesRef.current;
    
    // Cap delta to prevent physics explosions on lag spikes
    const dt = Math.min(delta, 0.05);

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      
      if (isHovered) {
        // Smoothly lerp to ordered grid positions
        node.x = THREE.MathUtils.lerp(node.x || 0, node.targetX, 0.1);
        node.y = THREE.MathUtils.lerp(node.y || 0, node.targetY, 0.1);
        node.z = THREE.MathUtils.lerp(node.z || 0, node.targetZ, 0.1);
        node.vx = 0; node.vy = 0; node.vz = 0;
        continue; // Skip collision and velocity for hovered items
      }

      // Pull to center - much weaker now to allow them to spread like a bunch of grapes
      const pull = isActive ? 0.03 : 0.1;
      node.vx = (node.vx || 0) + (0 - (node.x || 0)) * pull * dt;
      node.vy = (node.vy || 0) + (0 - (node.y || 0)) * pull * dt;
      node.vz = (node.vz || 0) + (0 - (node.z || 0)) * pull * dt;

      // Gentle organic wander
      node.vx += (Math.random() - 0.5) * 1.5;
      node.vy += (Math.random() - 0.5) * 1.5;
      node.vz += (Math.random() - 0.5) * 1.5;

      // 3D Collision Repulsion (Rigid Marble Physics)
      const visualRadius = node.d3Radius * (particleScale / 260);
      for (let j = i + 1; j < nodes.length; j++) {
        const other = nodes[j];
        const dx = (node.x || 0) - (other.x || 0);
        const dy = (node.y || 0) - (other.y || 0);
        const dz = (node.z || 0) - (other.z || 0);
        const distSq = dx*dx + dy*dy + dz*dz;
        const dist = Math.sqrt(distSq) + 0.001;
        const otherRadius = other.d3Radius * (particleScale / 260);
        const minDist = visualRadius + otherRadius + 1.0; // 1.0 padding to prevent visual intersection

        if (dist < minDist) {
          // Solid repulsion to keep them perfectly apart like marbles
          const force = (minDist - dist) * 25.0 * dt;
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
      if (!isHovered) {
        // Friction
        node.vx = (node.vx || 0) * 0.85; 
        node.vy = (node.vy || 0) * 0.85; 
        node.vz = (node.vz || 0) * 0.85;
        
        // Velocity
        node.x = (node.x || 0) + node.vx * dt * 10;
        node.y = (node.y || 0) + node.vy * dt * 10;
        node.z = (node.z || 0) + node.vz * dt * 10;

        // Hard boundary
        const bound = particleScale * 0.42;
        if (node.x > bound) { node.x = bound; node.vx *= -0.5; }
        if (node.x < -bound) { node.x = -bound; node.vx *= -0.5; }
        if (node.y > bound) { node.y = bound; node.vy *= -0.5; }
        if (node.y < -bound) { node.y = -bound; node.vy *= -0.5; }
        if (node.z > bound) { node.z = bound; node.vz *= -0.5; }
        if (node.z < -bound) { node.z = -bound; node.vz *= -0.5; }
      }
    }

    if (instancedMeshRef.current) {
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const visualRadius = node.d3Radius * (particleScale / 260);
        
        dummy.position.set(node.x || 0, node.y || 0, node.z || 0);
        dummy.scale.set(visualRadius, visualRadius, visualRadius);
        dummy.updateMatrix();
        
        instancedMeshRef.current.setMatrixAt(i, dummy.matrix);
        instancedMeshRef.current.setColorAt(i, node.color);
        
        // Update label position dynamically to track physics/lerp
        if (isHovered && labelRefs.current[i]) {
          labelRefs.current[i]!.position.set(node.x || 0, (node.y || 0) - visualRadius - 3, node.z || 0);
        }
      }
      instancedMeshRef.current.instanceMatrix.needsUpdate = true;
      if (instancedMeshRef.current.instanceColor) instancedMeshRef.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group position={position} rotation={rotation}>
      <group 
        onPointerEnter={() => { setIsHovered(true); onHover(true); document.body.style.cursor = 'pointer'; }}
        onPointerLeave={() => { setIsHovered(false); onHover(false); document.body.style.cursor = 'auto'; }}
        onClick={(e) => { 
          e.stopPropagation(); 
          if (satellites.length > 0) {
            onClick(system.facet, satellites[0].value); 
          }
        }}
      >
        <instancedMesh
          ref={instancedMeshRef}
          args={[undefined, undefined, satellites.length]}
          castShadow
          receiveShadow
        >
          <sphereGeometry args={[1, 32, 32]} />
          <meshStandardMaterial 
            color="#ffffff" 
            roughness={debugParams?.roughness ?? INITIAL_MATERIAL_ROUGHNESS}
            metalness={0.0}
            envMapIntensity={0.2}
          />
        </instancedMesh>

        {/* Render individual clickable 3D text labels for particles when focused */}
        {isHovered && satellites.map((sat, i) => (
          <group key={sat.id} ref={el => labelRefs.current[i] = el}>
            <Billboard follow={true} lockX={false} lockY={false} lockZ={false}>
              <Text
                fontSize={4}
                color="#334155"
                anchorX="center"
                anchorY="top"
                onClick={(e) => { e.stopPropagation(); onClick(system.facet, sat.value); }}
                onPointerEnter={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
                onPointerLeave={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
              >
                {`${capitalize(sat.value)} (${sat[mode]})`}
              </Text>
            </Billboard>
          </group>
        ))}
      </group>
      
      {/* Canvas-native 3D Text Label to prevent HTML occlusion issues */}
      <Billboard position={[0, -(particleScale * 0.45) - 10, 0]} follow={true}>
        <Text 
          fontSize={16} 
          color={isActive ? "#1e293b" : "#94a3b8"} 
          anchorX="center" 
          anchorY="middle"
        >
          {capitalize(system.facet)}
        </Text>
      </Billboard>
      <Billboard position={[0, -(particleScale * 0.45) - 28, 0]} follow={true}>
        <Text 
          fontSize={8} 
          color={isActive ? "#64748b" : "#cbd5e1"} 
          anchorX="center" 
          anchorY="middle"
        >
          {`${d3.sum(satellites, (d: StatsSatellite) => d[mode]).toLocaleString()} items`}
        </Text>
      </Billboard>
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
  particleScale,
  lightAmbient,
  lightAmbientColor,
  lightDirectional,
  lightPoint1,
  lightPoint2,
  globalMaxCount,
  debugParams
}: { 
  stats: NormalizedStats, 
  mode: "dataset" | "research", 
  navigate: any,
  carouselRadius: number,
  rotationSpeed: number,
  particleScale: number,
  lightAmbient: number,
  lightAmbientColor: string,
  lightDirectional: number,
  lightPoint1: number,
  lightPoint2: number,
  globalMaxCount: number,
  debugParams: any
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const total = stats.systems.length;

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    if (hoveredIndex === null) {
      // Auto-rotation logic
      groupRef.current.rotation.y += rotationSpeed * delta;
    }
    // If hoveredIndex !== null, we simply pause rotation so the user can interact.

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
      <directionalLight position={[-20, -10, -20]} intensity={lightPoint1} color="#00f0ff" />
      <directionalLight position={[20, -10, 20]} intensity={lightPoint2} color="#ff00a0" />

      {/* A soft shadow plane underneath the carousel gives a premium grounded feel */}
      <ContactShadows position={[0, -150, 0]} opacity={0.4} scale={4000} blur={2.5} far={600} resolution={512} />

      {/* Group tilted down slightly for a "carousel" projector view */}
      <group rotation={[-0.2, 0, 0]} position={[0, debugParams?.sceneOffsetY ?? INITIAL_SCENE_OFFSET_Y, 0]}>
        <group ref={groupRef}>
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
                rotation={[0, angle, 0]}
                onClick={handleFacetClick}
                particleScale={particleScale}
                globalMaxCount={globalMaxCount}
                debugParams={debugParams}
                onHover={(isHovered) => setHoveredIndex(isHovered ? i : null)}
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
      particleScale: INITIAL_PARTICLE_SCALE,
      rotationSpeed: INITIAL_CAROUSEL_ROTATION_SPEED,
      sceneOffsetY: INITIAL_SCENE_OFFSET_Y,
      roughness: INITIAL_MATERIAL_ROUGHNESS,
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

  if (!isMounted || loading) {
    return (
      <div className="w-full h-[540px] flex items-center justify-center mt-8">
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

  // Calculate global max count across all systems to ensure volume scaling is consistent everywhere
  let globalMaxCount = 1;
  stats.systems.forEach(sys => {
    sys.satellites.forEach(s => {
      if (s[mode] > globalMaxCount) globalMaxCount = s[mode];
    });
  });

  return (
    <div className="w-full h-[640px] rounded-3xl mt-8 overflow-hidden bg-slate-50 shadow-inner relative flex justify-center">
      
      {/* --- LIVE DEBUG PANEL (Development Only) --- */}
      <div className="absolute top-4 left-4 z-[9999] bg-white/90 backdrop-blur-md p-4 rounded-xl shadow-lg border border-slate-200 w-80 text-xs overflow-y-auto max-h-[calc(100%-2rem)]">
        <h3 className="font-bold mb-3 text-slate-800 text-sm">Real-time Tweaks</h3>
        
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <div className="flex justify-between"><span>Carousel Radius</span><span className="font-mono text-accent">{debugParams.carouselRadius}</span></div>
            <input type="range" min="100" max="3000" step="10" value={debugParams.carouselRadius} onChange={(e) => setDebugParams(p => ({...p, carouselRadius: Number(e.target.value)}))} />
          </label>
          <label className="block space-y-1">
            <div className="flex justify-between"><span>Particle Scale</span><span className="font-mono text-accent">{debugParams.particleScale}</span></div>
            <input type="range" min="50" max="400" step="10" value={debugParams.particleScale} onChange={(e) => setDebugParams(p => ({...p, particleScale: Number(e.target.value)}))} />
          </label>
          <label className="flex flex-col gap-1">
            <div className="flex justify-between"><span>Rotation Speed</span><span className="font-mono text-accent">{debugParams.rotationSpeed}</span></div>
            <input type="range" min="0" max="0.3" step="0.01" value={debugParams.rotationSpeed} onChange={(e) => setDebugParams(p => ({...p, rotationSpeed: Number(e.target.value)}))} />
          </label>
          <label className="flex flex-col gap-1">
            <div className="flex justify-between"><span>Scene Offset Y</span><span className="font-mono text-accent">{debugParams.sceneOffsetY}</span></div>
            <input type="range" min="-500" max="500" step="10" value={debugParams.sceneOffsetY} onChange={(e) => setDebugParams(p => ({...p, sceneOffsetY: Number(e.target.value)}))} />
          </label>
          <label className="flex flex-col gap-1">
            <div className="flex justify-between"><span>Material Roughness</span><span className="font-mono text-accent">{debugParams.roughness}</span></div>
            <input type="range" min="0" max="1" step="0.05" value={debugParams.roughness} onChange={(e) => setDebugParams(p => ({...p, roughness: Number(e.target.value)}))} />
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
                particleScale: INITIAL_PARTICLE_SCALE,
                rotationSpeed: INITIAL_CAROUSEL_ROTATION_SPEED,
                sceneOffsetY: INITIAL_SCENE_OFFSET_Y,
                roughness: INITIAL_MATERIAL_ROUGHNESS,
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
      <div className="absolute top-6 z-10 flex items-center bg-white/90 backdrop-blur-sm p-1.5 rounded-full shadow-sm border border-slate-200">
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
      <div className="absolute inset-0 cursor-grab active:cursor-grabbing">
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
              particleScale={debugParams.particleScale}
              lightAmbient={debugParams.lightAmbient}
              lightAmbientColor={debugParams.lightAmbientColor}
              lightDirectional={debugParams.lightDirectional}
              lightPoint1={debugParams.lightPoint1}
              lightPoint2={debugParams.lightPoint2}
              globalMaxCount={globalMaxCount}
              debugParams={debugParams}
            />
          </Suspense>
        </Canvas>
      </div>
    </div>
  );
}

