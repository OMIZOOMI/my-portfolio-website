import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HEAT_COLUMNS, HEAT_ROWS, HEAT_UPGRADES, HOT_TILE_HIT_HEAT, MAX_CARRIED, MAX_PRESSURE_LEVEL, advanceHeatSink, createHeatSink,
  heatBatchMultiplier, heatBatchScore, heatCapacity, moveHeatSink,
} from "../src/components/desktop/heatSinkEngine.ts";

const same = (a, b) => a.x === b.x && a.y === b.y;
const key = ({ x, y }) => `${x}:${y}`;
const bankFrom = (state, carried) => moveHeatSink({ ...state, carried, player: { x: 5, y: 3 } }, "left");

test("a seeded board can be replayed without modifying the original state", () => {
  const initial = createHeatSink(614);
  const reference = createHeatSink(614);
  const replay = state => advanceHeatSink(moveHeatSink(state, "right").state, 6_500).state;
  assert.deepEqual(replay(initial), replay(reference));
  assert.deepEqual(initial, reference);
  assert.notDeepEqual(createHeatSink(17).cells, createHeatSink(942).cells);
  assert.deepEqual(initial.player, initial.station);
  assert.ok(initial.cells.every(cell => !same(cell, initial.station)));
});

test("four carried cells are worthless until banked together, then beat four singles and cool the player", () => {
  const initial = createHeatSink(0);
  let state = { ...initial, cells: initial.cells.slice(0, 4) };
  for (const direction of ["right", "right", "up", "down", "down", "left", "left", "down", "up", "left", "up", "left", "right"]) {
    state = moveHeatSink(state, direction).state;
  }
  assert.equal(state.carried, 4);
  assert.equal(state.score, 0);
  state = advanceHeatSink(state, 2_000).state;
  assert.ok(state.heat > 0);
  const bank = moveHeatSink(state, "right");
  assert.deepEqual(bank.event, { type: "bank", batch: 4, points: 800, multiplier: 2, cooled: true });
  assert.ok(bank.state.score > heatBatchScore(1) * 4);
  assert.equal(bank.state.carried, 0);
  assert.equal(bank.state.banks, 1);
  assert.equal(bank.state.bestBatch, 4);
  assert.ok(bank.state.heat < state.heat);
  const revisit = moveHeatSink(moveHeatSink(bank.state, "right").state, "left");
  assert.equal(revisit.event.type, "move");
  assert.equal(revisit.state.score, bank.state.score);
});

test("capacity leaves uncollected cells in place and delayed replenishment avoids the player and hazards", () => {
  const initial = createHeatSink();
  const full = { ...initial, carried: MAX_CARRIED };
  const moved = moveHeatSink(full, "right");
  assert.equal(moved.event.type, "move");
  assert.equal(moved.state.cells, full.cells);
  assert.equal(heatBatchMultiplier(MAX_CARRIED), 3);
  const collected = moveHeatSink(initial, "right").state;
  assert.equal(collected.cells.length, 5);
  const before = advanceHeatSink(collected, 899).state;
  assert.equal(before.cells.length, 5);
  const after = advanceHeatSink(before, 1).state;
  assert.equal(after.cells.length, 6);
  assert.ok(after.cells.every(cell => !same(cell, after.player) && !same(cell, after.station)));
});

test("heat rises with active time and cargo; overheat freezes the banked score", () => {
  const initial = createHeatSink();
  const empty = advanceHeatSink(initial, 2_000).state;
  const loaded = advanceHeatSink(moveHeatSink(initial, "right").state, 2_000).state;
  assert.ok(loaded.heat > empty.heat);
  assert.equal(advanceHeatSink(initial, NaN).state, initial);
  const end = advanceHeatSink({ ...loaded, score: 350 }, 30_000);
  assert.equal(end.event.type, "overheat");
  assert.equal(end.state.phase, "overheated");
  assert.equal(end.state.heat, 100);
  assert.equal(end.state.carried, 0);
  assert.equal(end.state.score, 350);
  assert.equal(moveHeatSink(end.state, "left").state, end.state);
  assert.equal(advanceHeatSink(end.state, 120_000).state, end.state);
});

test("warning tiles are safe; crossing an active tile adds a heat spike and doubles heating until you leave", () => {
  const initial = createHeatSink();
  const warned = advanceHeatSink(initial, 5_200).state;
  const [tile] = warned.hazards;
  assert.equal(tile.status, "warning");
  const direction = tile.x > 0 ? "right" : "left";
  const side = { x: tile.x + (tile.x > 0 ? -1 : 1), y: tile.y };
  const crossed = moveHeatSink({ ...warned, player: side }, direction);
  assert.deepEqual(crossed.state.player, { x: tile.x, y: tile.y });
  const matured = advanceHeatSink({ ...warned, player: side }, tile.activatesAtMs - warned.elapsedMs).state;
  assert.equal(matured.hazards.find(hazard => same(hazard, tile)).status, "hot");
  const entered = moveHeatSink(matured, direction);
  assert.deepEqual(entered.state.player, crossed.state.player);
  assert.equal(entered.event.type, "heat-hit");
  assert.ok(Math.abs(entered.state.heat - matured.heat - HOT_TILE_HIT_HEAT) < 1e-10);
  const onTile = advanceHeatSink(entered.state, 1_000).state.heat - entered.state.heat;
  const offTile = advanceHeatSink(matured, 1_000).state.heat - matured.heat;
  assert.ok(Math.abs(onTile - 2 * offTile) < 1e-10);
  const left = moveHeatSink(entered.state, direction === "right" ? "left" : "right").state;
  const normalRateAfterExit = offTile + left.carried * 1.34;
  assert.ok(Math.abs(advanceHeatSink(left, 1_000).state.heat - left.heat - normalRateAfterExit) < 1e-10);
  const caughtOnWarning = advanceHeatSink(crossed.state, tile.activatesAtMs - warned.elapsedMs);
  assert.equal(caughtOnWarning.event.type, "heat-hit");
  assert.ok(Math.abs(caughtOnWarning.state.heat - entered.state.heat) < 1e-10);
  const fatal = moveHeatSink({ ...matured, heat: 95, score: 400 }, direction);
  assert.equal(fatal.event.type, "overheat");
  assert.equal(fatal.state.heat, 100);
  assert.equal(fatal.state.score, 400);
  const expired = advanceHeatSink(matured, tile.expiresAtMs - matured.elapsedMs).state;
  assert.ok(!expired.hazards.some(hazard => same(hazard, tile) && hazard.expiresAtMs === tile.expiresAtMs));
});

test("both kinds of loss clear equipped upgrades, unclaimed drops, and unbanked cargo immediately", () => {
  const start = { ...createHeatSink(), score: 800, stationReadyAtMs: 4400, heat: 95 };
  const heatTile = { x: 3, y: 3, status: "hot", activatesAtMs: 0, expiresAtMs: 5000 };
  const drop = { x: 8, y: 0, kind: "coolant-valve", expiresAtMs: 5000 };
  for (const end of [
    moveHeatSink({ ...start, hazards: [heatTile], carried: 8, upgrade: "cargo-rack" }, "left"),
    advanceHeatSink({ ...start, carried: 3, upgradeDrop: drop }, 1500),
  ]) {
    assert.equal(end.event.type, "overheat");
    assert.equal(end.state.score, 800);
    assert.equal(end.state.carried, 0);
    assert.equal(end.state.upgrade, null);
    assert.equal(end.state.upgradeDrop, null);
    assert.equal(end.state.stationReadyAtMs, 0);
  }
});

test("banked score increases pressure immediately and produces more simultaneous red tiles", () => {
  const initial = createHeatSink(27);
  assert.equal(advanceHeatSink(initial, 24_000).state.level, 1);
  assert.equal(bankFrom({ ...initial, score: 299 }, 1).state.level, 1);
  assert.equal(bankFrom({ ...initial, score: 300 }, 1).state.level, 2);
  const peakHotTiles = score => {
    let state = bankFrom({ ...initial, score: score - 100 }, 1).state;
    let peak = 0;
    for (let tick = 0; tick < 55; tick++) {
      state = advanceHeatSink({ ...state, heat: 0 }, 300).state;
      peak = Math.max(peak, state.hazards.filter(hazard => hazard.status === "hot").length);
    }
    return peak;
  };
  const peaks = [100, 400, 800, 1600, 3200].map(peakHotTiles);
  assert.ok(peaks[2] > 3);
  assert.ok(peaks.every((peak, index) => index === 0 || peak > peaks[index - 1]), peaks.join(", "));
});

test("banking still awards points while the cooling station recharges", () => {
  const first = bankFrom({ ...createHeatSink(), heat: 70 }, 1);
  assert.equal(first.event.cooled, true);
  assert.equal(first.state.heat, 9);
  const second = bankFrom(advanceHeatSink(first.state, 1_000).state, 2);
  assert.equal(second.event.cooled, false);
  assert.equal(second.state.score, 350);
  assert.equal(second.state.heat, advanceHeatSink(first.state, 1_000).state.heat);
  assert.equal(second.state.stationReadyAtMs, first.state.stationReadyAtMs);
  const ready = advanceHeatSink(second.state, first.state.stationReadyAtMs - second.state.elapsedMs).state;
  assert.equal(bankFrom(ready, 1).event.cooled, true);
});

test("upgrade drops are seeded, expire, and stay out of occupied tiles", () => {
  const kinds = new Set();
  const locations = new Set();
  for (let seed = 0; seed < 30; seed++) {
    const initial = createHeatSink(seed);
    assert.ok(initial.nextUpgradeScore >= 650 && initial.nextUpgradeScore <= 1050);
    const below = bankFrom({ ...initial, score: initial.nextUpgradeScore - 101 }, 1).state;
    assert.equal(below.upgradeDrop, null);
    const spawned = bankFrom({ ...initial, score: initial.nextUpgradeScore - 100 }, 1).state;
    const drop = spawned.upgradeDrop;
    assert.ok(drop);
    kinds.add(drop.kind);
    locations.add(key(drop));
    assert.ok(!same(drop, spawned.station) && !spawned.cells.some(cell => same(cell, drop)));
    const active = advanceHeatSink(spawned, drop.expiresAtMs - 1).state;
    assert.ok(active.hazards.every(hazard => !same(hazard, drop)));
    assert.deepEqual(active.upgradeDrop, drop);
    const expired = advanceHeatSink(active, 1).state;
    assert.equal(expired.upgradeDrop, null);
    assert.equal(bankFrom(expired, 1).state.upgradeDrop, null);
  }
  assert.deepEqual([...kinds].sort(), ["cargo-rack", "coolant-valve"]);
  assert.ok(locations.size > 5);
});

test("the coolant valve shortens existing and future recharges; the rack banks up to eight cells", () => {
  const start = { ...createHeatSink(), player: { x: 7, y: 0 }, stationReadyAtMs: 4200 };
  for (const kind of Object.keys(HEAT_UPGRADES)) {
    const pickup = moveHeatSink({ ...start, upgradeDrop: { x: 8, y: 0, kind, expiresAtMs: 13_000 } }, "right");
    const equipped = pickup.state;
    assert.deepEqual(pickup.event, { type: "upgrade", kind });
    assert.equal(equipped.upgradeDrop, null);
    const baselineHeat = advanceHeatSink(start, 500).state.heat;
    assert.ok(Math.abs(advanceHeatSink(equipped, 500).state.heat / baselineHeat - HEAT_UPGRADES[kind].heatMultiplier) < 1e-10);
    assert.equal(bankFrom({ ...equipped, score: 3000 }, 1).state.upgradeDrop, null);
    if (kind === "coolant-valve") {
      assert.equal(equipped.stationReadyAtMs, 2520);
      const banked = bankFrom({ ...equipped, elapsedMs: 2520 }, 1).state;
      assert.equal(banked.stationReadyAtMs - banked.elapsedMs, 2520);
      assert.equal(heatCapacity(equipped.upgrade), 6);
    } else {
      assert.equal(heatCapacity(equipped.upgrade), 8);
      const loaded = moveHeatSink({ ...equipped, player: equipped.station, carried: 7 }, "right").state;
      assert.equal(loaded.carried, 8);
      assert.equal(bankFrom(loaded, loaded.carried).event.points, 3200);
    }
  }
});

test("faster warning waves never isolate a pickup, the player, or the approach to the cooling station", () => {
  const routes = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const levelStart = 22_000;
  for (let seed = 0; seed < 35; seed++) {
    const easy = advanceHeatSink(createHeatSink(seed), 5_200).state;
    let state = { ...createHeatSink(seed), level: MAX_PRESSURE_LEVEL, elapsedMs: levelStart, nextHazardAtMs: levelStart + 1 };
    for (let tick = 0; tick < 30; tick++) {
      state = advanceHeatSink({ ...state, heat: 0 }, 450).state;
      const blocked = new Set(state.hazards.map(key));
      const reachable = new Set([key(state.station)]);
      const pending = [state.station];
      for (let index = 0; index < pending.length; index++) {
        for (const [dx, dy] of routes) {
          const tile = { x: pending[index].x + dx, y: pending[index].y + dy };
          if (tile.x < 0 || tile.x >= HEAT_COLUMNS || tile.y < 0 || tile.y >= HEAT_ROWS) continue;
          const id = key(tile);
          if (blocked.has(id) || reachable.has(id)) continue;
          reachable.add(id);
          pending.push(tile);
        }
      }
      assert.equal(reachable.size + blocked.size, HEAT_COLUMNS * HEAT_ROWS);
      assert.ok(reachable.has(key(state.player)));
      assert.ok(state.cells.every(cell => reachable.has(key(cell))));
      assert.ok(state.hazards.length <= 1 + MAX_PRESSURE_LEVEL * 2);
    }
    assert.ok(state.nextHazardAtMs - state.elapsedMs < easy.nextHazardAtMs - easy.elapsedMs);
    assert.ok(advanceHeatSink(state, 50).state.heat - state.heat > easy.heat / easy.elapsedMs * 50);
  }
});
