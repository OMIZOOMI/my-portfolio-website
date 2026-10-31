"use client";

import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useFrame, useThree, type RootState } from "@react-three/fiber";
import { Environment, OrbitControls, useEnvironment, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { DesktopEnvironment } from "../desktop/DesktopEnvironment";
import { BootSequence } from "../boot/BootSequence";
import { Laptop } from "./Laptop";
import { useWindowStore } from "../window-manager/useWindowStore";
import { useSystemStore } from "../window-manager/useSystemStore";
import { getWallpaperUrl } from "../../data/wallpapers";
import { loadWallpaper } from "../desktop/wallpaperLoader";
import { getSceneLoadingStatus, getScenePreparationProgress, isCriticalSceneReady } from "./sceneReadiness";
import { WorkspaceEnvironment } from "../workspace/WorkspaceEnvironment";

export type ScenePhase = "closed" | "opening" | "open";

const FOV_DEGREES = 32;
const FRAMED_DISTANCE = 2.6;
const FRAMED_LOOK_AT_Y = 0.87;
const ELEVATION = 1.3;
const INITIAL_CAMERA_POS: [number, number, number] = [0, FRAMED_LOOK_AT_Y + 1.5, FRAMED_DISTANCE + 4.0];
const FRAMED_CAMERA_POS: [number, number, number] = [0, FRAMED_LOOK_AT_Y + ELEVATION, FRAMED_DISTANCE];
const LOOK_AT: [number, number, number] = [0, FRAMED_LOOK_AT_Y, 0];
const CAMERA_DAMP_LAMBDA = 2.4;
const SCENE_STALL_DEADLINE_MS = 30000;

function dampCamera(camera: THREE.Camera, target: [number, number, number], lookAtTarget: THREE.Vector3, delta: number) {
  camera.position.x = THREE.MathUtils.damp(camera.position.x, target[0], CAMERA_DAMP_LAMBDA, delta);
  camera.position.y = THREE.MathUtils.damp(camera.position.y, target[1], CAMERA_DAMP_LAMBDA, delta);
  camera.position.z = THREE.MathUtils.damp(camera.position.z, target[2], CAMERA_DAMP_LAMBDA, delta);
  camera.lookAt(lookAtTarget);
}

function CameraRig({ phase, reduceMotion }: { phase: ScenePhase; reduceMotion: boolean }) {
  const { camera } = useThree();
  const lookAtTarget = useMemo(() => new THREE.Vector3(...LOOK_AT), []);

  useFrame((_, delta) => {
    const target = phase === "closed" ? INITIAL_CAMERA_POS : FRAMED_CAMERA_POS;
    if (reduceMotion) {
      camera.position.set(...target);
      camera.lookAt(lookAtTarget);
      return;
    }
    dampCamera(camera, target, lookAtTarget, delta);
  });

  return null;
}

function CriticalEnvironment({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    onReady();
  }, [onReady]);

  return <Environment preset="city" />;
}

function FirstRenderProbe({ ready, onReady }: { ready: boolean; onReady: () => void }) {
  const reportedRef = useRef(false);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!ready) reportedRef.current = false;
    return () => {
      if (frameRef.current !== null) globalThis.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      reportedRef.current = false;
    };
  }, [ready]);

  useFrame(() => {
    if (!ready || reportedRef.current) return;
    reportedRef.current = true;
    // useFrame runs before the renderer paints. Report on the following
    // browser frame so the gate represents a frame that was actually handed
    // to the browser, not merely a completed React render.
    frameRef.current = globalThis.requestAnimationFrame(() => {
      frameRef.current = null;
      onReady();
    });
  });

  return null;
}

function SceneGraph({
  phase,
  onModelReady,
  onEnvironmentReady,
  onFirstRenderReady,
  onOpened,
  assetsReady,
  reduceMotion,
}: {
  phase: ScenePhase;
  onModelReady: () => void;
  onEnvironmentReady: () => void;
  onFirstRenderReady: () => void;
  onOpened: () => void;
  assetsReady: boolean;
  reduceMotion: boolean;
}) {
  const modelReady = useRef(false);
  const environmentReady = useRef(false);

  return (
    <>
      <fog attach="fog" args={["#020203", 8, 16]} />
      <ambientLight intensity={1.5} />
      <directionalLight position={[3, 5, 4]} intensity={2.5} castShadow />
      <spotLight position={[-4, 3, 2]} intensity={1.5} angle={0.4} penumbra={1} />
      <CameraRig phase={phase} reduceMotion={reduceMotion} />

      <Suspense fallback={null}>
        <CriticalEnvironment
          onReady={() => {
            if (environmentReady.current) return;
            environmentReady.current = true;
            onEnvironmentReady();
          }}
        />
        <Laptop
          phase={phase}
          reduceMotion={reduceMotion}
          onOpened={onOpened}
          onModelReady={() => {
            if (modelReady.current) return;
            modelReady.current = true;
            onModelReady();
          }}
        >
          <DesktopEnvironment />
        </Laptop>
        <FirstRenderProbe
          ready={assetsReady}
          onReady={onFirstRenderReady}
        />
      </Suspense>
    </>
  );
}

interface SceneErrorBoundaryProps {
  resetKey: number;
  onError: (error: Error) => void;
  children: ReactNode;
}

interface SceneErrorBoundaryState {
  hasError: boolean;
}

class SceneErrorBoundary extends Component<SceneErrorBoundaryProps, SceneErrorBoundaryState> {
  state: SceneErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): SceneErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  componentDidUpdate(previousProps: SceneErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

function supportsWebGL(): boolean {
  if (typeof document === "undefined") return true;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function useInitialWallpaper(url: string, enabled: boolean) {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const startupUrlRef = useRef<string | null>(null);
  const settledRef = useRef(false);

  useEffect(() => {
    if (!enabled || settledRef.current) return;
    let cancelled = false;
    // Freeze only after persisted preferences are restored. Later wallpaper
    // changes belong to the desktop and must never restart the entrance.
    startupUrlRef.current ??= url;
    void loadWallpaper(startupUrlRef.current).then(() => {
      if (!cancelled) {
        settledRef.current = true;
        setState("ready");
      }
    }).catch(() => {
      if (!cancelled) {
        settledRef.current = true;
        setState("failed");
      }
    });
    return () => { cancelled = true; };
  }, [enabled, url]);

  return state;
}

function FlatDesktopFallback({ onRetry }: { onRetry: () => void }) {
  const openAboutMe = () => {
    useWindowStore.getState().openWindow({ id: "about-me-fallback", kind: "about-me", title: "About Me" });
  };

  return (
    <div className="fixed inset-0 bg-[#111]">
      <DesktopEnvironment />
      <aside className="absolute left-1/2 top-12 z-[10001] w-[min(92vw,34rem)] -translate-x-1/2 rounded-2xl border border-white/20 bg-black/65 p-4 text-center text-white shadow-2xl backdrop-blur-xl" role="status">
        <p className="text-sm font-semibold">3D view is unavailable in this browser</p>
        <p className="mt-1 text-xs leading-5 text-white/65">The portfolio desktop is still available in flat mode.</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={openAboutMe} className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black">About me</button>
          <a href="https://github.com/OMIZOOMI" target="_blank" rel="noreferrer" className="rounded-full border border-white/25 px-3 py-1.5 text-xs font-semibold text-white">GitHub</a>
          <button type="button" onClick={onRetry} className="rounded-full border border-white/25 px-3 py-1.5 text-xs font-semibold text-white">Retry 3D</button>
        </div>
      </aside>
    </div>
  );
}

interface MacBookSceneProps {
  debugOrbit?: boolean;
}

export function MacBookScene({ debugOrbit = false }: MacBookSceneProps) {
  const [phase, setPhase] = useState<ScenePhase>("closed");
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [sceneMode, setSceneMode] = useState<"3d" | "flat">("3d");
  const [canvasKey, setCanvasKey] = useState(0);
  // Keep the server and first client render identical, including browsers
  // without WebGL. The HTML recovery UI must hydrate before Canvas starts.
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null);
  const [rendererReady, setRendererReady] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [environmentReady, setEnvironmentReady] = useState(false);
  const [firstRenderReady, setFirstRenderReady] = useState(false);
  const canvasCleanupRef = useRef<(() => void) | null>(null);

  const theme = useSystemStore((state) => state.theme);
  const wallpaper = useSystemStore((state) => state.wallpaper);
  const wallpaperMode = useSystemStore((state) => state.wallpaperMode);
  const reduceMotionSetting = useSystemStore((state) => state.reduceMotion);
  const appearanceHydrated = useSystemStore((state) => state.appearanceHydrated);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const initialWallpaperUrl = getWallpaperUrl(wallpaper, wallpaperMode, theme);
  const wallpaperState = useInitialWallpaper(initialWallpaperUrl, appearanceHydrated);

  useEffect(() => {
    useSystemStore.getState().hydrateAppearance();
    const frame = window.requestAnimationFrame(() => setWebglSupported(supportsWebGL()));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = (event: MediaQueryListEvent) => setPrefersReducedMotion(event.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);
  const reduceMotion = reduceMotionSetting || prefersReducedMotion;

  const setSceneFailure = useCallback((error: Error | string) => {
    setPhase("closed");
    const message = typeof error === "string" ? error : error.message || "The 3D scene could not be displayed.";
    // Canvas teardown can emit context-loss after an asset error. Preserve
    // the original cause until the visitor explicitly retries.
    setSceneError((current) => current ?? message);
  }, []);

  const retryScene = useCallback(() => {
    canvasCleanupRef.current?.();
    canvasCleanupRef.current = null;
    // Suspense caches rejected loads too; a new Canvas alone would repeat
    // the same cached failure without making a fresh network request.
    useGLTF.clear("/macbook.glb/scene.gltf");
    useEnvironment.clear({ preset: "city" });
    setSceneMode("3d");
    setSceneError(null);
    setWebglSupported(supportsWebGL());
    setRendererReady(false);
    setModelReady(false);
    setEnvironmentReady(false);
    setFirstRenderReady(false);
    setPhase("closed");
    setCanvasKey((key) => key + 1);
  }, []);

  useEffect(() => () => canvasCleanupRef.current?.(), []);

  const handleCanvasCreated = useCallback((state: RootState) => {
    const canvas = state.gl.domElement;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      setSceneFailure("The browser lost the 3D graphics context. You can retry or continue in flat mode.");
    };

    canvasCleanupRef.current?.();
    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvasCleanupRef.current = () => canvas.removeEventListener("webglcontextlost", handleContextLost);
    setRendererReady(true);
  }, [setSceneFailure]);

  const readiness = useMemo(
    () => ({
      rendererReady,
      modelReady,
      environmentReady,
      wallpaperReady: wallpaperState === "ready",
      wallpaperFailed: wallpaperState === "failed",
      firstRenderReady,
    }),
    [environmentReady, firstRenderReady, modelReady, rendererReady, wallpaperState]
  );
  const effectiveSceneError = sceneError ?? (
    webglSupported === false ? "WebGL is unavailable, so the 3D MacBook cannot start here." : null
  );
  const sceneReady = isCriticalSceneReady(readiness) && !effectiveSceneError && webglSupported === true;
  const loadingStatus = getSceneLoadingStatus(readiness, wallpaperState === "loading");
  useEffect(() => {
    if (sceneMode !== "3d" || sceneReady || effectiveSceneError) return;

    // Reset the deadline when a critical stage progresses. This is an error
    // path for stalled requests/initialization, never a timed reveal.
    let deadline: number | undefined;
    const watchVisibleStage = () => {
      window.clearTimeout(deadline);
      // Browsers suspend animation frames in background tabs. That is not a
      // failed render; give the stage its deadline when the visitor returns.
      if (document.visibilityState !== "visible") return;
      deadline = window.setTimeout(() => {
        setSceneFailure(`${loadingStatus} This stage took too long. Retry the 3D view or open the flat desktop.`);
      }, SCENE_STALL_DEADLINE_MS);
    };
    watchVisibleStage();
    document.addEventListener("visibilitychange", watchVisibleStage);
    return () => {
      window.clearTimeout(deadline);
      document.removeEventListener("visibilitychange", watchVisibleStage);
    };
  }, [canvasKey, effectiveSceneError, loadingStatus, sceneMode, sceneReady, setSceneFailure]);
  const scenePhase: ScenePhase = sceneReady
    ? phase === "open" ? "open" : "opening"
    : "closed";

  return (
    <div style={{ position: "fixed", inset: 0, background: "#283b3d", isolation: "isolate", overflow: "clip" }}>
      {sceneMode === "flat" ? (
        <FlatDesktopFallback onRetry={retryScene} />
      ) : (
        <>
          <WorkspaceEnvironment sceneUsable={sceneReady} reduceMotion={reduceMotion} />
          <div data-laptop-scene style={{ position: "absolute", inset: 0, zIndex: 1 }}>
          {webglSupported === true && appearanceHydrated && (
            <SceneErrorBoundary key={`scene-${canvasKey}`} resetKey={canvasKey} onError={setSceneFailure}>
              <Canvas
                shadows
                dpr={[1, 2]}
                gl={{ antialias: true, alpha: true }}
                camera={{ position: INITIAL_CAMERA_POS, fov: FOV_DEGREES, near: 0.1, far: 50 }}
                onCreated={handleCanvasCreated}
                style={{ touchAction: "auto", overflow: "clip" }}
              >
                <SceneGraph
                  phase={scenePhase}
                  onModelReady={() => setModelReady(true)}
                  onEnvironmentReady={() => setEnvironmentReady(true)}
                  onFirstRenderReady={() => setFirstRenderReady(true)}
                  onOpened={() => setPhase("open")}
                  assetsReady={modelReady && environmentReady}
                  reduceMotion={reduceMotion}
                />
                {debugOrbit && <OrbitControls target={LOOK_AT} />}
              </Canvas>
            </SceneErrorBoundary>
          )}
          </div>

          <BootSequence
            key={`boot-${canvasKey}`}
            ready={sceneReady}
            status={loadingStatus}
            progress={getScenePreparationProgress(readiness)}
            reduceMotion={reduceMotion}
            error={effectiveSceneError}
            onRetry={retryScene}
            onUseFallback={() => setSceneMode("flat")}
          />
        </>
      )}
    </div>
  );
}
