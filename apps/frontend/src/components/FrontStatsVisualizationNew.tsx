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
const INITIAL_SCENE_OFFSET_Y = 50; // Vertical offset to prevent cutoff at the bottom
const INITIAL_MATERIAL_ROUGHNESS = 0.8; // High roughness for a matte look
const INITIAL_LIGHT_AMBIENT = 3.0;
const INITIAL_LIGHT_AMBIENT_COLOR = "#6ee0e2";
const INITIAL_LIGHT_DIRECTIONAL = 1.0;
const INITIAL_LIGHT_POINT_1 = 3.0;
const INITIAL_LIGHT_POINT_2 = 3.0;
const INITIAL_PHYSICS_FORCE = 0.1;
const INITIAL_FOG_NEAR = 650;
const INITIAL_FOG_FAR = 5000;

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
  baseColor: THREE.Color;
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
  onNavigate,
  particleScale,
  globalMaxCount,
  debugParams,
  isHovered,
  onHover,
  isAnyHovered,
  isDragging
}: {
  system: StatsSystem;
  mode: "research" | "dataset";
  isActive: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
  paletteIndex: number;
  onNavigate: (facet: string, value: string) => void;
  particleScale: number;
  globalMaxCount: number;
  debugParams: any;
  isHovered: boolean;
  onHover: (state: boolean) => void;
  isAnyHovered: boolean;
  isDragging: boolean;
}) {
  const nodesRef = useRef<SimNode[]>([]);
  const instancedMeshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const [hoveredParticleIndex, setHoveredParticleIndex] = useState<number | null>(null);
  const labelRefs = useRef<(THREE.Group | null)[]>([]);
  const gridDims = useRef({ width: 100, height: 100 });
  
  const satellites = useMemo(() => {
    return system.satellites.filter((s) => s[mode] > 0);
  }, [system, mode]);

  useEffect(() => {
    if (satellites.length === 0) return;

    const radiusScale = d3.scalePow().exponent(1/3).domain([0, globalMaxCount]).range([0, 50]);
    
    const sorted = [...satellites].sort((a, b) => b[mode] - a[mode]);
    
    const layoutItems = sorted.map(sat => {
      const d3Radius = Math.max(0.8, radiusScale(sat[mode]));
      const visualRadius = d3Radius * (particleScale / 260);
      return { sat, d3Radius, visualRadius };
    });

    const rows: (typeof layoutItems[0])[][] = [[]];
    let currentRowWidth = 0;
    const padding = particleScale * 0.05;
    
    // Calculate total required area treating each particle + padding as a square bounding box
    const totalArea = layoutItems.reduce((sum, item) => sum + Math.pow(item.visualRadius * 2 + padding, 2), 0);
    // Use natural 16:9 aspect ratio width. If very few items, lay them out in a single row.
    const maxRowWidth = layoutItems.length <= 10 ? 9999 : Math.sqrt(totalArea * 1.77) * 1.1;

    for (const item of layoutItems) {
      const diam = item.visualRadius * 2;
      if (currentRowWidth + diam + padding > maxRowWidth && rows[rows.length - 1].length > 0) {
        rows.push([]);
        currentRowWidth = 0;
      }
      rows[rows.length - 1].push(item);
      currentRowWidth += diam + padding;
    }

    const layoutResults = new Map<string, {x: number, y: number, d3Radius: number}>();
    let yCursor = 0;
    let actualWidth = 0;
    for (const row of rows) {
      const rowHeight = Math.max(...row.map(i => i.visualRadius * 2));
      const rowWidth = row.reduce((sum, item) => sum + item.visualRadius * 2 + padding, 0) - padding;
      actualWidth = Math.max(actualWidth, rowWidth);
      
      let xCursor = -rowWidth / 2;
      const rowY = yCursor - rowHeight / 2;
      
      for (const item of row) {
        xCursor += item.visualRadius;
        layoutResults.set(item.sat.id, { x: xCursor, y: rowY, d3Radius: item.d3Radius });
        xCursor += item.visualRadius + padding;
      }
      yCursor -= rowHeight + padding;
    }
    
    const totalHeight = -yCursor - padding;
    const yOffset = totalHeight / 2;
    
    gridDims.current = { width: actualWidth, height: totalHeight };

    nodesRef.current = satellites.map((sat) => {
      const existing = nodesRef.current.find((n) => n.id === sat.id);
      const layout = layoutResults.get(sat.id)!;
      const { x: targetX, y: layoutY, d3Radius } = layout;
      // Perfectly center vertically. Camera will handle framing.
      const targetY = layoutY + yOffset; 
      const targetZ = 0; 
      
      const hash = hashString(sat.value || sat.facet);
      const hue = hash % 360;
      const isVivid = (hash % 100) < (MACRO_VIVID_PROBABILITY * 100);
      const lightness = isVivid ? MACRO_COLOR_L_VIVID : MACRO_COLOR_L_NEUTRAL;
      const baseColor = oklchToThreeColor(lightness, MACRO_COLOR_CHROMA, hue);

      return {
        ...sat,
        x: existing?.x ?? (Math.random() - 0.5) * 40,
        y: existing?.y ?? (Math.random() - 0.5) * 40,
        z: existing?.z ?? (Math.random() - 0.5) * 40,
        vx: existing?.vx ?? 0,
        vy: existing?.vy ?? 0,
        vz: existing?.vz ?? 0,
        d3Radius,
        color: baseColor,
        baseColor,
        targetX,
        targetY,
        targetZ,
      };
    });
  }, [satellites, mode, paletteIndex, globalMaxCount]);

  const localGroupRef = useRef<THREE.Group>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  const handlePointerEnter = (e: any) => {
    if (isDragging) return;
    e.stopPropagation();
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    onHover(true);
    document.body.style.cursor = 'pointer';
  };

  const handlePointerLeave = (e: any) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      onHover(false);
      document.body.style.cursor = 'auto';
    }, 200); // 200ms delay to prevent instant drop
  };

  // Force collapse if user starts dragging
  useEffect(() => {
    if (isDragging && isHovered) {
      onHover(false);
    }
  }, [isDragging, isHovered, onHover]);

  // Calculate dynamic target scale based on grid size
  const maxDim = Math.max(gridDims.current.width, gridDims.current.height * 1.77);
  // Target a visible size of ~1600 units, capped at 8x scale so single items aren't huge
  const targetScale = isHovered ? Math.min(8.0, 1600 / (maxDim || 1)) : 1.0;

  useFrame((state, delta) => {
    const time = state.clock.elapsedTime;
    if (localGroupRef.current) {
      // Unfocused clusters retreat down and away so they disappear cleanly
      const pushBackZ = (isAnyHovered && !isHovered) ? -1500 : 0;
      const pushDownY = (isAnyHovered && !isHovered) ? -2000 : 0;
      localGroupRef.current.position.z = THREE.MathUtils.lerp(localGroupRef.current.position.z, pushBackZ, 0.08);
      localGroupRef.current.position.y = THREE.MathUtils.lerp(localGroupRef.current.position.y, pushDownY, 0.08);
      
      localGroupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.08);
    }

    const nodes = nodesRef.current;
    const dt = Math.min(delta, 0.05);

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      
      if (isHovered) {
        let currentTargetZ = node.targetZ;
        if (hoveredParticleIndex !== null && hoveredParticleIndex !== i) {
          currentTargetZ -= 300; // Relative Z pushback
        }

        node.x = THREE.MathUtils.lerp(node.x || 0, node.targetX, 0.1);
        node.y = THREE.MathUtils.lerp(node.y || 0, node.targetY, 0.1);
        node.z = THREE.MathUtils.lerp(node.z || 0, currentTargetZ, 0.1);
        node.vx = 0; node.vy = 0; node.vz = 0;
        continue;
      }

      const pull = isActive ? (debugParams?.physicsForce ?? 0.1) : (debugParams?.physicsForce ?? 0.1) * 3;
      node.vx = (node.vx || 0) + (0 - (node.x || 0)) * pull * dt;
      node.vy = (node.vy || 0) + (0 - (node.y || 0)) * pull * dt;
      node.vz = (node.vz || 0) + (0 - (node.z || 0)) * pull * dt;

      // Organic "protein-like" fluid drift instead of pure jitter
      const offset = i * 0.13;
      node.vx += Math.sin(time * 1.2 + offset) * 0.4 + (Math.random() - 0.5) * 0.5;
      node.vy += Math.cos(time * 1.1 + offset * 2.1) * 0.4 + (Math.random() - 0.5) * 0.5;
      node.vz += Math.sin(time * 1.3 + offset * 3.2) * 0.4 + (Math.random() - 0.5) * 0.5;

      const visualRadius = node.d3Radius * (particleScale / 260);
      for (let j = i + 1; j < nodes.length; j++) {
        const other = nodes[j];
        const dx = (node.x || 0) - (other.x || 0);
        const dy = (node.y || 0) - (other.y || 0);
        const dz = (node.z || 0) - (other.z || 0);
        const distSq = dx*dx + dy*dy + dz*dz;
        const dist = Math.sqrt(distSq) + 0.001;
        const otherRadius = other.d3Radius * (particleScale / 260);
        const minDist = visualRadius + otherRadius + 1.0;

        if (dist < minDist) {
          const force = (minDist - dist) * 25.0 * dt;
          // Add Z-scattering to prevent them from getting permanently flattened after layout
          const adjustedDz = Math.abs(dz) < 1.0 ? (Math.random() - 0.5) * 5.0 : dz;
          const adjDist = Math.sqrt(dx*dx + dy*dy + adjustedDz*adjustedDz) + 0.001;
          const fx = (dx / adjDist) * force;
          const fy = (dy / adjDist) * force;
          const fz = (adjustedDz / adjDist) * force;
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
        node.vx = (node.vx || 0) * 0.85; 
        node.vy = (node.vy || 0) * 0.85; 
        node.vz = (node.vz || 0) * 0.85;
        node.x = (node.x || 0) + node.vx * dt * 10;
        node.y = (node.y || 0) + node.vy * dt * 10;
        node.z = (node.z || 0) + node.vz * dt * 10;

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
        
        if (hoveredParticleIndex !== null && hoveredParticleIndex !== i) {
          node.color.copy(node.baseColor).lerp(new THREE.Color("#f8fafc"), 0.85);
        } else {
          node.color.copy(node.baseColor);
        }
        
        instancedMeshRef.current.setMatrixAt(i, dummy.matrix);
        instancedMeshRef.current.setColorAt(i, node.color);
        
        if (isHovered && labelRefs.current[i]) {
          const currentScale = localGroupRef.current?.scale.x ?? 1.0;
          labelRefs.current[i]!.position.set(
            (node.x || 0) * currentScale, 
            ((node.y || 0) - visualRadius) * currentScale - 8, 
            (node.z || 0) * currentScale
          );
        }
      }
      instancedMeshRef.current.instanceMatrix.needsUpdate = true;
      if (instancedMeshRef.current.instanceColor) instancedMeshRef.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group 
      position={position} 
      rotation={rotation}
      onPointerEnter={isAnyHovered && !isHovered ? undefined : handlePointerEnter}
      onPointerLeave={isAnyHovered && !isHovered ? undefined : handlePointerLeave}
    >
      
      {/* Hit box OUTSIDE of localGroupRef so it doesn't shrink during layout scaling.
          This prevents the object from slipping out from under the mouse. */}
      <mesh 
        position={[0, 0, 50]} 
        visible={!(isAnyHovered && !isHovered)}
        onClick={(e) => { 
          e.stopPropagation(); 
          if (isDragging) return;
          if (satellites.length > 0) {
            onNavigate(system.facet, satellites[0].value); 
          }
        }}
      >
        {isHovered ? (
          <planeGeometry args={[Math.max(300, gridDims.current.width * targetScale * 1.8), Math.max(300, gridDims.current.height * targetScale * 1.8)]} />
        ) : (
          <sphereGeometry args={[particleScale * 0.45, 16, 16]} />
        )}
        <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      <group ref={localGroupRef}>
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
      </group>

      {/* Labels OUTSIDE localGroupRef to keep font size perfectly constant regardless of dynamic scaling */}
      {isHovered && satellites.map((sat, i) => {
        // We render all labels, removed the 50 item cutoff limit as requested!
        return (
        <group key={sat.id} ref={el => labelRefs.current[i] = el}>
          <Billboard follow={true} lockX={false} lockY={false} lockZ={false}>
            <Text
              fontSize={debugParams?.particleLabelFontSize ?? 12}
              color="#334155"
              anchorX="center"
              anchorY="top"
              onClick={(e) => { 
                e.stopPropagation(); 
                if (!isDragging) onNavigate(system.facet, sat.value); 
              }}
            >
              {`${capitalize(sat.value)} (${sat[mode]})`}
            </Text>
          </Billboard>
        </group>
      )})}
        
      {!isHovered && (
        <>
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
        </>
      )}
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
  debugParams,
  setParentHoveredIndex
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
  debugParams: any,
  setParentHoveredIndex: (idx: number | null) => void
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragRotStart, setDragRotStart] = useState(0);

  const total = stats.systems.length;

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    if (hoveredIndex === null && !isDragging) {
      groupRef.current.rotation.y += rotationSpeed * delta;
    } else if (hoveredIndex !== null && !isDragging) {
      const targetRot = - (hoveredIndex * (Math.PI * 2) / total);
      let diff = targetRot - groupRef.current.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff)); 
      groupRef.current.rotation.y += diff * 0.08;
    }

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

  const handlePointerDown = (e: any) => {
    e.stopPropagation();
    setIsDragging(true);
    setDragStartX(e.clientX);
    if (groupRef.current) setDragRotStart(groupRef.current.rotation.y);
    if (e.target.setPointerCapture) e.target.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: any) => {
    if (isDragging && groupRef.current) {
      e.stopPropagation();
      const dx = e.clientX - dragStartX;
      groupRef.current.rotation.y = dragRotStart + dx * 0.005;
    }
  };

  const handlePointerUp = (e: any) => {
    setIsDragging(false);
    if (e.target.releasePointerCapture) e.target.releasePointerCapture(e.pointerId);
  };

  return (
    <>
      <fog attach="fog" args={['#f8fafc', debugParams?.fogNear ?? 500, (hoveredIndex !== null ? 6000 : (debugParams?.fogFar ?? 3000))]} />
      <ambientLight intensity={lightAmbient} color={lightAmbientColor} />
      <directionalLight position={[10, 20, 15]} intensity={lightDirectional} color="#ffffff" castShadow />
      <directionalLight position={[-20, -10, -20]} intensity={lightPoint1} color="#00f0ff" />
      <directionalLight position={[20, -10, 20]} intensity={lightPoint2} color="#ff00a0" />

      <mesh 
        onPointerOver={() => document.body.style.cursor = isDragging ? 'grabbing' : 'grab'}
        onPointerDown={(e) => {
          document.body.style.cursor = 'grabbing';
          handlePointerDown(e);
        }}
        onPointerMove={(e) => {
          document.body.style.cursor = isDragging ? 'grabbing' : 'grab';
          handlePointerMove(e);
        }}
        onPointerUp={(e) => {
          document.body.style.cursor = 'grab';
          handlePointerUp(e);
        }}
        onPointerOut={(e) => {
          document.body.style.cursor = 'auto';
          handlePointerUp(e);
        }}
      >
        <sphereGeometry args={[4000, 16, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.BackSide} />
      </mesh>

      <group rotation={[-0.2, 0, 0]} position={[0, debugParams?.sceneOffsetY ?? INITIAL_SCENE_OFFSET_Y, 0]}>
        <group ref={groupRef}>
          {stats.systems.map((sys, i) => {
            const angle = i * ((Math.PI * 2) / total);
            const x = Math.sin(angle) * carouselRadius;
            const z = Math.cos(angle) * carouselRadius;

            return (
              <BlobCluster
                key={sys.facet}
                system={sys}
                mode={mode}
                paletteIndex={i}
                isActive={activeIndex === i}
                position={[x, 0, z]}
                rotation={[0, angle, 0]}
                onNavigate={handleFacetClick}
                particleScale={particleScale}
                globalMaxCount={globalMaxCount}
                debugParams={debugParams}
                isHovered={hoveredIndex === i}
                onHover={(isHovered) => {
                  if (!isDragging) {
                    setHoveredIndex(isHovered ? i : null);
                    setParentHoveredIndex(isHovered ? i : null);
                  }
                }}
                isAnyHovered={hoveredIndex !== null}
                isDragging={isDragging}
              />
            );
          })}
        </group>
      </group>
    </>
  );
}

// --- Dynamic Camera Updater ---

function CameraUpdater({ cameraY, cameraZ, radius, sceneOffsetY, isAnyHovered }: { cameraY: number, cameraZ: number, radius: number, sceneOffsetY: number, isAnyHovered: boolean }) {
  const { camera, scene } = useThree();
  const lookAtTarget = useMemo(() => new THREE.Vector3(0, 0, 0), []);

  useFrame(() => {
    if (isAnyHovered) {
      // Calculate world Y of the hovered cluster. Carousel rotates by -0.2 radians on X axis.
      const focusY = sceneOffsetY - radius * Math.sin(-0.2);
      // Frame it perfectly, move camera closer for better scale feeling
      camera.position.lerp(new THREE.Vector3(0, focusY, radius + 1500), 0.06);
      lookAtTarget.lerp(new THREE.Vector3(0, focusY, radius), 0.06);
    } else {
      // Return to user's custom debug camera settings
      camera.position.lerp(new THREE.Vector3(0, cameraY, cameraZ), 0.06);
      lookAtTarget.lerp(new THREE.Vector3(0, 0, 0), 0.06);
    }
    camera.lookAt(lookAtTarget);
  });

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
      physicsForce: INITIAL_PHYSICS_FORCE,
      particleLabelFontSize: 12,
      fogNear: INITIAL_FOG_NEAR,
      fogFar: INITIAL_FOG_FAR,
    };
    
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("blob_debug_params_v5");
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

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    localStorage.setItem("blob_debug_params_v5", JSON.stringify(debugParams));
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

  let globalMaxCount = 1;
  stats.systems.forEach(sys => {
    sys.satellites.forEach(s => {
      if (s[mode] > globalMaxCount) globalMaxCount = s[mode];
    });
  });

  return (
    <div className="w-full h-[640px] rounded-3xl mt-8 overflow-hidden bg-slate-50 shadow-inner relative flex justify-center">
      
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
            
            <div className="flex flex-col">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-gray-700">Physics Force</label>
                <span className="text-xs font-mono text-pink-500">{debugParams.physicsForce.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.01" max="0.5" step="0.01"
                value={debugParams.physicsForce}
                onChange={(e) => setDebugParams(p => ({ ...p, physicsForce: parseFloat(e.target.value) }))}
                className="w-full mt-2 accent-blue-500"
              />
            </div>

            <div className="flex flex-col">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-gray-700">Label Font Size</label>
                <span className="text-xs font-mono text-pink-500">{debugParams.particleLabelFontSize}</span>
              </div>
              <input
                type="range"
                min="2" max="24" step="1"
                value={debugParams.particleLabelFontSize}
                onChange={(e) => setDebugParams(p => ({ ...p, particleLabelFontSize: parseInt(e.target.value) }))}
                className="w-full mt-2 accent-blue-500"
              />
            </div>

            <div className="flex flex-col">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-gray-700">Fog: Fade Start (Near)</label>
                <span className="text-xs font-mono text-pink-500">{debugParams.fogNear}</span>
              </div>
              <input
                type="range"
                min="0" max="2000" step="50"
                value={debugParams.fogNear}
                onChange={(e) => setDebugParams(p => ({ ...p, fogNear: parseInt(e.target.value) }))}
                className="w-full mt-2 accent-blue-500"
              />
            </div>

            <div className="flex flex-col">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-gray-700">Fog: Fade End (Far)</label>
                <span className="text-xs font-mono text-pink-500">{debugParams.fogFar}</span>
              </div>
              <input
                type="range"
                min="1000" max="5000" step="100"
                value={debugParams.fogFar}
                onChange={(e) => setDebugParams(p => ({ ...p, fogFar: parseInt(e.target.value) }))}
                className="w-full mt-2 accent-blue-500"
              />
            </div>

            <hr className="border-gray-200 my-2" />
            
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
              localStorage.removeItem("blob_debug_params_v5");
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
                physicsForce: INITIAL_PHYSICS_FORCE,
                particleLabelFontSize: 12,
                fogNear: INITIAL_FOG_NEAR,
                fogFar: INITIAL_FOG_FAR,
              });
            }}
          >
            Reset Defaults
          </button>
        </div>
      </div>

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

      <div className="absolute inset-0">
        {isMounted && stats && (
          <Canvas
            shadows
            camera={{ position: [0, debugParams.cameraY, debugParams.cameraZ], fov: 45 }}
            gl={{ alpha: false, antialias: true, powerPreference: "high-performance" }}
          >
            <color attach="background" args={["#f8fafc"]} />
            
            <CameraUpdater 
              cameraY={debugParams.cameraY} 
              cameraZ={debugParams.cameraZ} 
              radius={debugParams.carouselRadius} 
              sceneOffsetY={debugParams.sceneOffsetY ?? 50}
              isAnyHovered={hoveredIndex !== null}
            />
            
            <Environment preset="city" />
            
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
              setParentHoveredIndex={setHoveredIndex}
            />
          </Suspense>
        </Canvas>
        )}
      </div>
    </div>
  );

}
