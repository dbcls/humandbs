import React, { useState, useEffect, Suspense } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Canvas } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import { SkeletonLoading } from "@/components/Skeleton";
import useStats from "./useStats";
import CarouselScene from "./CarouselScene";
import CameraUpdater from "./CameraUpdater";
import { 
  INITIAL_CAROUSEL_RADIUS,
  INITIAL_PARTICLE_SCALE,
  INITIAL_CAROUSEL_ROTATION_SPEED,
  INITIAL_CAMERA_Y,
  INITIAL_CAMERA_Z,
  INITIAL_SCENE_OFFSET_Y,
  INITIAL_MATERIAL_ROUGHNESS,
  INITIAL_LIGHT_AMBIENT,
  INITIAL_LIGHT_AMBIENT_COLOR,
  INITIAL_LIGHT_DIRECTIONAL,
  INITIAL_LIGHT_POINT_1,
  INITIAL_LIGHT_POINT_2,
  INITIAL_PHYSICS_FORCE,
  INITIAL_FOG_NEAR,
  INITIAL_FOG_FAR,
  INITIAL_MAX_PARTICLES
} from "./constants";

export default function FrontStatsVisualizationNew() {
  const { loading, error, stats } = useStats();
  const [mode, setMode] = useState<"dataset" | "research">("dataset");
  const [isMounted, setIsMounted] = useState(false);
  
  const [debugParams, setDebugParams] = useState<any>(() => {
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
      maxParticles: INITIAL_MAX_PARTICLES,
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
            <input type="range" min="100" max="3000" step="10" value={debugParams.carouselRadius} onChange={(e) => setDebugParams((p: any) => ({...p, carouselRadius: Number(e.target.value)}))} />
          </label>
          <label className="block space-y-1">
            <div className="flex justify-between"><span>Particle Scale</span><span className="font-mono text-accent">{debugParams.particleScale}</span></div>
            <input type="range" min="50" max="400" step="10" value={debugParams.particleScale} onChange={(e) => setDebugParams((p: any) => ({...p, particleScale: Number(e.target.value)}))} />
          </label>
          <label className="flex flex-col gap-1">
            <div className="flex justify-between"><span>Max Particles / Facet</span><span className="font-mono text-accent">{debugParams.maxParticles}</span></div>
            <input type="range" min="10" max="500" step="10" value={debugParams.maxParticles} onChange={(e) => setDebugParams((p: any) => ({...p, maxParticles: Number(e.target.value)}))} />
          </label>
          <label className="flex flex-col gap-1">
            <div className="flex justify-between"><span>Rotation Speed</span><span className="font-mono text-accent">{debugParams.rotationSpeed}</span></div>
            <input type="range" min="0" max="0.3" step="0.01" value={debugParams.rotationSpeed} onChange={(e) => setDebugParams((p: any) => ({...p, rotationSpeed: Number(e.target.value)}))} />
          </label>
          <label className="flex flex-col gap-1">
            <div className="flex justify-between"><span>Scene Offset Y</span><span className="font-mono text-accent">{debugParams.sceneOffsetY}</span></div>
            <input type="range" min="-500" max="500" step="10" value={debugParams.sceneOffsetY} onChange={(e) => setDebugParams((p: any) => ({...p, sceneOffsetY: Number(e.target.value)}))} />
          </label>
          <label className="flex flex-col gap-1">
            <div className="flex justify-between"><span>Material Roughness</span><span className="font-mono text-accent">{debugParams.roughness}</span></div>
            <input type="range" min="0" max="1" step="0.05" value={debugParams.roughness} onChange={(e) => setDebugParams((p: any) => ({...p, roughness: Number(e.target.value)}))} />
          </label>
          <label className="flex flex-col gap-1">
            <div className="flex justify-between"><span>Camera Y (Up/Down)</span><span className="font-mono text-accent">{debugParams.cameraY}</span></div>
            <input type="range" min="-300" max="500" step="10" value={debugParams.cameraY} onChange={(e) => setDebugParams((p: any) => ({...p, cameraY: Number(e.target.value)}))} />
          </label>
          <label className="flex flex-col gap-1">
            <div className="flex justify-between"><span>Camera Z (Zoom)</span><span className="font-mono text-accent">{debugParams.cameraZ}</span></div>
            <input type="range" min="100" max="2000" step="10" value={debugParams.cameraZ} onChange={(e) => setDebugParams((p: any) => ({...p, cameraZ: Number(e.target.value)}))} />
          </label>

          <div className="space-y-1 mt-4 border-t pt-2 border-slate-200">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <span className="whitespace-nowrap">Ambient Color</span>
              <input type="color" value={debugParams.lightAmbientColor} onChange={(e) => setDebugParams((p: any) => ({...p, lightAmbientColor: e.target.value}))} className="w-8 h-6 p-0 border-0 cursor-pointer" />
            </div>
            <div className="flex justify-between items-center text-xs font-bold text-slate-700">
              <span>Ambient Light</span>
              <span className="text-pink-500">{debugParams.lightAmbient.toFixed(1)}</span>
            </div>
            <input type="range" min="0" max="3" step="0.1" value={debugParams.lightAmbient} onChange={(e) => setDebugParams((p: any) => ({...p, lightAmbient: parseFloat(e.target.value)}))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
            
            <div className="flex flex-col">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-gray-700">Physics Force</label>
                <span className="text-xs font-mono text-pink-500">{debugParams.physicsForce.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.01" max="0.5" step="0.01"
                value={debugParams.physicsForce}
                onChange={(e) => setDebugParams((p: any) => ({ ...p, physicsForce: parseFloat(e.target.value) }))}
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
                onChange={(e) => setDebugParams((p: any) => ({ ...p, particleLabelFontSize: parseInt(e.target.value) }))}
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
                onChange={(e) => setDebugParams((p: any) => ({ ...p, fogNear: parseInt(e.target.value) }))}
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
                onChange={(e) => setDebugParams((p: any) => ({ ...p, fogFar: parseInt(e.target.value) }))}
                className="w-full mt-2 accent-blue-500"
              />
            </div>

            <hr className="border-gray-200 my-2" />
            
            <div className="flex justify-between items-center text-xs font-bold text-slate-700">
              <span>Directional Light</span>
              <span className="text-pink-500">{debugParams.lightDirectional.toFixed(1)}</span>
            </div>
            <input type="range" min="0" max="3" step="0.1" value={debugParams.lightDirectional} onChange={(e) => setDebugParams((p: any) => ({...p, lightDirectional: parseFloat(e.target.value)}))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
            
            <div className="flex justify-between items-center text-xs font-bold text-slate-700">
              <span>Point Light (Blue)</span>
              <span className="text-pink-500">{debugParams.lightPoint1.toFixed(1)}</span>
            </div>
            <input type="range" min="0" max="3" step="0.1" value={debugParams.lightPoint1} onChange={(e) => setDebugParams((p: any) => ({...p, lightPoint1: parseFloat(e.target.value)}))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
            
            <div className="flex justify-between items-center text-xs font-bold text-slate-700">
              <span>Point Light (Pink)</span>
              <span className="text-pink-500">{debugParams.lightPoint2.toFixed(1)}</span>
            </div>
            <input type="range" min="0" max="3" step="0.1" value={debugParams.lightPoint2} onChange={(e) => setDebugParams((p: any) => ({...p, lightPoint2: parseFloat(e.target.value)}))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
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
                maxParticles: INITIAL_MAX_PARTICLES,
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
              radius={ debugParams.carouselRadius } 
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

} // Force HMR reload
