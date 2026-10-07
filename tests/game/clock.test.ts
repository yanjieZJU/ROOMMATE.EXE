import { describe, expect, it } from "vitest";

import { ROOMMATE_DAY_DURATION_MS } from "../../src/shared/constants";
import { advanceSimulationClock } from "../../src/game/simulation/clock";
import { createRoommateFixture } from "../fixtures/roommate";

describe("seven-day simulation clock", () => {
  it("uses ninety-second days and emits one transition at the boundary", () => {
    const world = createRoommateFixture().world;
    world.elapsedMs = ROOMMATE_DAY_DURATION_MS - 500;

    const advanced = advanceSimulationClock(world, 500);

    expect(advanced.world).toMatchObject({ day: 2, elapsedMs: 0 });
    expect(advanced.dayTransitions).toEqual([{ from: 1, to: 2 }]);
    expect(advanced.leaseReached).toBe(false);
  });

  it("rejects negative deltas and invalid configured day lengths", () => {
    const world = createRoommateFixture().world;

    expect(() => advanceSimulationClock(world, -1)).toThrow(/non-negative/);
    expect(() => advanceSimulationClock(world, 1, { dayDurationMs: 0 })).toThrow(/positive integer/);
  });

  it("clamps a foreground tick to one second", () => {
    const world = createRoommateFixture().world;

    const advanced = advanceSimulationClock(world, 30_000);

    expect(advanced.appliedDeltaMs).toBe(1_000);
    expect(advanced.world.elapsedMs).toBe(1_000);
  });

  it("does not advance while paused", () => {
    const world = createRoommateFixture().world;
    world.paused = true;

    const advanced = advanceSimulationClock(world, 1_000);

    expect(advanced.world).toBe(world);
    expect(advanced.appliedDeltaMs).toBe(0);
  });

  it("stops at the day-seven lease phase instead of creating day eight", () => {
    const world = createRoommateFixture().world;
    world.day = 7;
    world.elapsedMs = ROOMMATE_DAY_DURATION_MS - 200;

    const advanced = advanceSimulationClock(world, 1_000);

    expect(advanced.world).toMatchObject({ day: 7, elapsedMs: ROOMMATE_DAY_DURATION_MS });
    expect(advanced.dayTransitions).toEqual([]);
    expect(advanced.leaseReached).toBe(true);
  });
});
