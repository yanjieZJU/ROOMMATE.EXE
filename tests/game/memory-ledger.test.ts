import { describe, expect, it } from "vitest";

import { appendFacts } from "../../src/game/memory/ledger";
import { selectRelevantFacts } from "../../src/game/memory/relevance";
import type { MemoryFact } from "../../src/shared/roommate-schemas";
import { createRoommateFixture } from "../fixtures/roommate";

function fact(overrides: Partial<MemoryFact> & Pick<MemoryFact, "id" | "text">): MemoryFact {
  return {
    occurredAt: "2026-09-28T00:00:00.000Z",
    actorIds: [],
    roomId: null,
    objectIds: [],
    status: "ordinary",
    sourceActionId: null,
    ...overrides,
  };
}

describe("memory ledger", () => {
  it("appends facts idempotently by fact id", () => {
    const world = createRoommateFixture().world;
    const entry = fact({ id: "knock-1", text: "玩家进入房间前先敲了门" });

    const once = appendFacts(world, [entry]);
    const twice = appendFacts(once, [entry]);

    expect(once.facts).toEqual([entry]);
    expect(twice).toBe(once);
    expect(world.facts).toEqual([]);
  });

  it("keeps unresolved facts and ranks matching people, rooms, and objects above unrelated recency", () => {
    const world = createRoommateFixture().world;
    world.facts = [
      fact({ id: "unresolved", text: "玩家答应晚些时候清理餐桌", status: "unresolved", occurredAt: "2026-09-28T00:00:01.000Z" }),
      fact({ id: "same-actor", text: "Jev 把杯子放在了桌边", actorIds: ["jev"], occurredAt: "2026-09-28T00:00:02.000Z" }),
      fact({ id: "same-room", text: "客厅的电视刚被打开", roomId: "living-room", occurredAt: "2026-09-28T00:00:03.000Z" }),
      fact({ id: "same-object", text: "沙发上放着一个纸箱", objectIds: ["sofa"], occurredAt: "2026-09-28T00:00:04.000Z" }),
      fact({ id: "new-unrelated", text: "浴室的灯刚刚关掉", roomId: "bathroom", occurredAt: "2026-09-28T00:00:09.000Z" }),
    ];

    const selected = selectRelevantFacts(world, {
      actorIds: ["jev"],
      roomId: "living-room",
      objectIds: ["sofa"],
    }, 4);

    expect(selected.map((entry) => entry.id)).toEqual(["unresolved", "same-actor", "same-room", "same-object"]);
  });

  it("limits ordinary history to twelve concise factual entries", () => {
    const world = createRoommateFixture().world;
    world.facts = Array.from({ length: 15 }, (_, index) => fact({
      id: `fact-${index.toString().padStart(2, "0")}`,
      text: `第${index + 1}次公开发生的生活事实`,
      occurredAt: new Date(Date.UTC(2026, 8, 28, 0, 0, index)).toISOString(),
    }));

    const selected = selectRelevantFacts(world, { actorIds: [], roomId: null, objectIds: [] });

    expect(selected).toHaveLength(12);
    const rendered = selected.map((entry) => entry.text).join("；");
    expect(rendered).not.toMatch(/好感|信任|续租倾向|内向|善良|谨慎/);
  });

  it("keeps unresolved facts first while capping the complete model context", () => {
    const world = createRoommateFixture().world;
    world.facts = [
      ...Array.from({ length: 6 }, (_, index) => fact({ id: `open-${index}`, text: `尚未解决的事实${index}`, status: "unresolved" })),
      ...Array.from({ length: 12 }, (_, index) => fact({ id: `ordinary-${index}`, text: `普通事实${index}` })),
    ];

    const selected = selectRelevantFacts(world, { actorIds: [], roomId: null, objectIds: [] }, 12);

    expect(selected).toHaveLength(12);
    expect(selected.filter((entry) => entry.status === "unresolved")).toHaveLength(6);
  });
});
