import { describe, expect, it } from "vitest";

import { createInitialRoommateSession } from "../../src/game/simulation/initial-state";
import {
  DecisionSnapshotSchema,
  MacroActionSchema,
  RoommateDecisionSchema,
  RoommateSessionSchema,
} from "../../src/shared/roommate-schemas";
import * as roommateContracts from "../../src/shared/roommate-schemas";

const EXPECTED_ROOM_IDS = [
  "player-bedroom",
  "landing",
  "jev-bedroom",
  "kitchen",
  "living-room",
  "bathroom",
  "entry-balcony",
] as const;

const EXPECTED_OBJECT_IDS = [
  "player-bed",
  "jev-bed",
  "player-door",
  "jev-door",
  "fridge",
  "stove",
  "dining-table",
  "sofa",
  "television",
  "work-desk",
  "shower",
  "trash-bin",
  "storage-cabinet",
  "plant",
  "message-board",
  "fuse-box",
] as const;

describe("ROOMMATE.EXE contracts", () => {
  it("creates the fixed factual seven-room starting session", () => {
    const session = createInitialRoommateSession("2026-09-28T00:00:00.000Z");
    const parsed = RoommateSessionSchema.parse(session);

    expect(parsed.schemaVersion).toBe("roommate-exe/2");
    expect(parsed.status).toBe("playing");
    expect(parsed.world.day).toBe(1);
    expect(parsed.world.elapsedMs).toBe(0);
    expect(parsed.world.characters).toHaveLength(2);
    expect(parsed.world.rooms.map((room) => room.id)).toEqual(EXPECTED_ROOM_IDS);
    expect(parsed.world.objects.map((object) => object.id)).toEqual(EXPECTED_OBJECT_IDS);
    expect(parsed.decisions).toEqual([]);
    expect(parsed.world.relationship).toEqual({ trust: 50, pressure: 20 });
    expect(parsed.world.environment).toEqual({ cleanliness: 70, noise: 10 });
    expect(parsed.world.jevControl).toEqual({ status: "active", consecutiveFailures: 0 });

    const serialized = JSON.stringify(parsed);
    for (const personalityWord of ["内向", "善良", "谨慎", "外向", "友好", "自私"]) {
      expect(serialized).not.toContain(personalityWord);
    }
  });

  it("rejects a v1 session instead of partially restoring it", () => {
    const session = structuredClone(createInitialRoommateSession("2026-09-28T00:00:00.000Z")) as { schemaVersion: string };
    session.schemaVersion = "roommate-exe/1";

    expect(RoommateSessionSchema.safeParse(session).success).toBe(false);
  });

  it("defines target, queued, and active action wrapper schemas", () => {
    const contracts = roommateContracts as unknown as Record<string, { safeParse(value: unknown): { success: boolean } }>;
    const action = {
      id: "rest@sofa",
      definitionId: "rest",
      actorId: "jev",
      label: "坐下休息",
      knownCostText: "占用座位八秒",
      durationMs: 8_000,
      animationKey: "sit",
      target: { type: "object", id: "sofa" },
      targetId: "sofa",
      targetRoomId: "living-room",
      effects: [],
      factTemplates: [],
    };

    expect(contracts.ActionTargetSchema?.safeParse(action.target).success).toBe(true);
    expect(contracts.QueuedActionSchema?.safeParse({ queueId: "queue-1", action }).success).toBe(true);
    expect(contracts.ActiveActionSchema?.safeParse({ queueId: "queue-1", action, startedAt: "2026-09-29T00:00:00.000Z" }).success).toBe(true);
  });

  it("accepts eight uniquely targeted action candidates", () => {
    const candidates = Array.from({ length: 8 }, (_, index) => ({
      id: `rest@seat-${index}`,
      definitionId: "rest",
      actorId: "jev" as const,
      label: `在座位 ${index} 休息`,
      knownCostText: "占用座位八秒",
      durationMs: 8_000,
      animationKey: "sit",
      target: { type: "object" as const, id: `seat-${index}` },
      targetId: `seat-${index}`,
      targetRoomId: "living-room",
      effects: [],
      factTemplates: [],
    }));

    expect(new Set(candidates.map((candidate) => candidate.id)).size).toBe(8);
    expect(DecisionSnapshotSchema.safeParse({
      kind: "action",
      decisionPointId: "point-8",
      requestedAt: "2026-09-29T00:00:00.000Z",
      day: 1,
      elapsedMs: 0,
      publicEvent: null,
      observableState: ["Jev 正在观察公寓"],
      relevantFacts: [],
      commitments: [],
      candidates,
      stateHash: "a".repeat(64),
    }).success).toBe(true);
  });

  it("rejects duplicate apartment object ids", () => {
    const session = structuredClone(createInitialRoommateSession("2026-09-28T00:00:00.000Z"));
    session.world.objects[1]!.id = session.world.objects[0]!.id;

    expect(RoommateSessionSchema.safeParse(session).success).toBe(false);
  });

  it("rejects a world beyond the seventh day", () => {
    const session = structuredClone(createInitialRoommateSession("2026-09-28T00:00:00.000Z"));
    session.world.day = 8;

    expect(RoommateSessionSchema.safeParse(session).success).toBe(false);
  });

  it.each([3_999, 12_001])("rejects a macro action lasting %i ms", (durationMs) => {
    const candidate = {
      id: "wait",
      definitionId: "wait",
      actorId: "jev",
      label: "稍等片刻",
      knownCostText: "花费几秒",
      durationMs,
      animationKey: "jev-idle",
      target: { type: "self", id: null },
      targetId: null,
    };

    expect(MacroActionSchema.safeParse(candidate).success).toBe(false);
  });

  it("rejects a decision whose selected action is absent from probabilities", () => {
    const decision = {
      id: "decision-1",
      decidedAt: "2026-09-28T00:00:04.000Z",
      stateHash: "a".repeat(64),
      selectedActionId: "cook-dinner",
      probabilities: { wait: 1 },
      confidence: 0.7,
      model: "jev-1.13-free",
      usage: {},
      snapshot: {
        decisionPointId: "point-1",
        requestedAt: "2026-09-28T00:00:03.000Z",
        day: 1,
        elapsedMs: 3_000,
        publicEvent: null,
        observableState: ["Jev 在厨房"],
        relevantFacts: [],
        commitments: [],
        candidates: [
          {
            id: "wait",
            definitionId: "wait",
            actorId: "jev",
            label: "稍等片刻",
            knownCostText: "花费几秒",
            durationMs: 4_000,
            animationKey: "jev-idle",
            target: { type: "self", id: null },
            targetId: null,
          },
          {
            id: "look-around",
            definitionId: "look-around",
            actorId: "jev",
            label: "环顾四周",
            knownCostText: "短暂停留",
            durationMs: 4_000,
            animationKey: "jev-look",
            target: { type: "self", id: null },
            targetId: null,
          },
          {
            id: "sit-down",
            definitionId: "sit-down",
            actorId: "jev",
            label: "坐下休息",
            knownCostText: "占用沙发",
            durationMs: 6_000,
            animationKey: "jev-sit",
            target: { type: "object", id: "sofa" },
            targetId: "sofa",
          },
        ],
        stateHash: "a".repeat(64),
      },
    };

    expect(RoommateDecisionSchema.safeParse(decision).success).toBe(false);
  });
});
