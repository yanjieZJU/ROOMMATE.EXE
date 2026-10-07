import { describe, expect, it } from "vitest";

import { resolveAffordances } from "../../src/game/actions/affordance-resolver";
import { buildDecisionSnapshot } from "../../src/game/jev/decision-snapshot";
import { hashDecisionState } from "../../src/game/simulation/state-hash";
import { DecisionSnapshotSchema } from "../../src/shared/roommate-schemas";
import { createRoommateFixture } from "../fixtures/roommate";

describe("Jev decision snapshot", () => {
  it("contains only bounded executable actions and observable factual context", async () => {
    const world = createRoommateFixture().world;
    world.commitments.push({
      id: "clean-table",
      createdAt: "2026-09-28T00:00:00.000Z",
      text: "玩家说晚些时候会清理餐桌",
      participantIds: ["player", "jev"],
      status: "open",
      dueDay: 1,
    });
    const candidates = resolveAffordances(world, "jev");

    const snapshot = await buildDecisionSnapshot(world, candidates, { sessionId: "session-7", decisionIndex: 4 });
    const parsed = DecisionSnapshotSchema.parse(snapshot);

    expect(parsed.candidates.length).toBeGreaterThanOrEqual(3);
    expect(parsed.candidates.length).toBeLessThanOrEqual(8);
    expect(parsed.candidates.map(({ id, knownCostText }) => ({ id, knownCostText }))).toEqual(
      candidates.map(({ id, knownCostText }) => ({ id, knownCostText })),
    );
    expect(parsed.commitments.map((commitment) => commitment.id)).toContain("clean-table");
    expect(parsed).toMatchObject({ sessionId: "session-7", decisionIndex: 4 });
    expect(parsed.stateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(await hashDecisionState(parsed)).toBe(parsed.stateHash);

    const visible = parsed.observableState.join("；");
    expect(visible).toContain("有些饿");
    expect(visible).toContain("精力一般");
    expect(visible).toContain("心情");
    expect(visible).toContain("专注");
    expect(visible).not.toMatch(/hunger|energy|stress|mood|focus|好感|信任|续租|内向|善良|谨慎|\b\d{2,3}\b/);
  });

  it("rejects fewer than three candidate actions", async () => {
    const world = createRoommateFixture().world;
    const candidates = resolveAffordances(world, "jev").slice(0, 2);

    await expect(buildDecisionSnapshot(world, candidates)).rejects.toThrow(/3–8/);
  });
});
