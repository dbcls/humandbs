import React, { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Text, Billboard } from "@react-three/drei";
import * as THREE from "three";
import { capitalize } from "./utils";

export default function AnimatedParticleLabel({ sat, mode, isDimmed, debugParams, onNavigate, facet, onPointerEnter, onPointerLeave, isDragging }: any) {
  const textRef = useRef<any>(null);

  useFrame(() => {
    if (textRef.current) {
      const targetOpacity = isDimmed ? 0.15 : 1.0;
      textRef.current.fillOpacity = THREE.MathUtils.lerp(textRef.current.fillOpacity ?? 1.0, targetOpacity, 0.15);
      
      const targetColor = new THREE.Color(isDimmed ? "#94a3b8" : "#334155");
      if (!textRef.current._currentColor) textRef.current._currentColor = new THREE.Color("#334155");
      textRef.current._currentColor.lerp(targetColor, 0.15);
      textRef.current.color = textRef.current._currentColor;
      
      textRef.current.sync();
    }
  });

  return (
    <Billboard follow={true} lockX={false} lockY={false} lockZ={false}>
      <Text
        ref={textRef}
        fontSize={debugParams?.particleLabelFontSize ?? 12}
        material-transparent={true}
        material-depthWrite={false}
        depthOffset={-1}
        anchorX="center"
        anchorY="top"
        raycast={() => null} // Completely disable raycasting for the text so it never blocks
      >
        {`${capitalize(sat.value)} (${sat[mode]})`}
      </Text>
    </Billboard>
  );
}
