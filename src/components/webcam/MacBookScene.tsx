"use client";

import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, type RootState } from "@react-three/fiber";
import { Environment, OrbitControls, useEnvironment, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { BootSequence } from "../boot/BootSequence";
import { Laptop } from "./Laptop";
import { useSystemStore } from "../window-manager/useSystemStore";
import { getWallpaperUrl } from "../../data/wallpapers";
import { loadWallpaper } from "../desktop/wallpaperLoader";
import { getSceneLoadingStatus, getScenePreparationProgress, isCriticalSceneReady } from "./sceneReadiness";
import { useDisplayStore } from "../window-manager/useDisplayStore";
import { ProjectionViewport } from "./ProjectionViewport";

const FOV_DEGREES = 32;
const FRAMED_DISTANCE = 2.6;
const FRAMED_LOOK_AT_Y = 0.87;
const ELEVATION = 1.3;
const FRAMED_CAMERA_POS: [number, number, number] = [0, FRAMED_LOOK_AT_Y + ELEVATION, FRAMED_DISTANCE];
const LOOK_AT = new THREE.Vector3(0, FRAMED_LOOK_AT_Y, 0);
const WORKSPACE_LIGHTING = "/lighting/potsdamer_platz_1k.hdr";
const SCENE_STALL_DEADLINE_MS = 30000;

function CriticalEnvironment({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    onReady();
  }, [onReady]);

  return <Environment files={WORKSPACE_LIGHTING} />;
}

function SceneGraph({
  onModelReady,
  onEnvironmentReady,
  onFirstRenderReady,
  assetsReady,
  interactive,
  reduceMotion,
  desktop,
}: {
  onModelReady: () => void;
  onEnvironmentReady: () => void;
  onFirstRenderReady: () => void;
  assetsReady: boolean;
  interactive: boolean;
  reduceMotion: boolean;
  desktop: ReactNode;
}) {
  const modelReady = useRef(false);
  const environmentReady = useRef(false);

  return (
    <>
      <fog attach="fog" args={["#020203", 8, 16]} />
      <ambientLight intensity={1.5} />
      <directionalLight position={[3, 5, 4]} intensity={2.5} castShadow />
      <spotLight position={[-4, 3, 2]} intensity={1.5} angle={0.4} penumbra={1} />
      <Suspense fallback={null}>
        <CriticalEnvironment
          onReady={() => {
            if (environmentReady.current) return;
            environmentReady.current = true;
            onEnvironmentReady();
          }}
        />
        <Laptop
          assetsReady={assetsReady}
          interactive={interactive}
          reduceMotion={reduceMotion}
          onFirstRender={onFirstRenderReady}
          onModelReady={() => {
            if (modelReady.current) return;
            modelReady.current = true;
            onModelReady();
          }}
        >
          {desktop}
        </Laptop>
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

interface MacBookSceneProps {
  debugOrbit?: boolean;
  active?: boolean;
  onDesktopAvailabilityChange?: (available: boolean) => void;
  onProjectionReadyChange: (ready: boolean) => void;
  desktopPainted: boolean;
  desktop: ReactNode;
  desktopChromeReady: boolean;
  backdropReady: boolean;
  onUseScreenView: () => void;
}

export function MacBookScene({ debugOrbit = false, active = true, onDesktopAvailabilityChange, onProjectionReadyChange, desktopPainted, desktop, desktopChromeReady, backdropReady, onUseScreenView }: MacBookSceneProps) {
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [canvasKey, setCanvasKey] = useState(0);
  // Keep the server and first client render identical, including browsers
  // without WebGL. The HTML recovery UI must hydrate before Canvas starts.
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null);
  const [rendererReady, setRendererReady] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [environmentReady, setEnvironmentReady] = useState(false);
  const [firstRenderReady, setFirstRenderReady] = useState(false);
  const [startupComplete, setStartupComplete] = useState(false);
  const canvasCleanupRef = useRef<(() => void) | null>(null);

  const theme = useSystemStore((state) => state.theme);
  const wallpaper = useSystemStore((state) => state.wallpaper);
  const wallpaperMode = useSystemStore((state) => state.wallpaperMode);
  const reduceMotionSetting = useSystemStore((state) => state.reduceMotion);
  const appearanceHydrated = useSystemStore((state) => state.appearanceHydrated);
  const displayHydrated = useDisplayStore((state) => state.hydrated);
  const screenView = useDisplayStore((state) => state.screenView);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const initialWallpaperUrl = getWallpaperUrl(wallpaper, wallpaperMode, theme);
  const wallpaperState = useInitialWallpaper(initialWallpaperUrl, appearanceHydrated);

  useEffect(() => {
    useSystemStore.getState().hydrateAppearance();
    useDisplayStore.getState().hydrate();
    const frame = window.requestAnimationFrame(() => {
      const supported = supportsWebGL();
      if (supported) useEnvironment.preload({ files: WORKSPACE_LIGHTING });
      setWebglSupported(supported);
    });
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
    useEnvironment.clear({ files: WORKSPACE_LIGHTING });
    setSceneError(null);
    setWebglSupported(supportsWebGL());
    setRendererReady(false);
    setModelReady(false);
    setEnvironmentReady(false);
    setFirstRenderReady(false);
    setStartupComplete(false);
    setCanvasKey((key) => key + 1);
  }, []);

  useEffect(() => () => canvasCleanupRef.current?.(), []);

  const handleCanvasCreated = useCallback((state: RootState) => {
    state.camera.lookAt(LOOK_AT);
    const canvas = state.gl.domElement;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      setSceneFailure("The browser lost the 3D graphics context. You can retry or continue in Screen view.");
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
      desktopChromeReady,
      backdropReady,
    }),
    [backdropReady, desktopChromeReady, environmentReady, firstRenderReady, modelReady, rendererReady, wallpaperState]
  );
  const effectiveSceneError = sceneError ?? (
    webglSupported === false ? "WebGL is unavailable, so the 3D MacBook cannot start here." : null
  );
  const sceneReady = isCriticalSceneReady(readiness) && !effectiveSceneError && webglSupported === true;
  const readyToReveal = sceneReady && desktopPainted;
  const loadingStatus = sceneReady && !desktopPainted ? "Preparing the laptop screen…" : getSceneLoadingStatus(readiness);
  useEffect(() => {
    if (!active || readyToReveal || effectiveSceneError) return;

    // Reset the deadline when a critical stage progresses. This is an error
    // path for stalled requests/initialization, never a timed reveal.
    let deadline: number | undefined;
    const watchVisibleStage = () => {
      window.clearTimeout(deadline);
      // Browsers suspend animation frames in background tabs. That is not a
      // failed render; give the stage its deadline when the visitor returns.
      if (document.visibilityState !== "visible") return;
      deadline = window.setTimeout(() => {
        setSceneFailure(`${loadingStatus} This stage took too long. Retry the 3D view or continue in Screen view.`);
      }, SCENE_STALL_DEADLINE_MS);
    };
    watchVisibleStage();
    document.addEventListener("visibilitychange", watchVisibleStage);
    return () => {
      window.clearTimeout(deadline);
      document.removeEventListener("visibilitychange", watchVisibleStage);
    };
  }, [active, canvasKey, effectiveSceneError, loadingStatus, readyToReveal, setSceneFailure]);
  useLayoutEffect(() => {
    onProjectionReadyChange(sceneReady);
    return () => onProjectionReadyChange(false);
  }, [onProjectionReadyChange, sceneReady]);
  const desktopAvailable = readyToReveal && startupComplete;
  useLayoutEffect(() => {
    onDesktopAvailabilityChange?.(desktopAvailable);
  }, [desktopAvailable, onDesktopAvailabilityChange]);
  const handleStartupComplete = useCallback(() => setStartupComplete(true), []);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2, visibility: screenView && !desktopAvailable ? "hidden" : undefined }}>
      <ProjectionViewport>
        {webglSupported === true && appearanceHydrated && displayHydrated && (
        <SceneErrorBoundary key={`scene-${canvasKey}`} resetKey={canvasKey} onError={setSceneFailure}>
          <Canvas
            frameloop={active ? "demand" : "never"}
            shadows
            resize={{ offsetSize: true }}
            dpr={[1, 2]}
            gl={{ antialias: true, alpha: true }}
            camera={{ position: FRAMED_CAMERA_POS, fov: FOV_DEGREES, near: 0.1, far: 50 }}
            onCreated={handleCanvasCreated}
            style={{ touchAction: "auto", overflow: "clip" }}
          >
            <SceneGraph
              onModelReady={() => setModelReady(true)}
              onEnvironmentReady={() => setEnvironmentReady(true)}
              onFirstRenderReady={() => setFirstRenderReady(true)}
              assetsReady={modelReady && environmentReady}
              interactive={desktopAvailable}
              reduceMotion={reduceMotion}
              desktop={desktop}
            />
            {debugOrbit && <OrbitControls target={[0, FRAMED_LOOK_AT_Y, 0]} />}
          </Canvas>
        </SceneErrorBoundary>
      )}
      </ProjectionViewport>

      <BootSequence
        key={`boot-${canvasKey}`}
        ready={readyToReveal}
        status={loadingStatus}
        progress={getScenePreparationProgress(readiness)}
        reduceMotion={reduceMotion}
        error={effectiveSceneError}
        onRetry={retryScene}
        onUseFallback={onUseScreenView}
        onComplete={handleStartupComplete}
      />
    </div>
  );
}
