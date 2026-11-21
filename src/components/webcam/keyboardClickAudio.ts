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
  let disposed = false, serial = 0;
  let pending: { code: string; time: number } | null = null;
  let resuming: AudioContext | null = null;
  const buffers = new Map<string, AudioBuffer>();
  const voices = new Set<AudioBufferSourceNode>();
  const stop = (voice: AudioBufferSourceNode) => {
    voice.onended = null;
    try { voice.stop(); } catch {}
    voice.disconnect();
    voices.delete(voice);
  };
  const silence = () => {
    pending = null;
    for (const voice of voices) stop(voice);
  };
  const detachContext = () => {
    silence();
    buffers.clear();
    gain?.disconnect();
    const old = context;
    if (old) {
      old.onstatechange = null;
      if (old.state !== "closed") void old.close().catch(() => {});
    }
    context = null;
    gain = null;
    resuming = null;
  };
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
    if (voices.size >= 8) stop(voices.values().next().value!);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.onended = () => { source.disconnect(); voices.delete(source); };
    voices.add(source);
    try { source.start(); } catch { stop(source); }
  };
  const flush = () => {
    if (context?.state !== "running") return;
    const click = pending;
    pending = null;
    if (click && performance.now() - click.time <= 200) {
      try { start(click.code); } catch {}
    }
  };
  return {
    play(code: string) {
      if (disposed) return;
      try {
        if (context?.state === "closed") detachContext();
        if (!context) {
          context = makeContext();
          if (!context) return;
          gain = context.createGain();
          gain.gain.value = 0.16;
          gain.connect(context.destination);
          // Safari can report the running state separately from the resume promise.
          const current = context;
          current.onstatechange = () => { if (context === current) flush(); };
        }
        if (context.state === "running") {
          pending = null;
          start(code);
        } else {
          pending = { code, time: performance.now() };
          const current = context;
          if (resuming === current) return;
          // Resume directly from a trusted key and keep only the freshest click.
          const resumed = current.resume();
          resuming = current;
          const settled = () => {
            if (resuming !== current) return;
            resuming = null;
            flush();
          };
          void resumed.then(settled, settled);
        }
      } catch { /* Unsupported/blocked audio must never interrupt typing. */ }
    },
    release(code: string) {
      // A stray keyup must not create/unlock audio or replay a pending press.
      try { start(code, "release"); } catch {}
    },
    silence,
    dispose() {
      disposed = true;
      detachContext();
    },
  };
}
