import { Environment } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useNavigate } from "@tanstack/react-router";
import { useTranslations } from "use-intl";

import { Suspense, useEffect, useRef, useState } from "react";

import { SkeletonLoading } from "@/components/Skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import CarouselScene from "./CarouselScene";
import DebugPanel from "./DebugPanel";
import useDebugParams from "./useDebugParams";
import useStats from "./useStats";
import { capitalize } from "./utils";

export default function FrontStatsVisualization() {
  const { loading, error, stats } = useStats();
  const [mode, setMode] = useState<"dataset" | "research">("research");
  const [isMounted, setIsMounted] = useState(false);
  const { debugParams, setDebugParams, resetDebugParams } = useDebugParams();
  const tFilters = useTranslations("Filters");

  const navigate = useNavigate();
  const tCommon = useTranslations("common");

  const researchRef = useRef<HTMLButtonElement>(null);
  const datasetRef = useRef<HTMLButtonElement>(null);
  const [sliderStyle, setSliderStyle] = useState({ left: 0, width: 0 });

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || !stats) return;
    
    const updateSlider = () => {
      const activeEl = mode === "research" ? researchRef.current : datasetRef.current;
      if (activeEl) {
        setSliderStyle({
          left: activeEl.offsetLeft,
          width: activeEl.offsetWidth,
        });
      }
    };

    // Delay slightly to ensure browser has rendered layout for correct offsetWidth
    const timer = setTimeout(updateSlider, 50);

    const observers: ResizeObserver[] = [];
    const elements = [researchRef.current, datasetRef.current].filter(Boolean) as HTMLElement[];
    if (elements.length > 0) {
      const observer = new ResizeObserver(() => {
        requestAnimationFrame(updateSlider);
      });
      elements.forEach((el) => observer.observe(el));
      observers.push(observer);
    }

    return () => {
      clearTimeout(timer);
      observers.forEach((obs) => obs.disconnect());
    };
  }, [mode, isMounted, stats]);

  if (!isMounted || loading) {
    return (
      <div className="flex h-[540px] w-full items-center justify-center">
        <SkeletonLoading />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="w-full rounded-xl bg-red-50 p-8 text-red-600">
        {error || "No data available"}
      </div>
    );
  }

  let globalMaxCount = 1;
  stats.systems.forEach((sys) => {
    sys.satellites.forEach((s) => {
      if (s[mode] > globalMaxCount) globalMaxCount = s[mode];
    });
  });

  const handleFacetClick = (facet: string, value: string) => {
    let filterValue: any = [value];
    if (facet === "disease") filterValue = value;
    else if (facet === "isTumor") filterValue = value;
    else if (facet === "hasPhenotypeData") filterValue = value === "1" || value === "true";

    const filtersObj = { [facet]: filterValue };
    const to = mode === "dataset" ? "/{-$lang}/dataset" : "/{-$lang}/research";
    const searchPayload =
      mode === "dataset"
        ? { filters: filtersObj, page: 1, limit: 20, order: "asc" }
        : { datasetFilters: filtersObj, page: 1, limit: 20, order: "asc" };

    navigate({
      to: to as any,
      search: searchPayload as any,
    });
  };

  return (
    <div className="relative flex h-[640px] w-full justify-center overflow-hidden rounded-3xl bg-slate-50 shadow-inner">
      <DebugPanel
        debugParams={debugParams}
        setDebugParams={setDebugParams}
        resetDebugParams={resetDebugParams}
      />

      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={setMode}
        className="absolute top-6 z-10 flex items-center rounded-full bg-white p-2 gap-2"
      >
        <ToggleGroupItem
          value="research"
          variant="pill"
          ref={researchRef}
          className="z-10 h-10 px-8 cursor-pointer rounded-full text-center font-bold text-sm text-foreground-light transition-all duration-300 data-[state=on]:text-white data-[state=on]:!bg-transparent data-[state=off]:!bg-transparent"
        >
          {tCommon("research")}
          <span className="ml-2 font-normal text-xs opacity-80">
            {stats.researchTotal.toLocaleString()}
          </span>
        </ToggleGroupItem>
        <ToggleGroupItem
          value="dataset"
          variant="pill"
          ref={datasetRef}
          className="z-10 h-10 px-8 cursor-pointer rounded-full text-center font-bold text-sm text-foreground-light transition-all duration-300 data-[state=on]:text-white data-[state=on]:!bg-transparent data-[state=off]:!bg-transparent"
        >
          {tCommon("dataset")}
          <span className="ml-2 font-normal text-xs opacity-80">
            {stats.datasetTotal.toLocaleString()}
          </span>
        </ToggleGroupItem>
        <div
          className="absolute z-0 top-2 h-10 rounded-full bg-secondary transition-all duration-300 ease-out"
          style={{
            left: `${sliderStyle.left}px`,
            width: `${sliderStyle.width}px`,
          }}
        />
      </ToggleGroup>

      <div className="absolute inset-0">
        {isMounted && stats && (
          <Canvas
            dpr={[1, 1.5]}
            camera={{
              position: [0, debugParams.cameraY, debugParams.cameraZ],
              fov: 45,
            }}
            gl={{
              alpha: false,
              antialias: true,
              powerPreference: "high-performance",
            }}
            performance={{ min: 0.5 }}
          >
            <color attach="background" args={["#f8fafc"]} />

            <Environment preset="city" />

            <Suspense fallback={null}>
              <CarouselScene
                stats={stats}
                mode={mode}
                onNavigate={handleFacetClick}
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
        )}
      </div>

      {/* Accessibility fallback for screen readers */}
      <div className="sr-only">
        <h2>{mode === "research" ? tCommon("research") : tCommon("dataset")}</h2>
        <ul>
          {stats?.systems.map((sys) => (
            <li key={sys.facet}>
              <h3>
                {tFilters.has(`${sys.facet}.title` as any)
                  ? tFilters(`${sys.facet}.title` as any)
                  : capitalize(sys.facet)}
              </h3>
              <ul>
                {sys.satellites
                  .filter((s) => s[mode] > 0)
                  .map((s) => (
                    <li key={s.id}>
                      <button
                        onClick={() => {
                          handleFacetClick(sys.facet, s.value);
                        }}
                      >
                        {capitalize(s.value)}: {s[mode]} {tCommon("items")}
                      </button>
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
