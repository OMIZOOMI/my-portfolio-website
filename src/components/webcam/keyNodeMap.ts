/**
 * Maps browser KeyboardEvent.code values (physical key position, layout-
 * independent) to node names in your .glb. Assumes each key was authored
 * as a separately-named mesh/object — e.g. in Blender, named "Key_A",
 * "Key_Space", etc. — matching the pattern below. If your model uses a
 * different convention, this is the only file you need to edit; nothing
 * in usePhysicalInputState.ts or TactileKeyboard.tsx knows or cares about
 * naming — they just iterate whatever this map contains.
 */

const LETTER_KEYS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").reduce<Record<string, string>>((map, letter) => {
    map[`Key${letter}`] = `Key_${letter}`;
    return map;
  }, {});
  
  const DIGIT_KEYS = "0123456789".split("").reduce<Record<string, string>>((map, digit) => {
    map[`Digit${digit}`] = `Key_${digit}`;
    return map;
  }, {});
  
  // The non-alphanumeric keys someone typing on the page will actually hit
  // most often. Extend this object to cover more of your keyboard (arrows,
  // punctuation, function row) — same pattern, just more entries.
  const SPECIAL_KEYS: Record<string, string> = {
    Space: "Key_Space",
    Enter: "Key_Enter",
    Backspace: "Key_Backspace",
    Tab: "Key_Tab",
    ShiftLeft: "Key_ShiftLeft",
    ShiftRight: "Key_ShiftRight",
    ControlLeft: "Key_ControlLeft",
    ControlRight: "Key_ControlRight",
    AltLeft: "Key_AltLeft",
    AltRight: "Key_AltRight",
    Escape: "Key_Escape",
    CapsLock: "Key_CapsLock",
  };
  
  export const KEY_CODE_TO_NODE_NAME: Record<string, string> = {
    ...LETTER_KEYS,
    ...DIGIT_KEYS,
    ...SPECIAL_KEYS,
  };
  
  export const TRACKPAD_NODE_NAME = "Trackpad";