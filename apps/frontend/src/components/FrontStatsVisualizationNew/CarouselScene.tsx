import React, { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { NormalizedStats } from "./types";
import BlobCluster from "./BlobCluster";
import { INITIAL_SCENE_OFFSET_Y } from "./constants";

export default function CarouselScene({ 
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
