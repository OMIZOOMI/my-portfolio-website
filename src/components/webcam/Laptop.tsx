"use client";

import { useRef, useEffect, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { Matrix4, type Group } from "three";
import type { ScenePhase } from "./MacBookScene";
import { Model as MacbookModel } from './Macbook';
import styles from "./Laptop.module.css";
import { ScreenSurface } from "./ScreenSurface";
import { laptopProjectionMatrix } from "./screenViewGeometry";

// Import our store to trigger the lock
import { useWindowStore } from "../window-manager/useWindowStore";

export const BASE_SIZE: [number, number, number] = [2.0, 0.06, 1.4];
export const LID_SIZE: [number, number, number] = [2.0, 0.05, 1.35];
export const HINGE_Y = 0.03;
export const HINGE_Z = -0.68;

const SCREEN_PIXEL_WIDTH = 1400;
const SCREEN_PIXEL_HEIGHT = 900;
export const SCREEN_WORLD_WIDTH = 1.78;
export const SCREEN_WORLD_HEIGHT = (SCREEN_WORLD_WIDTH * SCREEN_PIXEL_HEIGHT) / SCREEN_PIXEL_WIDTH;
const SCREEN_SCALE = SCREEN_WORLD_WIDTH / SCREEN_PIXEL_WIDTH;
// Retain the previous display calibration, including Drei's 10 / 400 factor.
const SCREEN_UNITS_PER_PIXEL = SCREEN_SCALE * 7.28 * (10 / 400);
const viewportOrigin = (): [number, number] => [0, 0];

export const LAPTOP_TOTAL_HEIGHT = 2.0; 
export const SCREEN_CENTER_WORLD_Y = 1.0;

interface LaptopProps {
  phase: ScenePhase;
  reduceMotion?: boolean;
  onOpened?: () => void;
  onModelReady?: () => void;
  children?: ReactNode;
}

export function Laptop({ phase, reduceMotion = false, onOpened, onModelReady, children }: LaptopProps) {
  const hasFiredOpened = useRef(false);
  const displayPlane = useRef<Group>(null);
  const projection = useRef<HTMLDivElement>(null);
  const lastFrame = useRef<{
    node: HTMLDivElement; view: Matrix4; projection: Matrix4; plane: Matrix4; width: number; height: number;
  } | null>(null);
  const setVMLocked = useWindowStore((s) => s.setVMLocked);

  useFrame(({ camera, size }) => {
    if (!hasFiredOpened.current && phase === "opening") {
      hasFiredOpened.current = true;
      onOpened?.();
    }
    const plane = displayPlane.current;
    const element = projection.current;
    if (!plane || !element || !size.width || !size.height) return;
    camera.updateMatrixWorld();
    plane.updateWorldMatrix(true, false);
    const previous = lastFrame.current;
    if (previous?.node === element && previous.width === size.width && previous.height === size.height
      && previous.view.equals(camera.matrixWorldInverse) && previous.projection.equals(camera.projectionMatrix)
      && previous.plane.equals(plane.matrixWorld)) return;
    const transform = laptopProjectionMatrix(SCREEN_PIXEL_WIDTH, SCREEN_PIXEL_HEIGHT, SCREEN_UNITS_PER_PIXEL, plane.matrixWorld, camera, size);
    if (!transform) return;
    element.style.setProperty("--laptop-screen-transform", transform);
    lastFrame.current = {
      node: element, width: size.width, height: size.height,
      view: (previous?.view ?? new Matrix4()).copy(camera.matrixWorldInverse),
      projection: (previous?.projection ?? new Matrix4()).copy(camera.projectionMatrix),
      plane: (previous?.plane ?? new Matrix4()).copy(plane.matrixWorld),
    };
  });

  useEffect(() => {
    if (phase === "closed") hasFiredOpened.current = false;
  }, [phase]);

  return (
    <group position={[0, 0, 0]} scale={[6.9, 6.9, 6.9]}>
      
      <group>
        <MacbookModel rotation={[Math.PI, 0, 0]} onReady={onModelReady} reduceMotion={reduceMotion} />
      </group>

      <group ref={displayPlane} position={[0.0002, 0.09, -0.19]} rotation={[-0.355, 0, 0]}>
        {/* Keep one HTML root in both views. Only the screen's geometry changes. */}
        <Html
          ref={projection}
          calculatePosition={viewportOrigin}
          wrapperClass={styles.screenPortal}
          className={styles.projection}
          style={{ width: SCREEN_PIXEL_WIDTH, height: SCREEN_PIXEL_HEIGHT }}
        >
          {/* FIX: Capture all clicks inside the screen to trigger the VM Lock! */}
          <div 
            data-desktop-projection
            onPointerDownCapture={() => setVMLocked(true)}
          >
            <ScreenSurface reduceMotion={reduceMotion}>{children}</ScreenSurface>
          </div>
        </Html>
      </group>

    </group>
  );
}
