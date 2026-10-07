import { describe, expect, it, vi } from "vitest";

import { ACTION_CATALOG } from "../../src/game/actions/catalog";
import {
  ActionExecutor,
  type ActionExecutionPort,
} from "../../src/game/actions/action-executor";
import { applyWorldCommand, type WorldCommand } from "../../src/game/simulation/world-reducer";
import type { CharacterId, MacroAction, QueuedAction, RoommateWorld } from "../../src/shared/roommate-schemas";
import type { NavigationWaypoint } from "../../src/game/navigation/interaction-points";
import { createRoommateFixture } from "../fixtures/roommate";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function entry(world: RoommateWorld, queueId: string, actorId: CharacterId, definitionId: string, targetId?: string): QueuedAction {
  return { queueId, action: ACTION_CATALOG.get(definitionId)!.toMacroAction(world, actorId, targetId ? { type: "object", id: targetId } : undefined) };
}

function harness(worldInput: RoommateWorld, port: ActionExecutionPort) {
  let world = structuredClone(worldInput);
  const executor = new ActionExecutor({
    getWorld: () => world,
    dispatch: (command: WorldCommand) => { world = applyWorldCommand(world, command); },
    port,
    isValid: (current, action) => ACTION_CATALOG.get(action.definitionId)?.isAvailable(current, action.actorId, action.target) ?? false,
    now: () => "2026-09-29T00:00:08.000Z",
  });
  return { executor, world: () => world };
}

const immediatePort: ActionExecutionPort = {
  navigate: async (_actorId: CharacterId, _queueId: string, _waypoints: NavigationWaypoint[], _signal: AbortSignal) => undefined,
  perform: async (_actorId: CharacterId, _queueId: string, _action: MacroAction, _signal: AbortSignal) => undefined,
};

describe("atomic action executor", () => {
  it("updates the actor room along the route before validating the target action", async () => {
    const world = createRoommateFixture().world;
    const { executor, world: current } = harness(world, immediatePort);

    await expect(executor.execute(entry(world, "jev-eat", "jev", "eat-meal", "fridge"))).resolves.toBe("completed");

    expect(current().characters.find((character) => character.id === "jev")?.roomId).toBe("kitchen");
    expect(current().objects.find((object) => object.id === "fridge")?.state.portions).toBe(1);
  });

  it("does not reserve a target until navigation has completed", async () => {
    const world = createRoommateFixture().world;
    world.characters.find((character) => character.id === "jev")!.roomId = "living-room";
    const navigation = deferred();
    const performance = deferred();
    const port: ActionExecutionPort = {
      navigate: async () => navigation.promise,
      perform: async () => performance.promise,
    };
    const { executor, world: current } = harness(world, port);
    const execution = executor.execute(entry(world, "jev-rest", "jev", "rest", "sofa"));

    expect(current().objects.find((object) => object.id === "sofa")?.reservedBy).toBeNull();
    navigation.resolve();
    await vi.waitFor(() => {
      expect(current().objects.find((object) => object.id === "sofa")?.reservedBy).toBe("jev");
    });
    performance.resolve();
    await expect(execution).resolves.toBe("completed");
  });

  it("lets the first arrival reserve a shared object and invalidates the second", async () => {
    const world = createRoommateFixture().world;
    world.characters.forEach((character) => { character.roomId = "living-room"; });
    const firstNavigation = deferred();
    const secondNavigation = deferred();
    const firstPerformance = deferred();
    const port: ActionExecutionPort = {
      navigate: async (actorId) => actorId === "jev" ? firstNavigation.promise : secondNavigation.promise,
      perform: async (actorId) => actorId === "jev" ? firstPerformance.promise : undefined,
    };
    const { executor, world: current } = harness(world, port);
    const first = executor.execute(entry(world, "jev-rest", "jev", "rest", "sofa"));
    const second = executor.execute(entry(world, "player-rest", "player", "rest", "sofa"));

    firstNavigation.resolve();
    await Promise.resolve();
    await Promise.resolve();
    secondNavigation.resolve();
    await expect(second).resolves.toBe("invalidated");
    expect(current().objects.find((object) => object.id === "sofa")?.reservedBy).toBe("jev");
    firstPerformance.resolve();
    await expect(first).resolves.toBe("completed");
  });

  it("cancels performance without applying effects or facts", async () => {
    const world = createRoommateFixture().world;
    world.characters.find((character) => character.id === "jev")!.roomId = "living-room";
    const port: ActionExecutionPort = {
      navigate: async () => undefined,
      perform: async (_actorId, _queueId, _action, signal) => new Promise<void>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")), { once: true });
      }),
    };
    const before = structuredClone(world);
    const { executor, world: current } = harness(world, port);
    const execution = executor.execute(entry(world, "jev-rest", "jev", "rest", "sofa"));
    await Promise.resolve();
    await Promise.resolve();

    executor.cancel("jev-rest");

    await expect(execution).resolves.toBe("cancelled");
    expect(current().characters).toEqual(before.characters);
    expect(current().facts).toEqual(before.facts);
    expect(current().objects.find((object) => object.id === "sofa")?.reservedBy).toBeNull();
  });

  it("can execute the next entry after an invalid first target", async () => {
    const world = createRoommateFixture().world;
    world.characters.find((character) => character.id === "jev")!.roomId = "living-room";
    world.objects.find((object) => object.id === "sofa")!.reservedBy = "player";
    const { executor, world: current } = harness(world, immediatePort);

    await expect(executor.execute(entry(world, "blocked", "jev", "rest", "sofa"))).resolves.toBe("invalidated");
    current().objects.find((object) => object.id === "sofa")!.reservedBy = null;
    await expect(executor.execute(entry(current(), "wait", "jev", "wait"))).resolves.toBe("completed");
    expect(current().facts.at(-1)?.sourceActionId).toBe("wait@jev");
  });
});
