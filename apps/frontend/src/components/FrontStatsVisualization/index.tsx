import { useState, useEffect, Suspense } from "react";
import { useTranslations } from "use-intl";
import { useNavigate } from "@tanstack/react-router";
import { Canvas } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import { SkeletonLoading } from "@/components/Skeleton";
import useStats from "./useStats";
import CarouselScene from "./CarouselScene";
import CameraUpdater from "./CameraUpdater";
import useDebugParams from "./useDebugParams";
import DebugPanel from "./DebugPanel";
import { capitalize } from "./utils";

export default function FrontStatsVisualization() {
  const { loading, error, stats } = useStats();
  const [mode, setMode] = useState<"dataset" | "research">("research");
  const [isMounted, setIsMounted] = useState(false);
  const { debugParams, setDebugParams, resetDebugParams } = useDebugParams();

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const navigate = useNavigate();
  const tCommon = useTranslations("common");

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted || loading) {
    return (
      <div className="w-full h-[540px] flex items-center justify-center">
        <SkeletonLoading />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="w-full p-8 bg-red-50 text-red-600 rounded-xl">
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
    <div className="w-full h-[640px] rounded-3xl overflow-hidden bg-slate-50 shadow-inner relative flex justify-center">
      
      <DebugPanel 
        debugParams={debugParams} 
        setDebugParams={setDebugParams} 
        resetDebugParams={resetDebugParams} 
      />

      <div className="absolute top-6 z-10 flex items-center bg-white/90 backdrop-blur-sm p-1.5 rounded-full">
        <button
          aria-pressed={mode === "research"}
          onClick={() => setMode("research")}
          className={`px-8 py-2.5 rounded-full text-sm font-bold transition-all duration-300 ${
            mode === "research"
              ? "bg-accent text-white"
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          }`}
        >
          {tCommon("research")} <span className="ml-2 opacity-80 font-normal text-xs">{stats.researchTotal.toLocaleString()}</span>
        </button>
        <button
          aria-pressed={mode === "dataset"}
          onClick={() => setMode("dataset")}
          className={`px-8 py-2.5 rounded-full text-sm font-bold transition-all duration-300 ${
            mode === "dataset"
              ? "bg-secondary text-white"
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          }`}
        >
          {tCommon("dataset")} <span className="ml-2 opacity-80 font-normal text-xs">{stats.datasetTotal.toLocaleString()}</span>
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

      {/* Accessibility fallback for screen readers */}
      <div className="sr-only">
        <h2>{mode === "research" ? tCommon("research") : tCommon("dataset")}</h2>
        <ul>
          {stats?.systems.map(sys => (
            <li key={sys.facet}>
              <h3>{capitalize(sys.facet)}</h3>
              <ul>
                {sys.satellites.filter(s => s[mode] > 0).map(s => (
                  <li key={s.id}>
                    {capitalize(s.value)}: {s[mode]}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

}
