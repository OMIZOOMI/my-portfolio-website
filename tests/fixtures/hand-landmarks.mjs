/**
 * Synthetic, controlled MediaPipe-shaped 21-point landmark fixtures.
 * These are hand-authored coordinates, not camera recordings or evidence of
 * Windows, Safari, physical camera, or MediaPipe landmark-detection accuracy.
 * Image coordinates: x grows rightward, y downward; z is zero in this suite.
 */
const point = (x, y) => ({ x, y, z: 0 });

export function handPose(name) {
  const hand = [
    point(0.50, 0.86), // wrist
    point(0.43, 0.76), point(0.38, 0.71), point(0.35, 0.66), point(0.40, 0.73),
    point(0.43, 0.68), point(0.42, 0.52), point(0.44, 0.62), point(0.45, 0.71),
    point(0.50, 0.64), point(0.50, 0.49), point(0.51, 0.61), point(0.51, 0.70),
    point(0.57, 0.68), point(0.58, 0.54), point(0.57, 0.64), point(0.56, 0.72),
    point(0.63, 0.73), point(0.66, 0.62), point(0.64, 0.69), point(0.61, 0.77),
  ];
  if (name === "peace" || name === "open-palm") {
    hand[7] = point(0.41, 0.37);
    hand[8] = point(0.40, 0.24);
    hand[11] = point(0.50, 0.34);
    hand[12] = point(0.50, 0.20);
  }
  if (name === "thumbsup" || name === "open-palm") {
    hand[3] = point(0.34, 0.53);
    hand[4] = point(0.33, 0.29);
  }
  if (name === "open-palm") {
    hand[15] = point(0.59, 0.40);
    hand[16] = point(0.60, 0.28);
    hand[19] = point(0.68, 0.49);
    hand[20] = point(0.70, 0.38);
  }
  return hand;
}

export function mirrorHand(hand) {
  return hand.map(({ x, y, z }) => ({ x: 1 - x, y, z }));
}

export function scaleAndTranslateHand(hand, scale, dx, dy) {
  return hand.map(({ x, y, z }) => ({ x: x * scale + dx, y: y * scale + dy, z: z * scale }));
}

export const expectedGestureEffects = Object.freeze({
  peace: { effect: "confetti", label: "✌️ Peace sign detected" },
  thumbsup: { effect: "floating-likes", label: "👍 Thumbs up detected" },
});
