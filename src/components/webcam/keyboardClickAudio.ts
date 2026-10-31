import { KEYBOARD_SOUND_PCM, KEY_PRESS_SAMPLE_RATE, type KeyboardSoundPhase, type KeyboardSoundRole } from "./keyboardPressSample";

const recordings = new Map<string, Float32Array>();
function keyRecording(role: KeyboardSoundRole, phase: KeyboardSoundPhase, variant: number) {
  const bank = KEYBOARD_SOUND_PCM[role][phase];
  const index = Math.abs(Math.trunc(variant)) % bank.length;
  const key = `${role}:${phase}:${index}`;
  const cached = recordings.get(key);
  if (cached) return cached;
  const bytes = atob(bank[index]);
  const recording = new Float32Array(bytes.length / 2);
  for (let i = 0; i < recording.length; i++) {
    const value = bytes.charCodeAt(i * 2) | bytes.charCodeAt(i * 2 + 1) << 8;
    recording[i] = (value >= 32768 ? value - 65536 : value) / 32768;
  }
  recordings.set(key, recording);
  return recording;
}

/** Real Cream switch rows, with the quieter return recorded separately. */
export function keyboardClickSamples(sampleRate: number, variant: number, role: KeyboardSoundRole = "default", phase: KeyboardSoundPhase = "press") {
  const recording = keyRecording(role, phase, variant);
  const step = KEY_PRESS_SAMPLE_RATE / sampleRate;
  const samples = new Float32Array(Math.ceil(recording.length / step));
  for (let i = 0; i < samples.length; i++) {
    const position = i * step, index = Math.floor(position), fraction = position - index;
    samples[i] = (recording[index] ?? 0) * (1 - fraction) + (recording[index + 1] ?? 0) * fraction;
  }
  samples[0] = samples[samples.length - 1] = 0;
  return samples;
}

export function createKeyboardClickAudio(makeContext: () => AudioContext | null) {
  let context: AudioContext | null = null, gain: GainNode | null = null;
  let disposed = false, serial = 0, pending = 0;
  const buffers = new Map<string, AudioBuffer>();
  const voices = new Set<AudioBufferSourceNode>();
  const start = (code: string, phase: KeyboardSoundPhase = "press") => {
    if (disposed || !context || context.state !== "running" || !gain) return;
    const role: KeyboardSoundRole = code === "Space" ? "space" : code === "Enter" ? "enter" : code === "Backspace" || code === "Delete" ? "backspace" : "default";
    const variation = phase === "press" && role === "default" ? serial++ % 5 : 0;
    const key = `${role}:${phase}:${variation}`;
    let buffer = buffers.get(key);
    if (!buffer) {
      const data = keyboardClickSamples(context.sampleRate, variation, role, phase);
      buffer = context.createBuffer(1, data.length, context.sampleRate);
      buffer.copyToChannel(data, 0);
      buffers.set(key, buffer);
    }
    if (voices.size >= 8) {
      const oldest = voices.values().next().value!;
      oldest.onended = null;
      try { oldest.stop(); } catch {}
      oldest.disconnect(); voices.delete(oldest);
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.onended = () => { source.disconnect(); voices.delete(source); };
    voices.add(source);
    source.start();
  };
  return {
    play(code: string) {
      if (disposed) return;
      try {
        if (!context) {
          context = makeContext();
          if (!context) return;
          gain = context.createGain();
          gain.gain.value = 0.16;
          gain.connect(context.destination);
        }
        if (context.state === "running") start(code);
        else {
          const ticket = ++pending;
          // Resume directly from the trusted key event; don't replay a backlog.
          void context.resume().then(() => { if (ticket === pending) start(code); }).catch(() => {});
        }
      } catch { /* Unsupported/blocked audio must never interrupt typing. */ }
    },
    release(code: string) {
      // A stray keyup must not create/unlock audio or replay a pending press.
      try { start(code, "release"); } catch {}
    },
    dispose() {
      disposed = true; pending++;
      for (const voice of voices) { voice.onended = null; try { voice.stop(); } catch {} voice.disconnect(); }
      voices.clear(); buffers.clear(); gain?.disconnect();
      if (context && context.state !== "closed") void context.close().catch(() => {});
      context = null;
    },
  };
}
