import React from "react";
import type { DebugParams } from "./types";

interface DebugPanelProps {
  debugParams: DebugParams;
  setDebugParams: React.Dispatch<React.SetStateAction<DebugParams>>;
  resetDebugParams: () => void;
}

export default function DebugPanel({ debugParams, setDebugParams, resetDebugParams }: DebugPanelProps) {
  return (
    <div className="hidden absolute top-4 left-4 z-[9999] bg-white/90 backdrop-blur-md p-4 rounded-xl shadow-lg border border-slate-200 w-80 text-xs overflow-y-auto max-h-[calc(100%-2rem)]">
      <h3 className="font-bold mb-3 text-slate-800 text-sm">Real-time Tweaks</h3>
      
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <div className="flex justify-between"><span>Carousel Radius</span><span className="font-mono text-accent">{debugParams.carouselRadius}</span></div>
          <input type="range" min="100" max="3000" step="10" value={debugParams.carouselRadius} onChange={(e) => setDebugParams((p) => ({...p, carouselRadius: Number(e.target.value)}))} />
        </label>
        <label className="block space-y-1">
          <div className="flex justify-between"><span>Particle Scale</span><span className="font-mono text-accent">{debugParams.particleScale}</span></div>
          <input type="range" min="50" max="400" step="10" value={debugParams.particleScale} onChange={(e) => setDebugParams((p) => ({...p, particleScale: Number(e.target.value)}))} />
        </label>
        <label className="flex flex-col gap-1">
          <div className="flex justify-between"><span>Max Particles / Facet</span><span className="font-mono text-accent">{debugParams.maxParticles}</span></div>
          <input type="range" min="10" max="500" step="10" value={debugParams.maxParticles} onChange={(e) => setDebugParams((p) => ({...p, maxParticles: Number(e.target.value)}))} />
        </label>
        <label className="flex flex-col gap-1">
          <div className="flex justify-between"><span>Rotation Speed</span><span className="font-mono text-accent">{debugParams.rotationSpeed}</span></div>
          <input type="range" min="0" max="0.3" step="0.01" value={debugParams.rotationSpeed} onChange={(e) => setDebugParams((p) => ({...p, rotationSpeed: Number(e.target.value)}))} />
        </label>
        <label className="flex flex-col gap-1">
          <div className="flex justify-between"><span>Scene Offset Y</span><span className="font-mono text-accent">{debugParams.sceneOffsetY}</span></div>
          <input type="range" min="-500" max="500" step="10" value={debugParams.sceneOffsetY} onChange={(e) => setDebugParams((p) => ({...p, sceneOffsetY: Number(e.target.value)}))} />
        </label>
        <label className="flex flex-col gap-1">
          <div className="flex justify-between"><span>Material Roughness</span><span className="font-mono text-accent">{debugParams.roughness}</span></div>
          <input type="range" min="0" max="1" step="0.05" value={debugParams.roughness} onChange={(e) => setDebugParams((p) => ({...p, roughness: Number(e.target.value)}))} />
        </label>
        <label className="flex flex-col gap-1">
          <div className="flex justify-between"><span>Camera Y (Up/Down)</span><span className="font-mono text-accent">{debugParams.cameraY}</span></div>
          <input type="range" min="-300" max="500" step="10" value={debugParams.cameraY} onChange={(e) => setDebugParams((p) => ({...p, cameraY: Number(e.target.value)}))} />
        </label>
        <label className="flex flex-col gap-1">
          <div className="flex justify-between"><span>Camera Z (Zoom)</span><span className="font-mono text-accent">{debugParams.cameraZ}</span></div>
          <input type="range" min="100" max="2000" step="10" value={debugParams.cameraZ} onChange={(e) => setDebugParams((p) => ({...p, cameraZ: Number(e.target.value)}))} />
        </label>

        <div className="space-y-1 mt-4 border-t pt-2 border-slate-200">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <span className="whitespace-nowrap">Ambient Color</span>
            <input type="color" value={debugParams.lightAmbientColor} onChange={(e) => setDebugParams((p) => ({...p, lightAmbientColor: e.target.value}))} className="w-8 h-6 p-0 border-0 cursor-pointer" />
          </div>
          <div className="flex justify-between items-center text-xs font-bold text-slate-700">
            <span>Ambient Light</span>
            <span className="text-pink-500">{debugParams.lightAmbient.toFixed(1)}</span>
          </div>
          <input type="range" min="0" max="3" step="0.1" value={debugParams.lightAmbient} onChange={(e) => setDebugParams((p) => ({...p, lightAmbient: parseFloat(e.target.value)}))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
          
          <div className="flex flex-col">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-gray-700">Physics Force</label>
              <span className="text-xs font-mono text-pink-500">{debugParams.physicsForce.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.01" max="0.5" step="0.01"
              value={debugParams.physicsForce}
              onChange={(e) => setDebugParams((p) => ({ ...p, physicsForce: parseFloat(e.target.value) }))}
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
              onChange={(e) => setDebugParams((p) => ({ ...p, particleLabelFontSize: parseInt(e.target.value) }))}
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
              onChange={(e) => setDebugParams((p) => ({ ...p, fogNear: parseInt(e.target.value) }))}
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
              onChange={(e) => setDebugParams((p) => ({ ...p, fogFar: parseInt(e.target.value) }))}
              className="w-full mt-2 accent-blue-500"
            />
          </div>

          <hr className="border-gray-200 my-2" />
          
          <div className="flex justify-between items-center text-xs font-bold text-slate-700">
            <span>Directional Light</span>
            <span className="text-pink-500">{debugParams.lightDirectional.toFixed(1)}</span>
          </div>
          <input type="range" min="0" max="3" step="0.1" value={debugParams.lightDirectional} onChange={(e) => setDebugParams((p) => ({...p, lightDirectional: parseFloat(e.target.value)}))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
          
          <div className="flex justify-between items-center text-xs font-bold text-slate-700">
            <span>Point Light (Blue)</span>
            <span className="text-pink-500">{debugParams.lightPoint1.toFixed(1)}</span>
          </div>
          <input type="range" min="0" max="3" step="0.1" value={debugParams.lightPoint1} onChange={(e) => setDebugParams((p) => ({...p, lightPoint1: parseFloat(e.target.value)}))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
          
          <div className="flex justify-between items-center text-xs font-bold text-slate-700">
            <span>Point Light (Pink)</span>
            <span className="text-pink-500">{debugParams.lightPoint2.toFixed(1)}</span>
          </div>
          <input type="range" min="0" max="3" step="0.1" value={debugParams.lightPoint2} onChange={(e) => setDebugParams((p) => ({...p, lightPoint2: parseFloat(e.target.value)}))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
        </div>

        <button 
          className="mt-2 bg-slate-200 hover:bg-slate-300 text-slate-700 py-1 rounded font-bold transition-colors"
          onClick={() => resetDebugParams()}
        >
          Reset Defaults
        </button>
      </div>
    </div>
  );
}
