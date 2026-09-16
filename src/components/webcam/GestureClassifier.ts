/**
 * Heuristic hand-gesture classifier for MediaPipe's 21-point hand landmark
 * model. This is intentionally simple — comparing each fingertip's distance
 * from the wrist against its own middle joint's distance — not a trained
 * classifier. It works well for a hand held up facing the camera, which
 * covers the "Try Me" demo case; a trained model would be the next step if
 * you want it robust to more hand orientations.
 */

export interface Landmark {
    x: number;
    y: number;
    z: number;
  }
  
  export type Gesture = "peace" | "thumbsup" | "none";
  
  const WRIST = 0;
  const TIP = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 };
  const PIP = { thumb: 3, index: 6, middle: 10, ring: 14, pinky: 18 };
  const MIDDLE_MCP = 9;
  
  // Margin above 1.0 avoids flicker right at the extended/curled boundary.
  const EXTENDED_MARGIN = 1.15;
  
  function dist(a: Landmark, b: Landmark) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  
  function isExtended(landmarks: Landmark[], tipIndex: number, pipIndex: number) {
    const wrist = landmarks[WRIST];
    return dist(landmarks[tipIndex], wrist) > dist(landmarks[pipIndex], wrist) * EXTENDED_MARGIN;
  }
  
  export function classifyGesture(landmarks: Landmark[]): Gesture {
    if (!landmarks || landmarks.length < 21) return "none";
  
    const thumb = isExtended(landmarks, TIP.thumb, PIP.thumb);
    const index = isExtended(landmarks, TIP.index, PIP.index);
    const middle = isExtended(landmarks, TIP.middle, PIP.middle);
    const ring = isExtended(landmarks, TIP.ring, PIP.ring);
    const pinky = isExtended(landmarks, TIP.pinky, PIP.pinky);

    // Thumbs up: thumb extended and pointing UP in image space (tip above its
    // own IP joint and above the middle knuckle), all four fingers curled.
    // The upward check separates it from a sideways thumb / loose fist.
    // Note: image y grows downward, so "above" means smaller y.
    const thumbPointsUp =
      landmarks[TIP.thumb].y < landmarks[PIP.thumb].y &&
      landmarks[TIP.thumb].y < landmarks[MIDDLE_MCP].y;
    if (thumb && thumbPointsUp && !index && !middle && !ring && !pinky) return "thumbsup";
  
    // Peace sign: index + middle extended, ring + pinky curled. Thumb is
    // deliberately not checked — its resting position varies too much
    // between people to be a reliable signal.
    if (index && middle && !ring && !pinky) return "peace";
  
    return "none";
  }
  