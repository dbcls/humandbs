import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Text, Billboard } from "@react-three/drei";
import * as THREE from "three";
import { capitalize } from "./utils";
import type { StatsSatellite, DebugParams } from "./types";

export default function AnimatedParticleLabel({ 
  sat, 
  mode, 
  isDimmed, 
  debugParams
}: {
  sat: StatsSatellite,
  mode: "dataset" | "research",
  isDimmed: boolean,
  debugParams: DebugParams
}) {
  const titleRef = useRef<any>(null);
  const countRef = useRef<any>(null);

  useFrame(() => {
    const targetOpacity = isDimmed ? 0.15 : 1.0;
    const targetColorTitle = new THREE.Color(isDimmed ? "#94a3b8" : "#334155");
    const targetColorCount = new THREE.Color(isDimmed ? "#cbd5e1" : "#64748b");

    if (titleRef.current) {
      titleRef.current.fillOpacity = THREE.MathUtils.lerp(titleRef.current.fillOpacity ?? 0, targetOpacity, 0.05);
      
      if (!titleRef.current._currentColor) titleRef.current._currentColor = new THREE.Color("#334155");
      titleRef.current._currentColor.lerp(targetColorTitle, 0.05);
      titleRef.current.color = titleRef.current._currentColor;
      
    }

    if (countRef.current) {
      countRef.current.fillOpacity = THREE.MathUtils.lerp(countRef.current.fillOpacity ?? 0, targetOpacity, 0.05);
      
      if (!countRef.current._currentColor) countRef.current._currentColor = new THREE.Color("#64748b");
      countRef.current._currentColor.lerp(targetColorCount, 0.05);
      countRef.current.color = countRef.current._currentColor;
      
    }
  });

  const baseFontSize = debugParams?.particleLabelFontSize ?? 12;

  return (
    <Billboard follow={true} lockX={false} lockY={false} lockZ={false}>
      <Text
        ref={titleRef}
        position={[0, 0, 0]}
        fontSize={baseFontSize}
        material-transparent={true}
        material-depthWrite={false}
        fillOpacity={0}
        depthOffset={-1}
        anchorX="center"
        anchorY="top"
        raycast={() => null} // Completely disable raycasting for the text so it never blocks
      >
        {capitalize(sat.value)}
      </Text>
      <Text
        ref={countRef}
        position={[0, -(baseFontSize * 1.1), 0]}
        fontSize={baseFontSize * 0.75}
        material-transparent={true}
        material-depthWrite={false}
        fillOpacity={0}
        depthOffset={-1}
        anchorX="center"
        anchorY="top"
        raycast={() => null} 
      >
        {`${sat[mode].toLocaleString()} items`}
      </Text>
    </Billboard>
  );
}
