import { describe, expect, it } from "vitest";

import { ACTION_CATALOG } from "../../src/game/actions/catalog";
import { cancel, enqueue, reorder } from "../../src/game/actions/action-queue";
import type { QueuedAction } from "../../src/shared/roommate-schemas";
import { createRoommateFixture } from "../fixtures/roommate";

function entry(queueId: string): QueuedAction {
  const world = createRoommateFixture().world;
  return { queueId, action: ACTION_CATALOG.get("wait")!.toMacroAction(world, "player") };
}

describe("player action queue", () => {
  it("keeps FIFO order and rejects a fourth entry", () => {
    const queued = enqueue(enqueue(enqueue([], entry("one")), entry("two")), entry("three"));

    expect(queued.map((item) => item.queueId)).toEqual(["one", "two", "three"]);
    expect(() => enqueue(queued, entry("four"))).toThrowError(RangeError);
  });

  it("cancels and reorders without mutating the original queue", () => {
    const original = [entry("one"), entry("two"), entry("three")];

    expect(cancel(original, "two").map((item) => item.queueId)).toEqual(["one", "three"]);
    expect(reorder(original, "three", 0).map((item) => item.queueId)).toEqual(["three", "one", "two"]);
    expect(original.map((item) => item.queueId)).toEqual(["one", "two", "three"]);
  });
});
