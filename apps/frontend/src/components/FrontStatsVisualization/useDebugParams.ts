import { useEffect, useState } from "react";

import {
  INITIAL_CAMERA_Y,
  INITIAL_CAMERA_Z,
  INITIAL_CAROUSEL_RADIUS,
  INITIAL_CAROUSEL_ROTATION_SPEED,
  INITIAL_FOG_FAR,
  INITIAL_FOG_NEAR,
  INITIAL_LIGHT_AMBIENT,
  INITIAL_LIGHT_AMBIENT_COLOR,
  INITIAL_LIGHT_DIRECTIONAL,
  INITIAL_LIGHT_POINT_1,
  INITIAL_LIGHT_POINT_2,
  INITIAL_MATERIAL_ROUGHNESS,
  INITIAL_MAX_PARTICLES,
  INITIAL_PARTICLE_LABEL_FONT_SIZE,
  INITIAL_PARTICLE_SCALE,
  INITIAL_PHYSICS_FORCE,
  INITIAL_SCENE_OFFSET_Y,
} from "./constants";
import type { DebugParams } from "./types";

export const defaultDebugParams: DebugParams = {
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
  particleLabelFontSize: INITIAL_PARTICLE_LABEL_FONT_SIZE,
  fogNear: INITIAL_FOG_NEAR,
  fogFar: INITIAL_FOG_FAR,
  maxParticles: INITIAL_MAX_PARTICLES,
};

export default function useDebugParams() {
  const [debugParams, setDebugParams] = useState<DebugParams>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("blob_debug_params_v5");
      if (saved) {
        try {
          return { ...defaultDebugParams, ...JSON.parse(saved) };
        } catch (e) {
          console.warn("Failed to parse debug params from localStorage", e);
        }
      }
    }
    return defaultDebugParams;
  });

  useEffect(() => {
    localStorage.setItem("blob_debug_params_v5", JSON.stringify(debugParams));
  }, [debugParams]);

  const resetDebugParams = () => {
    localStorage.removeItem("blob_debug_params_v5");
    setDebugParams(defaultDebugParams);
  };

  return { debugParams, setDebugParams, resetDebugParams };
}
