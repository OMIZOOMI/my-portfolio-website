// @ts-nocheck
"use client";

import { useRef, useEffect, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { ScenePhase } from "./MacBookScene";
import { Model as MacbookModel } from './Macbook';

// Import our store to trigger the lock
import { useWindowStore } from "../window-manager/useWindowStore";

const OPEN_ROTATION = -1.85; 

export const BASE_SIZE: [number, number, number] = [2.0, 0.06, 1.4];
export const LID_SIZE: [number, number, number] = [2.0, 0.05, 1.35];
export const HINGE_Y = 0.03;
export const HINGE_Z = -0.68;

const SCREEN_PIXEL_WIDTH = 1400;
const SCREEN_PIXEL_HEIGHT = 900;
export const SCREEN_WORLD_WIDTH = 1.78;
export const SCREEN_WORLD_HEIGHT = (SCREEN_WORLD_WIDTH * SCREEN_PIXEL_HEIGHT) / SCREEN_PIXEL_WIDTH;
const SCREEN_SCALE = SCREEN_WORLD_WIDTH / SCREEN_PIXEL_WIDTH;

export const LAPTOP_TOTAL_HEIGHT = 2.0; 
export const SCREEN_CENTER_WORLD_Y = 1.0;

interface LaptopProps {
  phase: ScenePhase;
  onOpened?: () => void;
  children?: ReactNode;
}

export function Laptop({ phase, onOpened, children }: LaptopProps) {
  const hasFiredOpened = useRef(false);
  const setVMLocked = useWindowStore((s) => s.setVMLocked);

  useFrame(() => {
    if (!hasFiredOpened.current && phase === "opening") {
      hasFiredOpened.current = true;
      onOpened?.();
    }
  });

  useEffect(() => {
    if (phase === "closed") hasFiredOpened.current = false;
  }, [phase]);

  return (
    <group position={[0, 0, 0]} scale={[6.9, 6.9, 6.9]}>
      
      <group>
        <MacbookModel rotation={[Math.PI, 0, 0]} />
      </group>

      <group position={[0.0002, 0.09, -0.19]} rotation={[-0.355, 0, 0]}>
        <Html
          transform
          scale={SCREEN_SCALE * 7.28}
          style={{
            width: SCREEN_PIXEL_WIDTH,
            height: SCREEN_PIXEL_HEIGHT,
            overflow: "hidden",
            borderRadius: "16px",
          }}
        >
          {/* FIX: Capture all clicks inside the screen to trigger the VM Lock! */}
          <div 
            onPointerDownCapture={() => setVMLocked(true)}
            style={{ width: SCREEN_PIXEL_WIDTH, height: SCREEN_PIXEL_HEIGHT}}
          >
            {children}
          </div>
        </Html>
      </group>

    </group>
  );
}