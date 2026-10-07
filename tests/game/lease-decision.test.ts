import { describe, expect, it, vi } from "vitest";

import { classifyLeaseEnding, requestJevLeaseChoice, submitPlayerLeaseChoice } from "../../src/game/ending/lease-decision";
import type { DecisionSnapshot, RoommateDecision } from "../../src/shared/roommate-schemas";
import { createRoommateFixture } from "../fixtures/roommate";

describe("lease decision", () => {
  it("stores the player choice without revealing it before Jev answers", () => {
    const session = createRoommateFixture();
    session.world.day = 7;
    session.status = "lease";

    const chosen = submitPlayerLeaseChoice(session, "renew");

    expect(chosen.lease).toEqual({ playerChoice: "renew", jevChoice: null, revealed: false });
    expect(chosen.status).toBe("lease");
  });

  it("asks Jev to choose exactly renew or leave and then reveals both", async () => {
    const base = createRoommateFixture();
    base.status = "lease";
    base.world.day = 7;
    const session = submitPlayerLeaseChoice(base, "leave");
    const decide = vi.fn(async (snapshot: DecisionSnapshot): Promise<RoommateDecision> => ({
      id: "lease-decision",
      decidedAt: "2026-09-28T00:10:30.000Z",
      stateHash: snapshot.stateHash,
      selectedActionId: "renew",
      probabilities: { renew: 0.7, leave: 0.3 },
      confidence: 0.7,
      model: "jev-1.13-free",
      usage: {},
      snapshot,
    }));

    const completed = await requestJevLeaseChoice(session, decide);
    const sent = decide.mock.calls[0]![0];

    expect(sent.kind).toBe("lease");
    expect(sent.candidates.map((candidate) => candidate.id)).toEqual(["renew", "leave"]);
    expect(completed.lease).toEqual({ playerChoice: "leave", jevChoice: "renew", revealed: true });
    expect(completed.status).toBe("complete");
    expect(completed.decisions.at(-1)?.id).toBe("lease-decision");
  });

  it("maps all four combinations to distinct score-free endings", () => {
    const endings = [
      classifyLeaseEnding("renew", "renew"),
      classifyLeaseEnding("renew", "leave"),
      classifyLeaseEnding("leave", "renew"),
      classifyLeaseEnding("leave", "leave"),
    ];

    expect(new Set(endings.map((ending) => ending.kind)).size).toBe(4);
    expect(new Set(endings.map((ending) => ending.copy)).size).toBe(4);
    expect(JSON.stringify(endings)).not.toMatch(/分数|最佳|人格|性格总结/);
  });
});
