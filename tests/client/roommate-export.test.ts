import { describe, expect, it } from "vitest";

import { exportRoommateSession } from "../../src/client/export/roommate-export";
import { resolveAffordances } from "../../src/game/actions/affordance-resolver";
import { buildDecisionSnapshot } from "../../src/game/jev/decision-snapshot";
import { createRoommateFixture } from "../fixtures/roommate";

describe("ROOMMATE.EXE export", () => {
  it("retains factual decisions while stripping service and request secrets", async () => {
    const session = createRoommateFixture();
    session.world.facts.push({
      id: "fact-1",
      occurredAt: "2026-09-28T00:00:04.000Z",
      text: "玩家在进入房间前敲了门",
      actorIds: ["player"],
      roomId: "jev-bedroom",
      objectIds: ["jev-door"],
      status: "ordinary",
      sourceActionId: "knock",
    });
    const snapshot = await buildDecisionSnapshot(session.world, resolveAffordances(session.world, "jev"));
    session.decisions.push({
      id: "decision-1",
      decidedAt: "2026-09-28T00:00:05.000Z",
      stateHash: snapshot.stateHash,
      selectedActionId: snapshot.candidates[0]!.id,
      probabilities: Object.fromEntries(snapshot.candidates.map((candidate, index) => [candidate.id, index === 0 ? 1 : 0])),
      confidence: 1,
      model: "jev-1.13-free",
      usage: { input_tokens: 10, output_tokens: 3 },
      snapshot,
    });
    const unsafe = Object.assign(structuredClone(session), {
      apiKey: "secret-key",
      ip: "203.0.113.42",
      installationId: "install-private",
      quotaId: "quota-private",
      serverLogId: "log-private",
      rawPrompt: "private prompt",
      idempotencyKey: "retry-private",
    });

    const exported = exportRoommateSession(unsafe);

    expect(exported).toContain("玩家在进入房间前敲了门");
    expect(exported).toContain("decision-1");
    expect(exported).toContain("jev-1.13-free");
    for (const forbidden of ["secret-key", "203.0.113.42", "install-private", "quota-private", "log-private", "private prompt", "retry-private"]) {
      expect(exported).not.toContain(forbidden);
    }
  });
});
