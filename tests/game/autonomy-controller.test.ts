import { describe, expect, it, vi } from "vitest";

import { resolveAffordances } from "../../src/game/actions/affordance-resolver";
import { JevAutonomyController } from "../../src/game/jev/autonomy-controller";
import { buildDecisionSnapshot } from "../../src/game/jev/decision-snapshot";
import type { RoommateDecision } from "../../src/shared/roommate-schemas";
import { createRoommateFixture } from "../fixtures/roommate";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => { resolve = fulfill; });
  return { promise, resolve };
}

describe("Jev autonomy controller", () => {
  it("allows only one in-flight decision and discards a stale response", async () => {
    const world = createRoommateFixture().world;
    const input = await buildDecisionSnapshot(world, resolveAffordances(world, "jev"));
    const pending = deferred<RoommateDecision>();
    let currentHash = input.stateHash;
    const commit = vi.fn();
    const controller = new JevAutonomyController({
      decide: vi.fn(() => pending.promise),
      currentStateHash: () => currentHash,
      commit,
    });

    const first = controller.request(input);
    await expect(controller.request(input)).rejects.toMatchObject({ code: "SESSION_CONFLICT" });
    currentHash = "f".repeat(64);
    pending.resolve({
      id: "decision-1",
      decidedAt: "2026-09-28T00:00:04.000Z",
      stateHash: input.stateHash,
      selectedActionId: input.candidates[0]!.id,
      probabilities: Object.fromEntries(input.candidates.map((candidate, index) => [candidate.id, index === 0 ? 1 : 0])),
      confidence: 1,
      model: "jev-1.13-free",
      usage: {},
      snapshot: input,
    });

    await expect(first).resolves.toBe("stale");
    expect(commit).not.toHaveBeenCalled();
  });

  it("can commit a refreshed snapshot after the stale request settles", async () => {
    const world = createRoommateFixture().world;
    const input = await buildDecisionSnapshot(world, resolveAffordances(world, "jev"));
    const decision: RoommateDecision = {
      id: "decision-2",
      decidedAt: "2026-09-28T00:00:05.000Z",
      stateHash: input.stateHash,
      selectedActionId: input.candidates[0]!.id,
      probabilities: Object.fromEntries(input.candidates.map((candidate, index) => [candidate.id, index === 0 ? 1 : 0])),
      confidence: 1,
      model: "jev-1.13-free",
      usage: {},
      snapshot: input,
    };
    const commit = vi.fn();
    const controller = new JevAutonomyController({ decide: vi.fn(async () => decision), currentStateHash: () => input.stateHash, commit });

    await expect(controller.request(input)).resolves.toBe("committed");
    expect(commit).toHaveBeenCalledWith(decision);
    await expect(controller.request(input)).resolves.toBe("committed");
  });
});
