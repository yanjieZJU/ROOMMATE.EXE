import { describe, expect, it } from "vitest";

import { resolveAffordances } from "../../src/game/actions/affordance-resolver";
import { applyScheduledEvent, eventsDue } from "../../src/game/events/scheduler";
import { advanceSimulationClock } from "../../src/game/simulation/clock";
import { applyWorldCommand, completeMacroAction } from "../../src/game/simulation/world-reducer";
import { createInitialRoommateSession } from "../../src/game/simulation/initial-state";
import { loadConfig } from "../../src/server/config";
import { RoommateSessionSchema } from "../../src/shared/roommate-schemas";

describe("complete seven-day simulation", () => {
  it("runs seventy legal Jev decisions and applies every authored event once", () => {
    let session = createInitialRoommateSession("2026-09-28T00:00:00.000Z");
    let decisions = 0;

    for (let step = 0; step < 70; step += 1) {
      const dueBefore = eventsDue(session.world, session.world);
      for (const event of dueBefore) session.world = applyScheduledEvent(session.world, event);
      const candidates = resolveAffordances(session.world, "jev");
      expect(candidates.length).toBeGreaterThanOrEqual(3);
      expect(candidates.length).toBeLessThanOrEqual(8);
      const action = candidates[step % candidates.length]!;
      const started = applyWorldCommand(session.world, {
        type: "start-action",
        entry: { queueId: `step-${step}`, action, startedAt: new Date(Date.UTC(2026, 8, 28, 0, 0, step)).toISOString() },
      });
      const completed = completeMacroAction(started, action, new Date(Date.UTC(2026, 8, 28, 0, 0, step)).toISOString());
      const advanced = advanceSimulationClock(completed, 9_000, { dayDurationMs: 90_000, maxTickMs: 9_000 });
      let world = advanced.world;
      for (const event of eventsDue(completed, world)) world = applyScheduledEvent(world, event);
      session = { ...session, world, status: advanced.leaseReached ? "lease" : "playing" };
      decisions += 1;
    }

    expect(decisions).toBeGreaterThanOrEqual(60);
    expect(decisions).toBeLessThanOrEqual(100);
    expect(session.status).toBe("lease");
    expect(session.world).toMatchObject({ day: 7, elapsedMs: 90_000 });
    expect(session.world.appliedEventIds).toHaveLength(6);
    expect(new Set(session.world.appliedEventIds).size).toBe(6);
    expect(RoommateSessionSchema.safeParse(session).success).toBe(true);
  });

  it("allows 900 ms days only in explicit mock mode", () => {
    expect(loadConfig({ JEV_MODE: "mock", SIMULATION_DAY_MS: "900" }).simulation.dayDurationMs).toBe(900);
    expect(loadConfig({ JEV_MODE: "live", SIMULATION_DAY_MS: "900" }).simulation.dayDurationMs).toBe(90_000);
  });
});
