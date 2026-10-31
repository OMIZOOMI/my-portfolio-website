import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import ts from "typescript";

const filename = fileURLToPath(new URL("../src/components/webcam/handDetectorRuntime.ts", import.meta.url));
const loaded = { exports: {} };
const output = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
runInThisContext(`(function(module, exports, require) { ${output}\n})`, { filename })(loaded, loaded.exports, createRequire(import.meta.url));
const { createExclusiveDetectorRuntime } = loaded.exports;
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function detector(label = "task") {
  return { label, closed: 0, close() { this.closed++; } };
}

test("one active detector; a queued owner automatically resumes after release", async () => {
  const made = [];
  const runtime = createExclusiveDetectorRuntime(async (delegate) => {
    const task = detector(delegate); made.push(task); return task;
  });
  const first = await runtime.acquire(new AbortController().signal);
  const states = [];
  const secondPromise = runtime.acquire(new AbortController().signal, (state) => states.push(state));
  await tick();
  assert.equal(made.length, 1);
  assert.deepEqual(states, ["busy"]);
  first.release();
  first.release();
  const second = await secondPromise;
  assert.equal(made[0].closed, 1);
  assert.deepEqual(states, ["busy", "loading"]);
  assert.equal(made.length, 2);
  assert.equal(second.detector, made[1]);
  second.release();
  assert.equal(made[1].closed, 1);
});

test("GPU initialization failure falls back once to CPU and reports the actual delegate", async () => {
  const calls = [], statuses = [];
  const cpu = detector("CPU");
  const runtime = createExclusiveDetectorRuntime(async (delegate) => {
    calls.push(delegate);
    if (delegate === "GPU") throw new Error("ANGLE context unavailable");
    return cpu;
  });
  const lease = await runtime.acquire(new AbortController().signal, (state) => statuses.push(state));
  assert.deepEqual(calls, ["GPU", "CPU"]);
  assert.deepEqual(statuses, ["loading", "fallback"]);
  assert.equal(lease.delegate, "CPU");
  lease.release();
  assert.equal(cpu.closed, 1);
});

test("asset failures skip irrelevant GPU retry, and initialization rejection is retryable", async () => {
  class AssetFailure extends Error {}
  let fail = true;
  const calls = [];
  const runtime = createExclusiveDetectorRuntime(async (delegate) => {
    calls.push(delegate);
    if (fail) throw new AssetFailure("404 model");
    return detector(delegate);
  }, { canFallback: (error) => !(error instanceof AssetFailure) });
  await assert.rejects(runtime.acquire(new AbortController().signal), /404 model/);
  assert.deepEqual(calls, ["GPU"]);
  fail = false;
  const retried = await runtime.acquire(new AbortController().signal);
  assert.equal(retried.delegate, "GPU");
  retried.release();
});

test("failed GPU and CPU initialization does not cache a poisoned promise", async () => {
  let fail = true;
  const calls = [];
  const runtime = createExclusiveDetectorRuntime(async (delegate) => {
    calls.push(delegate);
    if (fail) throw new Error("native initialization failed");
    return detector(delegate);
  });
  await assert.rejects(runtime.acquire(new AbortController().signal), /native initialization failed/);
  fail = false;
  const lease = await runtime.acquire(new AbortController().signal);
  assert.deepEqual(calls, ["GPU", "CPU", "GPU"]);
  lease.release();
});

test("abort during uncancellable initialization closes its late task before starting the next", async () => {
  const pending = deferred(), made = [];
  let calls = 0;
  const runtime = createExclusiveDetectorRuntime(async () => {
    calls++;
    if (calls === 1) return pending.promise;
    const task = detector("second"); made.push(task); return task;
  });
  const controller = new AbortController();
  const first = runtime.acquire(controller.signal);
  const rejected = assert.rejects(first, { name: "AbortError" });
  controller.abort();
  await rejected;
  const second = runtime.acquire(new AbortController().signal);
  await tick();
  assert.equal(calls, 1, "no competing WASM initialization after close/reopen");
  const orphan = detector("late-first");
  pending.resolve(orphan);
  const lease = await second;
  assert.equal(orphan.closed, 1);
  assert.equal(calls, 2);
  lease.release();
  assert.equal(made[0].closed, 1);
});

test("a waiting minimized/closed owner is removed without creating a task", async () => {
  let calls = 0;
  const runtime = createExclusiveDetectorRuntime(async () => { calls++; return detector(); });
  const first = await runtime.acquire(new AbortController().signal);
  const controller = new AbortController();
  const waiting = runtime.acquire(controller.signal);
  const rejected = assert.rejects(waiting, { name: "AbortError" });
  controller.abort();
  await rejected;
  first.release();
  await tick();
  assert.equal(calls, 1);
});

test("runtime GPU failure closes GPU before replacing with CPU, while waiters remain queued", async () => {
  const cpuPending = deferred(), gpu = detector("GPU"), cpu = detector("CPU");
  let calls = 0;
  const statuses = [];
  const runtime = createExclusiveDetectorRuntime(async (delegate) => {
    calls++;
    if (calls === 1) return gpu;
    if (delegate === "CPU") return cpuPending.promise;
    return detector("next");
  });
  const first = await runtime.acquire(new AbortController().signal, (state) => statuses.push(state));
  const replacement = first.fallbackToCpu();
  await assert.rejects(first.fallbackToCpu(), /already restarting/);
  assert.equal(gpu.closed, 1);
  assert.equal(first.detector, null);
  const second = runtime.acquire(new AbortController().signal);
  await tick();
  assert.equal(calls, 2);
  cpuPending.resolve(cpu);
  await replacement;
  assert.equal(first.delegate, "CPU");
  assert.equal(first.detector, cpu);
  assert.deepEqual(statuses, ["loading", "fallback"]);
  await assert.rejects(first.fallbackToCpu(), /CPU gesture detection failed/);
  first.release();
  const next = await second;
  assert.equal(cpu.closed, 1);
  next.release();
});

test("abort during GPU→CPU replacement closes the late CPU task and never revives the owner", async () => {
  const pending = deferred(), gpu = detector("GPU"), cpu = detector("late CPU");
  const runtime = createExclusiveDetectorRuntime(async (delegate) => delegate === "GPU" ? gpu : pending.promise);
  const controller = new AbortController();
  const lease = await runtime.acquire(controller.signal);
  const replacement = lease.fallbackToCpu();
  const rejected = assert.rejects(replacement, { name: "AbortError" });
  controller.abort();
  assert.equal(lease.detector, null);
  pending.resolve(cpu);
  await rejected;
  assert.equal(gpu.closed, 1);
  assert.equal(cpu.closed, 1);
  assert.equal(lease.detector, null);
});

test("failed runtime CPU replacement releases ownership and permits a fresh retry", async () => {
  let calls = 0;
  const runtime = createExclusiveDetectorRuntime(async () => {
    calls++;
    if (calls === 2) throw new Error("CPU unavailable");
    return detector();
  });
  const first = await runtime.acquire(new AbortController().signal);
  await assert.rejects(first.fallbackToCpu(), /CPU unavailable/);
  assert.equal(first.detector, null);
  const second = await runtime.acquire(new AbortController().signal);
  assert.equal(calls, 3);
  second.release();
});
