export const HEAT_COLUMNS = 9;
export const HEAT_ROWS = 7;
export const MAX_CARRIED = 6;
export const SCORE_PER_PRESSURE_LEVEL = 400;
export const MAX_PRESSURE_LEVEL = 9;
export const HOT_TILE_HIT_HEAT = 8;

export type HeatPoint = Readonly<{ x: number; y: number }>;
export type HeatDirection = "up" | "down" | "left" | "right";
export type HeatHazard = HeatPoint & Readonly<{
  status: "warning" | "hot";
  activatesAtMs: number;
  expiresAtMs: number;
}>;
export type HeatUpgrade = "coolant-valve" | "cargo-rack";
export type HeatUpgradeDrop = HeatPoint & Readonly<{ kind: HeatUpgrade; expiresAtMs: number }>;

export const HEAT_UPGRADES = {
  "coolant-valve": { name: "Coolant Valve", benefit: "40% shorter cooling recharge", heatMultiplier: 1.18, cooldownMultiplier: .6, extraCapacity: 0 },
  "cargo-rack": { name: "Cargo Rack", benefit: "Carry 2 extra cells", heatMultiplier: 1.3, cooldownMultiplier: 1, extraCapacity: 2 },
} satisfies Record<HeatUpgrade, { name: string; benefit: string; heatMultiplier: number; cooldownMultiplier: number; extraCapacity: number }>;

export interface HeatSinkState {
  readonly player: HeatPoint;
  readonly station: HeatPoint;
  readonly cells: ReadonlyArray<HeatPoint>;
  readonly hazards: ReadonlyArray<HeatHazard>;
  readonly heat: number;
  readonly score: number;
  readonly carried: number;
  readonly elapsedMs: number;
  readonly level: number;
  readonly banks: number;
  readonly bestBatch: number;
  readonly phase: "running" | "overheated";
  readonly seed: number;
  readonly nextHazardAtMs: number;
  readonly nextCellAtMs: number | null;
  readonly stationReadyAtMs: number;
  readonly lastHeatHitAtMs: number | null;
  readonly upgrade: HeatUpgrade | null;
  readonly upgradeDrop: HeatUpgradeDrop | null;
  readonly nextUpgradeScore: number;
}

export type HeatSinkEvent = { type: "move" | "blocked" | "overheat" | "heat-hit" }
  | { type: "pickup"; carried: number }
  | { type: "upgrade"; kind: HeatUpgrade }
  | { type: "bank"; batch: number; points: number; multiplier: number; cooled: boolean };

export interface HeatSinkResult { state: HeatSinkState; event: HeatSinkEvent | null }

const STATION = { x: 4, y: 3 } as const;
const HEAT_RAMP_MS = 22_000;
const STATION_RECHARGE_MS = 4_200;
const UPGRADE_LIFETIME_MS = 13_000;
const CELL_COUNT = 6;
const DEFAULT_SEED = 0x48ea7511;
const BATCH_MULTIPLIERS = [0, 1, 1.25, 1.5, 2, 2.5, 3, 3.5, 4];
const DIRECTIONS: Record<HeatDirection, HeatPoint> = {
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
};
const NEIGHBORS = Object.values(DIRECTIONS);
const BOARD: HeatPoint[] = Array.from({ length: HEAT_COLUMNS * HEAT_ROWS }, (_, index) => ({ x: index % HEAT_COLUMNS, y: Math.floor(index / HEAT_COLUMNS) }));
const sameTile = (a: HeatPoint, b: HeatPoint) => a.x === b.x && a.y === b.y;
const indexOf = ({ x, y }: HeatPoint) => y * HEAT_COLUMNS + x;
const distance = (a: HeatPoint, b: HeatPoint) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const inBounds = ({ x, y }: HeatPoint) => x >= 0 && x < HEAT_COLUMNS && y >= 0 && y < HEAT_ROWS;

function roll(seed: number) {
  const nextSeed = (seed + 0x6d2b79f5) >>> 0;
  let value = Math.imul(nextSeed ^ (nextSeed >>> 15), nextSeed | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  const fraction = ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  return { fraction, seed: nextSeed };
}

function chooseTile(tiles: ReadonlyArray<HeatPoint>, seed: number) {
  const next = roll(seed);
  return { tile: tiles[Math.floor(next.fraction * tiles.length)], seed: next.seed };
}

function hasConnectedRoutes(station: HeatPoint, hazards: ReadonlyArray<HeatPoint>) {
  const occupied = new Uint8Array(BOARD.length);
  for (const tile of hazards) occupied[indexOf(tile)] = 1;
  const queue = [station];
  occupied[indexOf(station)] = 2;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const tile = queue[cursor];
    for (const direction of NEIGHBORS) {
      const neighbor = { x: tile.x + direction.x, y: tile.y + direction.y };
      const index = indexOf(neighbor);
      if (!inBounds(neighbor) || occupied[index]) continue;
      occupied[index] = 2;
      queue.push(neighbor);
    }
  }
  return queue.length === BOARD.length - hazards.length && hazards.every(tile => NEIGHBORS.some(direction => {
    const neighbor = { x: tile.x + direction.x, y: tile.y + direction.y };
    return inBounds(neighbor) && occupied[indexOf(neighbor)] === 2;
  }));
}

export function heatBatchMultiplier(batch: number) {
  const count = Number.isFinite(batch) ? Math.max(0, Math.min(BATCH_MULTIPLIERS.length - 1, Math.floor(batch))) : 0;
  return BATCH_MULTIPLIERS[count];
}

export function heatBatchScore(batch: number) {
  const count = Number.isFinite(batch) ? Math.floor(batch) : 0;
  return Math.max(0, Math.min(BATCH_MULTIPLIERS.length - 1, count)) * 100 * heatBatchMultiplier(count);
}

export function heatCapacity(upgrade: HeatUpgrade | null) {
  return MAX_CARRIED + (upgrade ? HEAT_UPGRADES[upgrade].extraCapacity : 0);
}

export function isOnHotTile(state: HeatSinkState) {
  return state.hazards.some(hazard => hazard.status === "hot" && sameTile(hazard, state.player));
}

function overheat(state: HeatSinkState): HeatSinkResult {
  return {
    state: { ...state, heat: 100, phase: "overheated", carried: 0, upgrade: null, upgradeDrop: null, stationReadyAtMs: 0 },
    event: { type: "overheat" },
  };
}

function heatHit(state: HeatSinkState): HeatSinkResult {
  const heat = Math.min(100, state.heat + HOT_TILE_HIT_HEAT);
  const next = { ...state, heat, lastHeatHitAtMs: state.elapsedMs };
  return heat >= 100
    ? overheat(next)
    : { state: next, event: { type: "heat-hit" } };
}

function replenishCell(state: HeatSinkState): HeatSinkState {
  const available = BOARD.filter(tile => distance(tile, state.station) >= 3 && !sameTile(tile, state.player)
    && (!state.upgradeDrop || !sameTile(tile, state.upgradeDrop))
    && !state.cells.some(cell => sameTile(cell, tile)) && !state.hazards.some(hazard => sameTile(hazard, tile)));
  const { tile, seed } = chooseTile(available, state.seed);
  const cells = tile ? [...state.cells, tile] : state.cells;
  return { ...state, cells, seed, nextCellAtMs: cells.length >= CELL_COUNT ? null : state.elapsedMs + 900 };
}

export function createHeatSink(seed = DEFAULT_SEED): HeatSinkState {
  const firstDrop = roll(Number.isFinite(seed) ? seed >>> 0 : DEFAULT_SEED);
  let state: HeatSinkState = {
    player: STATION, station: STATION, cells: [{ x: 5, y: 3 }, { x: 6, y: 2 }, { x: 2, y: 3 }, { x: 4, y: 5 }],
    hazards: [], heat: 0, score: 0, carried: 0, elapsedMs: 0, level: 1, banks: 0, bestBatch: 0, phase: "running",
    seed: firstDrop.seed, nextHazardAtMs: 5_200, nextCellAtMs: null, stationReadyAtMs: 0, lastHeatHitAtMs: null,
    upgrade: null, upgradeDrop: null, nextUpgradeScore: 650 + Math.floor(firstDrop.fraction * 401),
  };
  while (state.cells.length < CELL_COUNT) state = replenishCell(state);
  return state;
}

export function startHeatSinkRun() {
  return createHeatSink(Math.floor(Math.random() * 0x100000000));
}

const hazardInterval = (level: number) => Math.max(900, 3_000 - (level - 1) * 290);

function addHazards(state: HeatSinkState): HeatSinkState {
  const nextHazardAtMs = state.elapsedMs + hazardInterval(state.level);
  const limit = 1 + state.level * 2;
  let hazards = state.hazards;
  let seed = state.seed;
  const waveSize = Math.min(3, Math.ceil(state.level / 2));
  for (let index = 0; index < waveSize && hazards.length < limit; index++) {
    const choices = BOARD.filter(tile => distance(tile, state.station) > 1 && distance(tile, state.player) > 1
      && (!state.upgradeDrop || !sameTile(tile, state.upgradeDrop))
      && !state.cells.some(cell => sameTile(cell, tile)) && !hazards.some(hazard => sameTile(hazard, tile)));
    const { seed: nextSeed, tile } = chooseTile(choices, seed);
    seed = nextSeed;
    if (!tile) break;
    const startIndex = choices.indexOf(tile);
    const safeTile = [...choices.slice(startIndex), ...choices.slice(0, startIndex)].find(candidate => hasConnectedRoutes(state.station, [...hazards, candidate]));
    if (!safeTile) break;
    const activatesAtMs = state.elapsedMs + Math.max(850, 2_000 - (state.level - 1) * 160);
    const expiresAtMs = activatesAtMs + 5_200 + (state.level - 1) * 480;
    hazards = [...hazards, { ...safeTile, status: "warning", activatesAtMs, expiresAtMs }];
  }
  return { ...state, nextHazardAtMs, hazards, seed };
}

function offerUpgrade(state: HeatSinkState): HeatSinkState {
  if (state.upgrade || state.upgradeDrop || state.score < state.nextUpgradeScore) return state;
  const choices = BOARD.filter(tile => distance(tile, state.station) >= 3 && distance(tile, state.player) > 1
    && !state.cells.some(cell => sameTile(cell, tile)) && !state.hazards.some(hazard => sameTile(hazard, tile)));
  const { seed, tile } = chooseTile(choices, state.seed);
  if (!tile) return state;
  const drop = roll(seed);
  return {
    ...state,
    seed: drop.seed,
    nextUpgradeScore: state.score + 600 + Math.floor(drop.fraction * 401),
    upgradeDrop: { ...tile, kind: drop.fraction < .5 ? "coolant-valve" : "cargo-rack", expiresAtMs: state.elapsedMs + UPGRADE_LIFETIME_MS },
  };
}

function settleTick(state: HeatSinkState): HeatSinkState {
  const elapsedMs = state.elapsedMs;
  const hazards = state.hazards.some(hazard => hazard.expiresAtMs <= elapsedMs || (hazard.status === "warning" && hazard.activatesAtMs <= elapsedMs))
    ? state.hazards.flatMap(hazard => {
      if (hazard.expiresAtMs <= elapsedMs) return [];
      if (hazard.status === "hot" || hazard.activatesAtMs > elapsedMs) return [hazard];
      return [{ ...hazard, status: "hot" as const }];
    }) : state.hazards;
  const upgradeDrop = state.upgradeDrop && state.upgradeDrop.expiresAtMs > elapsedMs ? state.upgradeDrop : null;
  let next = { ...state, hazards, upgradeDrop };
  if (next.nextCellAtMs !== null && next.nextCellAtMs <= elapsedMs) next = replenishCell(next);
  if (next.nextHazardAtMs <= elapsedMs) next = addHazards(next);
  return next;
}

export function advanceHeatSink(state: HeatSinkState, deltaMs: number): HeatSinkResult {
  if (state.phase !== "running" || !Number.isFinite(deltaMs) || deltaMs <= 0) return { state, event: null };
  const end = state.elapsedMs + deltaMs;
  let next = state;
  let event: HeatSinkEvent | null = null;
  while (next.elapsedMs < end) {
    const timeTier = Math.floor(next.elapsedMs / HEAT_RAMP_MS);
    const nextTimeTier = timeTier < 8 ? (timeTier + 1) * HEAT_RAMP_MS : Infinity;
    const boundary = Math.min(end, nextTimeTier, next.nextHazardAtMs, next.nextCellAtMs ?? Infinity,
      next.upgradeDrop?.expiresAtMs ?? Infinity, ...next.hazards.map(hazard => hazard.status === "warning" ? hazard.activatesAtMs : hazard.expiresAtMs));
    const duration = boundary - next.elapsedMs;
    const hotBefore = isOnHotTile(next);
    const upgradeHeat = next.upgrade ? HEAT_UPGRADES[next.upgrade].heatMultiplier : 1;
    const normalRate = (2.65 + (next.level - 1) * .72 + Math.min(timeTier, 8) * .28 + next.carried * 1.34) / 1000;
    const ratePerMs = normalRate * upgradeHeat * (hotBefore ? 2 : 1);
    const timeToOverheat = (100 - next.heat) / ratePerMs;
    if (duration >= timeToOverheat) {
      return overheat({ ...next, elapsedMs: next.elapsedMs + timeToOverheat });
    }
    next = settleTick({ ...next, elapsedMs: boundary, heat: next.heat + duration * ratePerMs });
    if (!hotBefore && isOnHotTile(next)) {
      const hit = heatHit(next);
      if (hit.state.phase === "overheated") return hit;
      next = hit.state;
      event = hit.event;
    }
  }
  return { state: next, event };
}

export function moveHeatSink(state: HeatSinkState, direction: HeatDirection): HeatSinkResult {
  if (state.phase !== "running") return { state, event: null };
  const delta = DIRECTIONS[direction];
  if (!delta) return { state, event: null };
  const player = { x: state.player.x + delta.x, y: state.player.y + delta.y };
  if (!inBounds(player)) {
    return { state, event: { type: "blocked" } };
  }
  if (state.carried && sameTile(player, state.station)) {
    const batch = state.carried;
    const multiplier = heatBatchMultiplier(batch);
    const points = heatBatchScore(batch);
    const score = state.score + points;
    const level = Math.min(MAX_PRESSURE_LEVEL, 1 + Math.floor(score / SCORE_PER_PRESSURE_LEVEL));
    const cooled = state.elapsedMs >= state.stationReadyAtMs;
    const rechargeMultiplier = state.upgrade ? HEAT_UPGRADES[state.upgrade].cooldownMultiplier : 1;
    const next = {
      ...state, player, score, level, carried: 0,
      heat: cooled ? Math.max(0, state.heat - (58 + batch * 3)) : state.heat,
      stationReadyAtMs: cooled ? state.elapsedMs + STATION_RECHARGE_MS * rechargeMultiplier : state.stationReadyAtMs,
      nextHazardAtMs: level > state.level ? Math.min(state.nextHazardAtMs, state.elapsedMs + hazardInterval(level)) : state.nextHazardAtMs,
      banks: state.banks + 1, bestBatch: Math.max(state.bestBatch, batch),
    };
    return { state: offerUpgrade(next), event: { type: "bank", batch, points, multiplier, cooled } };
  }
  if (state.upgradeDrop && sameTile(player, state.upgradeDrop)) {
    const kind = state.upgradeDrop.kind;
    const cooldown = Math.max(0, state.stationReadyAtMs - state.elapsedMs);
    const stationReadyAtMs = state.elapsedMs + cooldown * HEAT_UPGRADES[kind].cooldownMultiplier;
    return { state: { ...state, player, upgrade: kind, upgradeDrop: null, stationReadyAtMs }, event: { type: "upgrade", kind } };
  }
  if (state.carried < heatCapacity(state.upgrade) && state.cells.some(cell => sameTile(cell, player))) {
    const carried = state.carried + 1;
    return { state: { ...state, player, carried, cells: state.cells.filter(cell => !sameTile(cell, player)),
      nextCellAtMs: state.nextCellAtMs ?? state.elapsedMs + 900 }, event: { type: "pickup", carried } };
  }
  const next = { ...state, player };
  return isOnHotTile(next) ? heatHit(next) : { state: next, event: { type: "move" } };
}
