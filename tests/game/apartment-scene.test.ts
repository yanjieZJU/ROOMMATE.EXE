import { describe, expect, it } from "vitest";

import { GameBridge } from "../../src/client/game/game-bridge";
import { registerSceneActionHandlers, type SceneActionDriver } from "../../src/game/scenes/scene-action-controller";
import type { CharacterId, MacroAction } from "../../src/shared/roommate-schemas";
import type { NavigationWaypoint } from "../../src/game/navigation/interaction-points";

describe("apartment scene action controller", () => {
  it("moves both characters concurrently and reports their own queue completions", async () => {
    const bridge = new GameBridge();
    const positions = new Map<CharacterId, NavigationWaypoint>();
    const driver: SceneActionDriver = {
      navigate: async (actorId, waypoints) => { positions.set(actorId, waypoints.at(-1)!); },
      perform: async (_actorId: CharacterId, _action: MacroAction) => undefined,
      cancel: () => undefined,
    };
    registerSceneActionHandlers(bridge, driver);
    const completed: string[] = [];
    bridge.on("navigationCompleted", ({ queueId }) => completed.push(queueId));

    bridge.emit("navigateAction", { actorId: "jev", queueId: "jev-route", waypoints: [{ nodeId: "kitchen", roomId: "kitchen", x: 20, y: 30 }] });
    bridge.emit("navigateAction", { actorId: "player", queueId: "player-route", waypoints: [{ nodeId: "living", roomId: "living-room", x: 200, y: 220 }] });
    await Promise.resolve();
    await Promise.resolve();

    expect(positions.get("jev")?.roomId).toBe("kitchen");
    expect(positions.get("player")?.roomId).toBe("living-room");
    expect(completed.sort()).toEqual(["jev-route", "player-route"]);
  });

  it("detaches every scene request listener on shutdown", async () => {
    const bridge = new GameBridge();
    let calls = 0;
    const driver: SceneActionDriver = {
      navigate: async () => { calls += 1; },
      perform: async () => { calls += 1; },
      cancel: () => { calls += 1; },
    };
    const detach = registerSceneActionHandlers(bridge, driver);
    detach();

    bridge.emit("navigateAction", { actorId: "jev", queueId: "route", waypoints: [] });
    bridge.emit("cancelVisualAction", { queueId: "route" });
    await Promise.resolve();

    expect(calls).toBe(0);
  });
});
