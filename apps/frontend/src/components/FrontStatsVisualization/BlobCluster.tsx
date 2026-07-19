import { Billboard, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as d3 from "d3";
import * as THREE from "three";
import { useTranslations } from "use-intl";

import { useEffect, useMemo, useRef, useState } from "react";

import AnimatedParticleLabel from "./AnimatedParticleLabel";
import {
  INITIAL_MATERIAL_ROUGHNESS,
  MACRO_COLOR_L_NEUTRAL,
  MACRO_COLOR_L_VIVID,
  MACRO_COLOR_S_NEUTRAL,
  MACRO_COLOR_S_VIVID,
  MACRO_VIVID_PROBABILITY,
} from "./constants";
import type { DebugParams, SimNode, StatsSatellite, StatsSystem } from "./types";
import { capitalize, hashString } from "./utils";

export default function BlobCluster({
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
  isDragging,
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
  debugParams: DebugParams;
  isHovered: boolean;
  onHover: (state: boolean) => void;
  isAnyHovered: boolean;
  isDragging: boolean;
}) {
  const tCommon = useTranslations("common");
  const tFilters = useTranslations("Filters");
  const nodesRef = useRef<SimNode[]>([]);
  const instancedMeshRef = useRef<THREE.InstancedMesh>(null);
  const hitboxRef = useRef<THREE.Mesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const pointerLocal = useMemo(() => new THREE.Vector3(), []);
  const [hoveredParticleIndex, setHoveredParticleIndex] = useState<number | null>(null);
  const hoveredParticleIndexRef = useRef<number | null>(null);
  const [renderedLabelCount, setRenderedLabelCount] = useState(0);
  const labelRefs = useRef<(THREE.Group | null)[]>([]);
  const gridDims = useRef({ width: 100, height: 100 });

  const facetDriftParams = useMemo(() => {
    const hash = hashString(system.facet);
    return {
      phaseX: (hash % 100) / 10.0,
      phaseY: ((hash >> 2) % 100) / 10.0,
      phaseZ: ((hash >> 4) % 100) / 10.0,
      freqX: 1.0 + (hash % 50) / 100.0, // 1.0 to 1.5
      freqY: 1.0 + ((hash >> 1) % 50) / 100.0,
      freqZ: 1.0 + ((hash >> 3) % 50) / 100.0,
    };
  }, [system.facet]);

  const satellites = useMemo(() => {
    const valid = system.satellites.filter((s) => s[mode] > 0);
    // Sort descending and apply the max item limit
    valid.sort((a, b) => b[mode] - a[mode]);
    return valid.slice(0, debugParams?.maxParticles ?? 100);
  }, [system, mode, debugParams?.maxParticles]);

  const colorsInitializedRef = useRef(false);

  useEffect(() => {
    if (satellites.length === 0) {
      nodesRef.current = [];
      return;
    }

    const radiusScale = d3
      .scalePow()
      .exponent(1 / 3)
      .domain([0, globalMaxCount])
      .range([0, 50]);

    const sorted = [...satellites].sort((a, b) => b[mode] - a[mode]);

    const baseFontSize = debugParams?.particleLabelFontSize ?? 16; // Fallback to 16 if not provided
    const layoutItems = sorted.map((sat) => {
      const d3Radius = Math.max(0.8, radiusScale(sat[mode]));
      const visualRadius = d3Radius * (particleScale / 260);

      // Estimate the text label width (character count * approx letter width)
      const textLen = (sat.value || "").length;
      const estimatedTextWidth = textLen * baseFontSize * 0.65 + 16;

      // Enforce cell boundaries so neighbors don't overlap. Add a 4px padding on each side.
      const cellWidth = Math.max(visualRadius * 2, estimatedTextWidth) + 8;

      // Enforce cell height: particle diameter + vertical space for 2 lines of text
      const cellHeight = visualRadius * 2 + baseFontSize * 1.85 + 12;

      return { sat, d3Radius, visualRadius, cellWidth, cellHeight };
    });

    const rows: (typeof layoutItems)[0][][] = [[]];
    let currentRowWidth = 0;

    // Calculate total required area based on cell dimensions
    const totalArea = layoutItems.reduce((sum, item) => sum + item.cellWidth * item.cellHeight, 0);
    // Use natural 16:9 aspect ratio width. If very few items, lay them out in a single row.
    const maxRowWidth = layoutItems.length <= 10 ? 9999 : Math.sqrt(totalArea * 1.77) * 1.15;

    for (const item of layoutItems) {
      if (currentRowWidth + item.cellWidth > maxRowWidth && rows[rows.length - 1].length > 0) {
        rows.push([]);
        currentRowWidth = 0;
      }
      rows[rows.length - 1].push(item);
      currentRowWidth += item.cellWidth;
    }

    const layoutResults = new Map<string, { x: number; y: number; d3Radius: number }>();
    let yCursor = 0;
    let actualWidth = 0;
    for (const row of rows) {
      const rowHeight = Math.max(...row.map((i) => i.cellHeight));
      const rowWidth = row.reduce((sum, item) => sum + item.cellWidth, 0);
      actualWidth = Math.max(actualWidth, rowWidth);

      let xCursor = -rowWidth / 2;
      const rowY = yCursor - rowHeight / 2;

      // Bottom alignment: Align the bottom edge of all particles in this row
      // so that their text labels sit perfectly on a single straight horizontal line.
      const labelAreaHeight = baseFontSize * 1.85 + 8;
      const bottomY = rowY - rowHeight / 2 + labelAreaHeight;

      for (const item of row) {
        const cellCenterX = xCursor + item.cellWidth / 2;
        // Position particle such that its bottom edge sits on bottomY
        const particleY = bottomY + item.visualRadius;

        layoutResults.set(item.sat.id, { x: cellCenterX, y: particleY, d3Radius: item.d3Radius });
        xCursor += item.cellWidth;
      }
      yCursor -= rowHeight;
    }

    const totalHeight = -yCursor;
    const yOffset = totalHeight / 2;

    gridDims.current = { width: actualWidth, height: totalHeight };

    nodesRef.current = satellites.map((sat) => {
      const existing = nodesRef.current.find((n) => n.id === sat.id);
      const layout = layoutResults.get(sat.id)!;
      const { x: targetX, y: layoutY, d3Radius } = layout;
      // Perfectly center vertically. Camera will handle framing.
      const targetY = layoutY + yOffset;
      const hash = hashString(sat.value || sat.facet);
      // Give them a slight deterministic Z variation based on their hash to prevent specular flattening (bleaching)
      const targetZ = ((hash % 100) / 100 - 0.5) * 40;

      const hue = (hash % 360) / 360; // THREE.Color().setHSL takes 0-1 for Hue
      const isVivid = hash % 100 < MACRO_VIVID_PROBABILITY * 100;
      const lightness = isVivid ? MACRO_COLOR_L_VIVID : MACRO_COLOR_L_NEUTRAL;
      const saturation = isVivid ? MACRO_COLOR_S_VIVID : MACRO_COLOR_S_NEUTRAL;
      const baseColor = new THREE.Color().setHSL(hue, saturation, lightness);

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

    colorsInitializedRef.current = false;
  }, [
    satellites,
    mode,
    paletteIndex,
    globalMaxCount,
    particleScale,
    debugParams?.particleLabelFontSize,
  ]);

  const localGroupRef = useRef<THREE.Group>(null);
  const facetLabelRef = useRef<THREE.Group>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const setHoveredParticle = (index: number | null) => {
    if (hoveredParticleIndexRef.current === index) return;
    hoveredParticleIndexRef.current = index;
    setHoveredParticleIndex(index);
  };

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      document.body.style.cursor = "auto";
    };
  }, []);

  useEffect(() => {
    if (!isHovered) {
      setHoveredParticle(null);
    }
  }, [isHovered]);

  // Stagger label rendering to prevent frame drops
  useEffect(() => {
    let timeout: NodeJS.Timeout | undefined;
    if (isHovered) {
      setRenderedLabelCount(0);
      let count = 0;
      const mountNextBatch = () => {
        count += 1; // Mount 1 label per tick for a beautiful sequential fade-in
        if (count >= satellites.length) {
          setRenderedLabelCount(satellites.length);
        } else {
          setRenderedLabelCount(count);
          timeout = setTimeout(mountNextBatch, 30); // Slower interval for 1-by-1
        }
      };
      // Delay enough time (600ms) for the particle layout animation to finish settling
      // before we start mounting any Text, to guarantee perfectly smooth movement.
      timeout = setTimeout(mountNextBatch, 600);
    } else {
      setRenderedLabelCount(0);
    }
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [isHovered, satellites.length]);

  const handlePointerEnter = (e: any) => {
    if (isDragging) return;
    e.stopPropagation();
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    onHover(true);
    document.body.style.cursor = "pointer";
  };

  const handlePointerLeave = (e: any) => {
    e.stopPropagation();
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      onHover(false);
      setHoveredParticle(null);
      document.body.style.cursor = "auto";
    }, 120);
  };

  // Force collapse if user starts dragging.
  useEffect(() => {
    if (isDragging && isHovered) {
      onHover(false);
    }
  }, [isDragging, isHovered, onHover]);

  // Calculate dynamic target scale based on grid size
  const maxDim = Math.max(gridDims.current.width, gridDims.current.height * 1.77);
  // Target a visible size of ~1600 units, capped at 8x scale so single items aren't huge
  const targetScale = isHovered ? Math.min(8.0, 1600 / (maxDim || 1)) : 1.0;
  const hideForFocusedCluster = isAnyHovered && !isHovered;

  const getParticleIndexFromPointer = (e: any) => {
    if (!hitboxRef.current || !localGroupRef.current) return null;

    pointerLocal.copy(e.point);
    hitboxRef.current.worldToLocal(pointerLocal);

    const currentScale = localGroupRef.current.scale.x || 1;
    const nodes = nodesRef.current;
    let closestIndex: number | null = null;
    let closestDistanceSq = Infinity;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const visualRadius = node.d3Radius * (particleScale / 260) * currentScale;
      const dx = pointerLocal.x - (node.x || 0) * currentScale;
      const dy = pointerLocal.y - (node.y || 0) * currentScale;
      const distanceSq = dx * dx + dy * dy;

      const hitRadius = Math.max(visualRadius + 4, 18);
      const hitRadiusSq = hitRadius * hitRadius;

      if (distanceSq <= hitRadiusSq && distanceSq < closestDistanceSq) {
        closestDistanceSq = distanceSq;
        closestIndex = i;
      }
    }

    return closestIndex;
  };

  const handleExpandedPointerMove = (e: any) => {
    if (!isHovered || isDragging) return;
    e.stopPropagation();
    const particleIndex = getParticleIndexFromPointer(e);
    setHoveredParticle(particleIndex);
    document.body.style.cursor = "pointer";
  };

  const handleHitboxClick = (e: any) => {
    e.stopPropagation();
    if (isDragging || satellites.length === 0) return;

    const particleIndex = isHovered ? getParticleIndexFromPointer(e) : null;
    const target = particleIndex === null ? satellites[0] : satellites[particleIndex];
    onNavigate(system.facet, target.value);
  };

  useFrame((state, delta) => {
    const time = state.clock.elapsedTime;
    if (localGroupRef.current) {
      // Unfocused clusters retreat down and away so they disappear cleanly
      const pushBackZ = isAnyHovered && !isHovered ? -1500 : 0;
      const pushDownY = isAnyHovered && !isHovered ? -2000 : 0;
      localGroupRef.current.position.z = THREE.MathUtils.lerp(
        localGroupRef.current.position.z,
        pushBackZ,
        0.08,
      );
      localGroupRef.current.position.y = THREE.MathUtils.lerp(
        localGroupRef.current.position.y,
        pushDownY,
        0.08,
      );

      dummy.scale.set(targetScale, targetScale, targetScale);
      localGroupRef.current.scale.lerp(dummy.scale, 0.08);
    }

    if (facetLabelRef.current) {
      const targetLabelY = isHovered
        ? -(gridDims.current.height / 2) * targetScale - 80
        : -(particleScale * 0.45) - 10;
      facetLabelRef.current.position.y = THREE.MathUtils.lerp(
        facetLabelRef.current.position.y,
        targetLabelY,
        0.08,
      );
    }

    if (hideForFocusedCluster) return;

    const nodes = nodesRef.current;
    const dt = Math.min(delta, 0.05);

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];

      if (isHovered) {
        node.x = THREE.MathUtils.lerp(node.x || 0, node.targetX, 0.1);
        node.y = THREE.MathUtils.lerp(node.y || 0, node.targetY, 0.1);
        node.z = THREE.MathUtils.lerp(node.z || 0, node.targetZ, 0.1);
        node.vx = 0;
        node.vy = 0;
        node.vz = 0;
        continue;
      }

      const pull = isActive
        ? (debugParams?.physicsForce ?? 0.1)
        : (debugParams?.physicsForce ?? 0.1) * 3;
      node.vx = (node.vx || 0) + (0 - (node.x || 0)) * pull * dt;
      node.vy = (node.vy || 0) + (0 - (node.y || 0)) * pull * dt;
      node.vz = (node.vz || 0) + (0 - (node.z || 0)) * pull * dt;

      // Organic "protein-like" fluid drift
      // Speed varies by count: heavier (larger count) means slower, lighter means faster.
      const logCount = Math.log10(((node as any)[mode] as number) || 1) + 1;
      const speedScale = 1.5 / logCount;
      const offset = i * 0.13;

      const jitterX = isActive || isHovered ? (Math.random() - 0.5) * 0.5 : 0;
      const jitterY = isActive || isHovered ? (Math.random() - 0.5) * 0.5 : 0;
      const jitterZ = isActive || isHovered ? (Math.random() - 0.5) * 0.5 : 0;

      node.vx +=
        (Math.sin(time * 1.2 * facetDriftParams.freqX + offset + facetDriftParams.phaseX) * 0.4 +
          jitterX) *
        speedScale;
      node.vy +=
        (Math.cos(time * 1.1 * facetDriftParams.freqY + offset * 2.1 + facetDriftParams.phaseY) *
          0.4 +
          jitterY) *
        speedScale;
      node.vz +=
        (Math.sin(time * 1.3 * facetDriftParams.freqZ + offset * 3.2 + facetDriftParams.phaseZ) *
          0.4 +
          jitterZ) *
        speedScale;

      const visualRadius = node.d3Radius * (particleScale / 260);
      if (isActive) {
        for (let j = i + 1; j < nodes.length; j++) {
          const other = nodes[j];
          const dx = (node.x || 0) - (other.x || 0);
          const dy = (node.y || 0) - (other.y || 0);
          const dz = (node.z || 0) - (other.z || 0);
          const distSq = dx * dx + dy * dy + dz * dz;
          const dist = Math.sqrt(distSq) + 0.001;
          const otherRadius = other.d3Radius * (particleScale / 260);
          const minDist = visualRadius + otherRadius + 1.0;

          if (dist < minDist) {
            const force = (minDist - dist) * 25.0 * dt;
            // Add Z-scattering to prevent them from getting permanently flattened after layout
            const adjustedDz = Math.abs(dz) < 1.0 ? (Math.random() - 0.5) * 5.0 : dz;
            const adjDist = Math.sqrt(dx * dx + dy * dy + adjustedDz * adjustedDz) + 0.001;
            const fx = (dx / adjDist) * force;
            const fy = (dy / adjDist) * force;
            const fz = (adjustedDz / adjDist) * force;
            node.vx += fx;
            node.vy += fy;
            node.vz += fz;
            other.vx = (other.vx || 0) - fx;
            other.vy = (other.vy || 0) - fy;
            other.vz = (other.vz || 0) - fz;
          }
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
        if (node.x > bound) {
          node.x = bound;
          node.vx *= -0.5;
        }
        if (node.x < -bound) {
          node.x = -bound;
          node.vx *= -0.5;
        }
        if (node.y > bound) {
          node.y = bound;
          node.vy *= -0.5;
        }
        if (node.y < -bound) {
          node.y = -bound;
          node.vy *= -0.5;
        }
        if (node.z > bound) {
          node.z = bound;
          node.vz *= -0.5;
        }
        if (node.z < -bound) {
          node.z = -bound;
          node.vz *= -0.5;
        }
      }
    }

    if (instancedMeshRef.current) {
      const needsColorUpdate = !colorsInitializedRef.current;
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const visualRadius = node.d3Radius * (particleScale / 260);

        dummy.position.set(node.x || 0, node.y || 0, node.z || 0);
        dummy.scale.set(visualRadius, visualRadius, visualRadius);
        dummy.updateMatrix();

        instancedMeshRef.current.setMatrixAt(i, dummy.matrix);
        if (needsColorUpdate) {
          instancedMeshRef.current.setColorAt(i, node.baseColor);
        }

        // Adjust label position to place it directly below the bottom edge of the particle.
        // Since the grid layout algorithm is already bottom-aligned and allocates custom cellWidth/cellHeight,
        // aligning the labels perfectly in a single row without vertical stagger ensures maximum visual alignment.
        if (isHovered && labelRefs.current[i]) {
          const currentScale = localGroupRef.current?.scale.x ?? 1.0;
          const baseX = (node.x || 0) * currentScale;
          const baseY = ((node.y || 0) - visualRadius) * currentScale - 8;
          labelRefs.current[i]!.position.set(baseX, baseY, (node.z || 0) * currentScale);
        }
      }
      instancedMeshRef.current.instanceMatrix.needsUpdate = true;
      if (needsColorUpdate) {
        if (instancedMeshRef.current.instanceColor)
          instancedMeshRef.current.instanceColor.needsUpdate = true;
        colorsInitializedRef.current = true;
      }
    }
  });

  return (
    <group position={position} rotation={rotation}>
      {/* Hit box OUTSIDE of localGroupRef so it doesn't shrink during layout scaling.
          This prevents the object from slipping out from under the mouse. */}
      <mesh
        ref={hitboxRef}
        position={[0, 0, 0]} // Aligned perfectly on Z=0 with particles to eliminate perspective distortion
        visible={!(isAnyHovered && !isHovered)}
        onPointerEnter={isAnyHovered && !isHovered ? undefined : handlePointerEnter}
        onPointerLeave={isAnyHovered && !isHovered ? undefined : handlePointerLeave}
        onPointerMove={isHovered ? handleExpandedPointerMove : undefined}
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
        }}
        onClick={handleHitboxClick}
      >
        {isHovered ? (
          <planeGeometry
            args={[
              Math.max(250, gridDims.current.width * targetScale * 1.3), // 30% safety cushion on width
              Math.max(250, gridDims.current.height * targetScale * 1.5), // 50% safety cushion on height (prevents top/bottom escape)
            ]}
          />
        ) : (
          <sphereGeometry args={[particleScale * 0.45, 16, 16]} />
        )}
        <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      <group ref={localGroupRef}>
        <instancedMesh ref={instancedMeshRef} args={[undefined, undefined, satellites.length]}>
          <sphereGeometry
            args={[1, 16, 16]}
            onUpdate={(geo) => {
              // CRITICAL: Three.js InstancedMesh raycaster uses the geometry's bounding sphere
              // for early frustum culling. Since instances are spread far beyond the base
              // geometry's radius of 1, the raycaster incorrectly ignores particles far from the center!
              // Setting an infinite bounding sphere forces the raycaster to check all instances.
              geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 999999);
            }}
          />
          <meshStandardMaterial
            color="#ffffff"
            roughness={isHovered ? 0.8 : (debugParams?.roughness ?? INITIAL_MATERIAL_ROUGHNESS)}
            metalness={0.0}
            envMapIntensity={isHovered ? 0.05 : 0.2}
          />
        </instancedMesh>
      </group>

      {/* Labels OUTSIDE localGroupRef to keep font size perfectly constant regardless of dynamic scaling */}
      {isHovered &&
        satellites.slice(0, renderedLabelCount).map((sat, i) => {
          // We render all labels, removed the 50 item cutoff limit as requested!
          return (
            <group
              key={sat.id}
              ref={(el) => {
                labelRefs.current[i] = el;
              }}
            >
              <AnimatedParticleLabel
                sat={sat}
                mode={mode}
                isDimmed={hoveredParticleIndex !== null && hoveredParticleIndex !== i}
                debugParams={debugParams}
              />
            </group>
          );
        })}

      <group
        ref={facetLabelRef}
        visible={!(isAnyHovered && !isHovered)}
        position={[0, -(particleScale * 0.45) - 10, 0]}
      >
        <Billboard position={[0, 0, 0]} follow={true}>
          <Text
            fontSize={isHovered ? (debugParams?.particleLabelFontSize ?? 16) * 1.8 : 16}
            color={isActive ? "#1e293b" : "#94a3b8"}
            anchorX="center"
            anchorY="middle"
          >
            {tFilters.has(`${system.facet}.title` as any)
              ? tFilters(`${system.facet}.title` as any)
              : capitalize(system.facet)}
          </Text>
        </Billboard>
        <Billboard
          position={[0, isHovered ? -((debugParams?.particleLabelFontSize ?? 16) * 2.0) : -18, 0]}
          follow={true}
        >
          <Text
            fontSize={isHovered ? (debugParams?.particleLabelFontSize ?? 16) * 1.0 : 8}
            color={isActive ? "#64748b" : "#cbd5e1"}
            anchorX="center"
            anchorY="middle"
          >
            {`${d3.sum(satellites, (d: StatsSatellite) => d[mode]).toLocaleString()} ${tCommon("items")}`}
          </Text>
        </Billboard>
      </group>
    </group>
  );
}
