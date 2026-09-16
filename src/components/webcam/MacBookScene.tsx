"use client";
import { DesktopEnvironment } from "../desktop/DesktopEnvironment";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { Laptop } from "./Laptop";

// Import the window store to read the lock state!
import { useWindowStore } from "../window-manager/useWindowStore";

export type ScenePhase = "closed" | "opening" | "open";

const FOV_DEGREES = 32;

const FRAMED_DISTANCE = 2.6; 
const FRAMED_LOOK_AT_Y = 0.87; 
const ELEVATION = 1.3; 

const INITIAL_CAMERA_POS: [number, number, number] = [0, FRAMED_LOOK_AT_Y + 1.5, FRAMED_DISTANCE + 4.0];
const FRAMED_CAMERA_POS: [number, number, number] = [0, FRAMED_LOOK_AT_Y + ELEVATION, FRAMED_DISTANCE];
const LOOK_AT: [number, number, number] = [0, FRAMED_LOOK_AT_Y, 0];
const CAMERA_DAMP_LAMBDA = 2.4; 

function CameraRig({ phase }: { phase: ScenePhase }) {
  const { camera } = useThree();
  const lookAtTarget = useState(() => new THREE.Vector3(...LOOK_AT))[0];

  useFrame((_, delta) => {
    const target = phase === "closed" ? INITIAL_CAMERA_POS : FRAMED_CAMERA_POS;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, target[0], CAMERA_DAMP_LAMBDA, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, target[1], CAMERA_DAMP_LAMBDA, delta);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, target[2], CAMERA_DAMP_LAMBDA, delta);
    camera.lookAt(lookAtTarget);
  });

  return null;
}

interface MacBookSceneProps {
  children?: ReactNode;
  autoOpenDelay?: number;
  debugOrbit?: boolean;
}

export function MacBookScene({ children, autoOpenDelay = 600, debugOrbit = false }: MacBookSceneProps) {
  const [phase, setPhase] = useState<ScenePhase>("closed");
  
  // Pull our lock state
  const isVMLocked = useWindowStore((s) => s.isVMLocked);
  const setVMLocked = useWindowStore((s) => s.setVMLocked);

  useEffect(() => {
    const id = setTimeout(() => setPhase("opening"), autoOpenDelay);
    return () => clearTimeout(id);
  }, [autoOpenDelay]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000" }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true }}
        camera={{ position: INITIAL_CAMERA_POS, fov: FOV_DEGREES, near: 0.1, far: 50 }}
        // FIX: R3F defaults touchAction to 'none' which kills trackpads globally. This restores it!
        style={{ touchAction: "auto" }}
      >
        <color attach="background" args={["#020203"]} />
        <fog attach="fog" args={["#020203", 8, 16]} />

        <ambientLight intensity={1.5} />
        <directionalLight position={[3, 5, 4]} intensity={2.5} castShadow />
        <spotLight position={[-4, 3, 2]} intensity={1.5} angle={0.4} penumbra={1} />

        <Suspense fallback={null}>
          <Environment preset="city" />
        </Suspense>

        <CameraRig phase={phase} />

        <Laptop phase={phase} onOpened={() => console.log("Opened")}>
          <DesktopEnvironment />
        </Laptop>

        {debugOrbit && <OrbitControls target={LOOK_AT} />}
      </Canvas>

      {/* 
        VIRTUAL MACHINE SHIELD 
        When you click the Mac, this invisible layer spawns ON TOP of the 3D Canvas,
        completely blocking it from stealing your scrolling or mouse events.
        Clicking this shield breaks the lock and disappears.
      */}
      {isVMLocked && (
        <div 
          onClick={() => setVMLocked(false)}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 999, // High enough to cover canvas, but below the Mac's HTML portal
            cursor: "default"
          }}
        />
      )}
    </div>
  );
}