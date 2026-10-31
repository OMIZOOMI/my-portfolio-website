# Stage 7 gesture checks

These checks use **synthetic, hand-authored 21-point landmark fixtures**. They
exercise the production classifier and trigger gate without a camera, MediaPipe
landmark inference, browser graphics driver, or real Windows/Safari device. They
are not live camera or operating-system compatibility evidence.

Run `node --test tests/gestures.test.mjs`. The 12 targeted tests passed on the
development Mac; fixture coordinates are in `tests/fixtures/hand-landmarks.mjs`.

| Supported pose | Existing effect, preserved | Existing status label |
| --- | --- | --- |
| Peace: index and middle extended, ring and pinky curled | Confetti burst | ✌️ Peace sign detected |
| Thumbs up: thumb extended upward, other four fingers curled | Floating likes (👍, 💙, ✨) | 👍 Thumbs up detected |
| No hand, closed fist, open palm, unsupported pose | No new effect | No new detection label |

The preview alone is mirrored in CSS. The classifier receives the original
MediaPipe image coordinates. Reflecting every x coordinate around the image
center leaves wrist-to-fingertip distances and the thumb's vertical checks
unchanged. There is no landmark-positioned effect that needs a second mirror.
The fixtures verify both supported poses before and after horizontal reflection,
and at several scales and image positions.

The existing geometric threshold is unchanged: a fingertip must be strictly
farther than **1.15 times** its middle joint's distance from the wrist. Thumbs up
also requires the thumb tip above its IP joint and the middle MCP in image y
coordinates. Peace deliberately ignores thumb position. An incomplete or
non-finite xy frame now returns `none` rather than throwing or partially
classifying it. Coordinates outside the image are not artificially clamped.

The trigger gate uses the first eligible recognized frame; it adds no hold-time
debounce. A recognized pose produces one effect, even when held beyond several
cooldown intervals. Releasing to no hand or changing pose re-arms it, while the
global **2,500 ms** cooldown remains in force. A pose entered during cooldown can
fire once at expiry if it is still present; a pose that disappeared cannot fire
later. Reset clears both pose and cooldown state for a new live session. Fixture
tests cover those boundaries and malformed clock samples.

The heuristic still expects a hand generally facing the camera. Strong rotation,
occlusion, lighting, detector errors, and actual camera/driver differences need
the real-device acceptance matrix; these fixtures do not prove them.
