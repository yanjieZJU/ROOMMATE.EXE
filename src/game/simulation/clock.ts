import { ROOMMATE_DAY_COUNT, ROOMMATE_DAY_DURATION_MS } from "../../shared/constants";
import type { RoommateWorld } from "../../shared/roommate-schemas";
import { applyWorldCommand } from "./world-reducer";

export interface ClockConfig {
  dayDurationMs?: number;
  maxTickMs?: number;
}

export interface DayTransition {
  from: number;
  to: number;
}

export interface ClockAdvance {
  world: RoommateWorld;
  appliedDeltaMs: number;
  dayTransitions: DayTransition[];
  leaseReached: boolean;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive integer`);
  return value;
}

export function advanceSimulationClock(world: RoommateWorld, deltaMs: number, config: ClockConfig = {}): ClockAdvance {
  if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new RangeError("deltaMs must be non-negative");
  const dayDurationMs = positiveInteger(config.dayDurationMs ?? ROOMMATE_DAY_DURATION_MS, "dayDurationMs");
  const maxTickMs = positiveInteger(config.maxTickMs ?? 1_000, "maxTickMs");
  if (world.paused || deltaMs === 0) {
    return { world, appliedDeltaMs: 0, dayTransitions: [], leaseReached: world.day === ROOMMATE_DAY_COUNT && world.elapsedMs >= dayDurationMs };
  }

  const appliedDeltaMs = Math.min(deltaMs, maxTickMs);
  let next = structuredClone(world);
  let remaining = appliedDeltaMs;
  const dayTransitions: DayTransition[] = [];

  while (remaining > 0) {
    const available = dayDurationMs - next.elapsedMs;
    if (next.day === ROOMMATE_DAY_COUNT) {
      next.elapsedMs = Math.min(dayDurationMs, next.elapsedMs + remaining);
      remaining = 0;
      break;
    }
    if (remaining < available) {
      next.elapsedMs += remaining;
      remaining = 0;
      break;
    }
    remaining -= available;
    const from = next.day;
    next = applyWorldCommand(next, { type: "day-transition", nextDay: from + 1 });
    dayTransitions.push({ from, to: from + 1 });
  }

  return {
    world: next,
    appliedDeltaMs,
    dayTransitions,
    leaseReached: next.day === ROOMMATE_DAY_COUNT && next.elapsedMs >= dayDurationMs,
  };
}
