import { describe, expect, it } from "vitest";

import { interactionPointFor } from "../../src/game/navigation/interaction-points";
import { findNavigationPath, findRoomPath } from "../../src/game/navigation/pathfinder";
import { createRoommateFixture } from "../fixtures/roommate";

describe("apartment navigation", () => {
  it("finds the shortest cross-floor route from Jev's bedroom to the fridge", () => {
    const world = createRoommateFixture().world;
    const target = { type: "object" as const, id: "fridge" };

    const path = findNavigationPath("jev-bedroom", target, world);

    expect(path?.map((waypoint) => waypoint.nodeId)).toEqual([
      "node-landing",
      "node-living-room",
      "node-kitchen",
      "object-fridge",
    ]);
    expect(path?.at(-1)).toEqual(interactionPointFor(target, world));
  });

  it("uses the character's current room rather than its spawn", () => {
    const world = createRoommateFixture().world;
    world.characters.find((character) => character.id === "jev")!.roomId = "living-room";

    const path = findNavigationPath("player-bedroom", { type: "character", id: "jev" }, world);

    expect(path?.map((waypoint) => waypoint.nodeId)).toEqual([
      "node-landing",
      "node-living-room",
      "character-jev",
    ]);
  });

  it("returns only the interaction point for a target in the same room", () => {
    const world = createRoommateFixture().world;

    expect(findNavigationPath("kitchen", { type: "object", id: "fridge" }, world)?.map((point) => point.nodeId))
      .toEqual(["object-fridge"]);
  });

  it("returns null for unknown targets and disconnected rooms", () => {
    const world = createRoommateFixture().world;

    expect(findNavigationPath("kitchen", { type: "object", id: "missing" }, world)).toBeNull();
    expect(findRoomPath([
      { id: "a", roomId: "a", x: 0, y: 0, neighbors: [] },
      { id: "b", roomId: "b", x: 10, y: 0, neighbors: [] },
    ], "a", "b")).toBeNull();
  });
});
