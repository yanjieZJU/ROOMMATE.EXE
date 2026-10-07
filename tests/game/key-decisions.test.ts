import { describe, expect, it } from "vitest";

import { selectKeyDecisions } from "../../src/game/ending/key-decisions";
import type { DecisionSnapshot, RoommateDecision } from "../../src/shared/roommate-schemas";
import { createRoommateFixture } from "../fixtures/roommate";

function decision(id: string, decidedAt: string, publicEvent: string | null, kind: "action" | "lease" = "action"): RoommateDecision {
  const candidates = (kind === "lease" ? ["renew", "leave"] : ["wait", "look", "rest"]).map((actionId) => ({
    id: actionId,
    definitionId: actionId,
    actorId: "jev" as const,
    label: actionId,
    knownCostText: "已知代价",
    durationMs: 4_000,
    animationKey: "idle",
    target: { type: "self" as const, id: null },
    targetId: null,
    effects: [{ path: "characters.jev.needs.focus", operation: "increment" as const, value: -1 }],
    factTemplates: [`${actionId}造成的事实`],
  }));
  const snapshot = {
    kind,
    decisionPointId: id,
    requestedAt: decidedAt,
    day: kind === "lease" ? 7 : 2,
    elapsedMs: 1_000,
    publicEvent,
    observableState: ["公开状态"],
    relevantFacts: [],
    commitments: [],
    candidates,
    stateHash: id.padEnd(64, "a").slice(0, 64),
  } satisfies DecisionSnapshot;
  return {
    id,
    decidedAt,
    stateHash: snapshot.stateHash,
    selectedActionId: candidates[0]!.id,
    probabilities: Object.fromEntries(candidates.map((candidate, index) => [candidate.id, index === 0 ? 0.6 : 0.4 / (candidates.length - 1)])),
    confidence: 0.6,
    model: "jev-1.13-free",
    usage: {},
    snapshot,
  };
}

describe("key decision archive", () => {
  it("keeps event decisions and the final lease choice in chronological order without regeneration", () => {
    const session = createRoommateFixture();
    const routine = decision("routine", "2026-09-28T00:00:01.000Z", null);
    const dinner = decision("dinner", "2026-09-28T00:02:01.000Z", "最后一份晚餐");
    const lease = decision("lease", "2026-09-28T00:10:30.000Z", "租约今晚到期", "lease");
    session.decisions = [routine, lease, dinner];
    session.world.facts.push({
      id: "meal-fact",
      occurredAt: "2026-09-28T00:02:05.000Z",
      text: "Jev 吃掉了最后一份晚餐",
      actorIds: ["jev"],
      roomId: "kitchen",
      objectIds: ["fridge"],
      status: "ordinary",
      sourceActionId: dinner.selectedActionId,
    });
    lease.snapshot.relevantFacts.push(session.world.facts[0]!);

    const archived = selectKeyDecisions(session);

    expect(archived.map((entry) => entry.id)).toEqual(["dinner", "lease"]);
    expect(archived[0]).toMatchObject({
      facts: dinner.snapshot.relevantFacts,
      candidates: dinner.snapshot.candidates,
      probabilities: dinner.probabilities,
      consequences: dinner.snapshot.candidates[0]!.factTemplates,
      laterReferences: ["lease"],
    });
  });
});
