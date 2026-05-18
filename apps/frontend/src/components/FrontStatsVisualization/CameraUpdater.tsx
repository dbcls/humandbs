import { useMemo, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

export default function CameraUpdater({ cameraY, cameraZ, radius, sceneOffsetY, isAnyHovered }: { cameraY: number, cameraZ: number, radius: number, sceneOffsetY: number, isAnyHovered: boolean }) {
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
      (scene.fog as THREE.Fog).near = fogStart;
      (scene.fog as THREE.Fog).far = fogEnd;
    }
  }, [cameraY, cameraZ, radius, camera, scene]);

  return null;
}
