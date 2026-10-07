import { describe, expect, it } from "vitest";

import {
  applyWorldCommand,
  completeMacroAction,
  WorldRuleError,
} from "../../src/game/simulation/world-reducer";
import type { MacroAction } from "../../src/shared/roommate-schemas";
import { createRoommateFixture } from "../fixtures/roommate";

const cookAction: MacroAction = {
  id: "cook-soup",
  definitionId: "cook-meal",
  actorId: "jev",
  label: "煮一份汤",
  knownCostText: "使用一份食材并花费八秒",
  durationMs: 8_000,
  animationKey: "jev-cook",
  target: { type: "object", id: "fridge" },
  targetId: "fridge",
  targetRoomId: "kitchen",
  effects: [
    { path: "characters.jev.roomId", operation: "set", value: "kitchen" },
    { path: "characters.jev.needs.hunger", operation: "increment", value: -20 },
    { path: "characters.jev.inventory", operation: "append", value: "soup" },
    { path: "objects.fridge.state.portions", operation: "increment", value: -1 },
  ],
  factTemplates: ["Jev 用冰箱里的食材煮了一份汤"],
};

const cookEntry = {
  queueId: "cook-1",
  action: cookAction,
  startedAt: "2026-09-28T00:00:00.000Z",
};

describe("world reducer", () => {
  it("moves only across the fixed room navigation graph", () => {
    const world = createRoommateFixture().world;
    const moved = applyWorldCommand(world, { type: "move", actorId: "player", toRoomId: "landing" });

    expect(moved.characters.find((character) => character.id === "player")?.roomId).toBe("landing");
    expect(moved.revision).toBe(1);
    expect(world.characters.find((character) => character.id === "player")?.roomId).toBe("player-bedroom");

    expect(() => applyWorldCommand(world, { type: "move", actorId: "player", toRoomId: "kitchen" }))
      .toThrowError(WorldRuleError);
  });

  it("reserves the actor and target when an action starts", () => {
    const world = createRoommateFixture().world;
    const started = applyWorldCommand(world, { type: "start-action", entry: cookEntry });

    expect(started.activeActions).toEqual([cookEntry]);
    expect(started.objects.find((object) => object.id === "fridge")?.reservedBy).toBe("jev");
    expect(started.revision).toBe(1);
    expect(world.activeActions).toEqual([]);
    expect(world.objects.find((object) => object.id === "fridge")?.reservedBy).toBeNull();
  });

  it("completes all action effects and fact insertion atomically", () => {
    const world = createRoommateFixture().world;
    const started = applyWorldCommand(world, { type: "start-action", entry: cookEntry });
    const completed = completeMacroAction(started, cookAction, "2026-09-28T00:00:08.000Z");
    const jev = completed.characters.find((character) => character.id === "jev");
    const fridge = completed.objects.find((object) => object.id === "fridge");

    expect(jev).toMatchObject({ roomId: "kitchen", needs: { hunger: 5 }, inventory: ["soup"] });
    expect(fridge).toMatchObject({ state: { portions: 1 }, reservedBy: null });
    expect(completed.activeActions).toEqual([]);
    expect(completed.facts.at(-1)).toMatchObject({
      text: "Jev 用冰箱里的食材煮了一份汤",
      actorIds: ["jev"],
      roomId: "kitchen",
      objectIds: ["fridge"],
    });
    expect(completed.revision).toBe(2);
    expect(started.revision).toBe(1);
  });

  it("rejects invalid completion without mutating the input", () => {
    const world = createRoommateFixture().world;
    const before = structuredClone(world);

    expect(() => completeMacroAction(world, cookAction, "2026-09-28T00:00:08.000Z"))
      .toThrowError(expect.objectContaining({ code: "INVALID_INPUT" }));
    expect(world).toEqual(before);
  });

  it("pauses, resumes, and transitions days through commands", () => {
    const world = createRoommateFixture().world;
    const paused = applyWorldCommand(world, { type: "pause" });
    const resumed = applyWorldCommand(paused, { type: "resume" });
    const nextDay = applyWorldCommand(resumed, { type: "day-transition", nextDay: 2 });

    expect(paused.paused).toBe(true);
    expect(resumed.paused).toBe(false);
    expect(nextDay).toMatchObject({ day: 2, elapsedMs: 0, publicEvent: null, revision: 3 });
  });
});
