import type * as THREE from "three";
// --- Types & Data Fetching ---

export type StatsSatellite = {
  id: string;
  facet: string;
  value: string;
  research: number;
  dataset: number;
  total: number;
};

export type StatsSystem = {
  facet: string;
  total: number;
  satellites: StatsSatellite[];
};

export type NormalizedStats = {
  researchTotal: number;
  datasetTotal: number;
  systems: StatsSystem[];
};

export type StatsState = {
  loading: boolean;
  error: string;
  stats: NormalizedStats | null;
};
export type SimNode = StatsSatellite & {
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

export type DebugParams = {
  carouselRadius: number;
  particleScale: number;
  rotationSpeed: number;
  sceneOffsetY: number;
  roughness: number;
  cameraY: number;
  cameraZ: number;
  lightAmbient: number;
  lightAmbientColor: string;
  lightDirectional: number;
  lightPoint1: number;
  lightPoint2: number;
  physicsForce: number;
  particleLabelFontSize: number;
  fogNear: number;
  fogFar: number;
  maxParticles: number;
};
