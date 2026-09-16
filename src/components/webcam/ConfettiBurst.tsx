"use client";

/**
 * <ConfettiBurst/>
 * npm install three @react-three/fiber
 *
 * A short-lived R3F Canvas mounted only for the duration of the burst —
 * it self-unmounts after LIFETIME_MS rather than staying alive as an idle
 * WebGL context, which matters here since it's already running nested
 * inside the outer MacBook scene's canvas + the <Html> DOM portal.
 */

import { useMemo, useRef, useEffect, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

const PARTICLE_COUNT = 70;
const COLORS = ["#ff5f57", "#ffb454", "#34c759", "#4c8dff", "#8a5cf6", "#ffffff"];
const LIFETIME_MS = 2600;
const GRAVITY = -4.5;
const DRAG = 0.985;

interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  color: string;
}

function useParticles() {
  return useMemo<Particle[]>(() => {
    return Array.from({ length: PARTICLE_COUNT }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 2.5;
      return {
        position: new THREE.Vector3((Math.random() - 0.5) * 0.5, -0.5, 0),
        velocity: new THREE.Vector3(
          Math.cos(angle) * speed * 0.6,
          2.5 + Math.random() * 2,
          (Math.random() - 0.5) * 1.5
        ),
        spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      };
    });
  }, []);
}

function ConfettiField() {
  const particles = useParticles();
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const elapsedRef = useRef(0);

  useFrame((_, delta) => {
    elapsedRef.current += delta;
    const fade = Math.max(0, 1 - elapsedRef.current / (LIFETIME_MS / 1000));

    particles.forEach((p, i) => {
      p.velocity.y += GRAVITY * delta;
      p.velocity.multiplyScalar(DRAG);
      p.position.addScaledVector(p.velocity, delta);

      const mesh = meshRefs.current[i];
      if (!mesh) return;

      mesh.position.copy(p.position);
      mesh.rotation.x += p.spin.x * delta;
      mesh.rotation.y += p.spin.y * delta;
      mesh.rotation.z += p.spin.z * delta;
      (mesh.material as THREE.MeshBasicMaterial).opacity = fade;
    });
  });

  return (
    <>
      {particles.map((p, i) => (
        <mesh key={i} ref={(el) => (meshRefs.current[i] = el)} position={p.position}>
          <planeGeometry args={[0.12, 0.06]} />
          <meshBasicMaterial color={p.color} transparent opacity={1} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </>
  );
}

export function ConfettiBurst() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = setTimeout(() => setVisible(false), LIFETIME_MS);
    return () => clearTimeout(id);
  }, []);

  if (!visible) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <Canvas
        orthographic
        camera={{ zoom: 80, position: [0, 0, 10] }}
        gl={{ alpha: true }}
        style={{ background: "transparent" }}
      >
        <ConfettiField />
      </Canvas>
    </div>
  );
}
