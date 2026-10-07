import { describe, expect, it } from "vitest";

import { hashDecisionState } from "../../src/game/simulation/state-hash";
import type { DecisionSnapshot } from "../../src/shared/roommate-schemas";

function snapshot(): DecisionSnapshot {
  return {
    decisionPointId: "decision-point-1",
    requestedAt: "2026-09-28T00:00:01.000Z",
    day: 1,
    elapsedMs: 1_000,
    publicEvent: "搬入日",
    observableState: ["Jev 在客厅"],
    relevantFacts: [],
    commitments: [],
    candidates: [
      { id: "wait", definitionId: "wait", actorId: "jev", label: "等待", knownCostText: "四秒", durationMs: 4_000, animationKey: "idle", target: { type: "self", id: null }, targetId: null, effects: [], factTemplates: [] },
      { id: "look", definitionId: "look", actorId: "jev", label: "观察", knownCostText: "四秒", durationMs: 4_000, animationKey: "look", target: { type: "self", id: null }, targetId: null, effects: [], factTemplates: [] },
      { id: "sit", definitionId: "sit", actorId: "jev", label: "坐下", knownCostText: "六秒", durationMs: 6_000, animationKey: "sit", target: { type: "object", id: "sofa" }, targetId: "sofa", effects: [], factTemplates: [] },
    ],
    stateHash: "0".repeat(64),
  };
}

describe("decision state hash", () => {
  it("is independent of object key insertion order", async () => {
    const first = snapshot();
    const reordered = {
      ...first,
      candidates: first.candidates.map((candidate) => ({
        target: candidate.target,
        targetId: candidate.targetId,
        animationKey: candidate.animationKey,
        durationMs: candidate.durationMs,
        knownCostText: candidate.knownCostText,
        label: candidate.label,
        actorId: candidate.actorId,
        definitionId: candidate.definitionId,
        id: candidate.id,
        factTemplates: candidate.factTemplates,
        effects: candidate.effects,
      })),
    } as DecisionSnapshot;

    expect(await hashDecisionState(first)).toBe(await hashDecisionState(reordered));
  });

  it("changes when a relevant fact changes", async () => {
    const first = snapshot();
    const changed = snapshot();
    changed.relevantFacts.push({
      id: "fact-1",
      occurredAt: "2026-09-28T00:00:00.000Z",
      text: "玩家先敲了门",
      actorIds: ["player"],
      roomId: "jev-bedroom",
      objectIds: ["jev-door"],
      status: "ordinary",
      sourceActionId: "knock",
    });

    expect(await hashDecisionState(first)).not.toBe(await hashDecisionState(changed));
  });

  it("changes when a candidate action id changes", async () => {
    const first = snapshot();
    const changed = snapshot();
    changed.candidates[0]!.id = "wait-by-window";

    expect(await hashDecisionState(first)).not.toBe(await hashDecisionState(changed));
  });
});
