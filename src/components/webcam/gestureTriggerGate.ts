import type { Gesture } from "./GestureClassifier";

/**
 * One effect per entered pose, with a global minimum interval between effects.
 * A pose entered during cooldown remains eligible when cooldown ends, but an
 * already-triggered held pose must be released/changed before it can fire again.
 * Use a monotonic millisecond clock (performance.now) and reset per live session.
 */
export function createGestureTriggerGate(cooldownMs = 2500) {
  const interval = Number.isFinite(cooldownMs) ? Math.max(0, cooldownMs) : 2500;
  let currentPose: Gesture = "none";
  let triggeredCurrentPose = false;
  let cooldownUntil = 0;

  return {
    update(gesture: Gesture, now: number): Exclude<Gesture, "none"> | null {
      if (!Number.isFinite(now)) return null;
      if (gesture !== currentPose) {
        currentPose = gesture;
        triggeredCurrentPose = false;
      }
      if (gesture === "none" || triggeredCurrentPose || now < cooldownUntil) return null;
      triggeredCurrentPose = true;
      cooldownUntil = now + interval;
      return gesture;
    },
    reset() {
      currentPose = "none";
      triggeredCurrentPose = false;
      cooldownUntil = 0;
    },
  };
}
