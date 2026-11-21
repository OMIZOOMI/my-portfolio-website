export type HeatSinkCue = "move" | "pickup" | "bank" | "bonus" | "vent" | "overheat" | "start" | "heat-hit" | "upgrade";

interface Hit {
  delay: number;
  duration: number;
  hz: number;
  rasp: number;
  strength: number;
}

const hit = (delay: number, duration: number, hz: number, rasp: number, strength: number): Hit => ({ delay, duration, hz, rasp, strength });
const tier = (intensity: number) => Math.max(1, Math.min(8, Math.trunc(Number.isFinite(intensity) ? intensity : 1)));

function cueHits(cue: HeatSinkCue, intensity: number, variation: number): Hit[] {
  switch (cue) {
    case "move": return [hit(0, .028, 316 + variation * 17, .46, .34)];
    case "pickup": return [hit(0, .046, 355 + intensity * 35, .36, .48 + intensity * .024)];
    case "bank": return [hit(0, .069, 179 + intensity * 5, .48, .81), hit(.018, .066, 238, .33, .41)];
    case "bonus": return [hit(0, .046, 329, .37, .48), hit(.044, .064, 431, .32, .62)];
    case "vent": return [hit(0, .112, 178, .88, .32), hit(.027, .038, 263, .24, .36)];
    case "overheat": return [hit(0, .079, 146, .37, .58), hit(.057, .10, 101, .31, .38)];
    case "start": return [hit(0, .035, 263, .43, .36), hit(.055, .064, 348, .30, .58)];
    case "heat-hit": return [hit(0, .068, 188, .73, .62), hit(.032, .048, 129, .25, .35)];
    case "upgrade": return [hit(0, .038, 364, .31, .45), hit(.042, .049, 485, .28, .54), hit(.095, .066, 546, .22, .44)];
  }
}

export function heatSinkCueSamples(sampleRate: number, cue: HeatSinkCue, intensity = 1, variation = 0) {
  const hits = cueHits(cue, tier(intensity), variation);
  const length = Math.max(...hits.map(({ delay, duration }) => delay + duration));
  const output = new Float32Array(Math.ceil(sampleRate * length) + 1);
  let random = (98_731 + 71 * variation) | 0;
  const fastCutoff = 1 - Math.exp(-2 * Math.PI * 3_100 / sampleRate);
  const slowCutoff = 1 - Math.exp(-2 * Math.PI * 430 / sampleRate);
  for (const { delay, duration, hz, rasp, strength } of hits) {
    let fast = 0, slow = 0;
    const onset = Math.round(delay * sampleRate);
    for (let i = 0; i < Math.floor(duration * sampleRate); i++) {
      const t = i / sampleRate;
      random = (Math.imul(1_664_525, random) + 1_013_904_223) | 0;
      const noise = random / 2_147_483_648;
      fast += (noise - fast) * fastCutoff;
      slow += (noise - slow) * slowCutoff;
      const fade = Math.min(1, t / .0018, (duration - t) / .008);
      const tap = Math.sin(t * 2 * Math.PI * hz) * Math.exp(-t * 61);
      const shell = Math.sin(t * 2 * Math.PI * hz * 2.17) * Math.exp(-t * 140);
      const texture = (fast - slow) * Math.exp(-t * (rasp >= .8 ? 35 : 110));
      output[onset + i] += strength * fade * (.55 * tap + .18 * shell + rasp * texture);
    }
  }
  return output;
}

function browserAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Context = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Context ? new Context({ latencyHint: "interactive" }) : null;
}

export function createHeatSinkAudio(makeContext = browserAudioContext) {
  let context: AudioContext | null = null, output: GainNode | null = null;
  let disposed = false, muted = false, serial = 0, resuming = false;
  let pending: { cue: HeatSinkCue; intensity: number } | null = null;
  const voices = new Set<AudioBufferSourceNode>();
  const buffers = new Map<string, AudioBuffer>();

  const stopVoice = (voice: AudioBufferSourceNode) => {
    voice.onended = null;
    try { voice.stop(); } catch {}
    voice.disconnect();
    voices.delete(voice);
  };

  const silence = () => {
    pending = null;
    for (const voice of voices) stopVoice(voice);
  };

  const start = (cue: HeatSinkCue, intensity: number) => {
    if (disposed || muted || context?.state !== "running" || !output) return;
    const level = cue === "pickup" || cue === "bank" ? tier(intensity) : 1;
    const variation = cue === "move" ? serial++ % 3 : 0;
    const key = `${cue}:${level}:${variation}`;
    let buffer = buffers.get(key);
    if (!buffer) {
      const samples = heatSinkCueSamples(context.sampleRate, cue, level, variation);
      buffer = context.createBuffer(1, samples.length, context.sampleRate);
      buffer.copyToChannel(samples, 0);
      buffers.set(key, buffer);
    }
    const oldest = voices.values().next().value;
    if (voices.size >= 4 && oldest) stopVoice(oldest);
    const voice = context.createBufferSource();
    voice.buffer = buffer;
    voice.connect(output);
    voice.onended = () => { voice.disconnect(); voices.delete(voice); };
    voices.add(voice);
    try { voice.start(); } catch { stopVoice(voice); }
  };

  return {
    unlock() {
      if (disposed || muted) return;
      try {
        if (!context) {
          context = makeContext();
          if (!context) return;
          output = context.createGain();
          output.gain.value = .22;
          output.connect(context.destination);
        }
        if (context.state !== "running" && !resuming) {
          resuming = true;
          void context.resume().then(() => {
            const next = pending;
            pending = null;
            resuming = false;
            if (next) start(next.cue, next.intensity);
          }).catch(() => { pending = null; resuming = false; });
        }
      } catch { resuming = false; }
    },
    play(cue: HeatSinkCue, intensity = 1) {
      if (disposed || muted) return;
      if (resuming) { pending = { cue, intensity }; return; }
      try { start(cue, intensity); } catch {}
    },
    setMuted(value: boolean) {
      muted = value;
      if (muted) silence();
    },
    silence,
    dispose() {
      disposed = true;
      silence();
      buffers.clear();
      output?.disconnect();
      output = null;
      if (context && context.state !== "closed") void context.close().catch(() => {});
      context = null;
    },
  };
}
