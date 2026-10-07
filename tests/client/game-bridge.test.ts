import { describe, expect, it } from "vitest";

import { createBridgeExecutionPort, GameBridge } from "../../src/client/game/game-bridge";
import { ACTION_CATALOG } from "../../src/game/actions/catalog";
import { createRoommateFixture } from "../fixtures/roommate";

describe("GameBridge execution port", () => {
  it("resolves navigation and performance only for the matching queue id", async () => {
    const bridge = new GameBridge();
    const port = createBridgeExecutionPort(bridge);
    const controller = new AbortController();
    const world = createRoommateFixture().world;
    const action = ACTION_CATALOG.get("rest")!.toMacroAction(world, "jev", { type: "object", id: "sofa" });
    const first = port.perform("jev", "first", action, controller.signal);
    const second = port.perform("jev", "second", action, controller.signal);
    let firstResolved = false;
    void first.then(() => { firstResolved = true; });

    bridge.emit("performanceCompleted", { actorId: "jev", queueId: "second" });
    await expect(second).resolves.toBeUndefined();
    expect(firstResolved).toBe(false);
    bridge.emit("performanceCompleted", { actorId: "jev", queueId: "first" });
    await expect(first).resolves.toBeUndefined();
  });

  it("aborts one visual request without rejecting another", async () => {
    const bridge = new GameBridge();
    const port = createBridgeExecutionPort(bridge);
    const firstController = new AbortController();
    const secondController = new AbortController();
    const cancelled: string[] = [];
    bridge.on("cancelVisualAction", ({ queueId }) => cancelled.push(queueId));
    const first = port.navigate("jev", "first", [], firstController.signal);
    const second = port.navigate("player", "second", [], secondController.signal);

    firstController.abort();

    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelled).toEqual(["first"]);
    bridge.emit("navigationCompleted", { actorId: "player", queueId: "second" });
    await expect(second).resolves.toBeUndefined();
  });
});
