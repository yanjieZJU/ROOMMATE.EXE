import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";

import { RoommateRepository } from "../../src/client/state/roommate-repository";
import { ACTION_CATALOG } from "../../src/game/actions/catalog";
import { applyWorldCommand, completeMacroAction } from "../../src/game/simulation/world-reducer";
import { createRoommateFixture } from "../fixtures/roommate";

describe("RoommateRepository", () => {
  it("atomically stores a completed world, its facts, and an optional decision", async () => {
    const repository = new RoommateRepository({ dbName: `roommate-test-${crypto.randomUUID()}` });
    const session = createRoommateFixture();
    const definition = ACTION_CATALOG.get("wait")!;
    const action = definition.toMacroAction(session.world, "jev");
    const started = applyWorldCommand(session.world, { type: "start-action", entry: { queueId: "wait-1", action, startedAt: "2026-09-28T00:00:00.000Z" } });
    const completed = completeMacroAction(started, action, "2026-09-28T00:00:04.000Z");

    const committed = await repository.commitTransition(session, {
      world: completed,
      completedAt: "2026-09-28T00:00:04.000Z",
    });
    const loaded = await repository.loadLatest();

    expect(loaded).toEqual(committed);
    expect(loaded?.world.revision).toBe(2);
    expect(loaded?.world.facts.at(-1)?.sourceActionId).toBe("wait@jev");
    expect(loaded?.world.activeActions).toEqual([]);
  });

  it("keeps the prior revision when the IndexedDB transaction aborts", async () => {
    const dbName = `roommate-test-${crypto.randomUUID()}`;
    const repository = new RoommateRepository({ dbName });
    const session = createRoommateFixture();
    const first = await repository.commitTransition(session, {
      world: { ...session.world, revision: 1 },
      completedAt: "2026-09-28T00:00:01.000Z",
    });
    const failing = new RoommateRepository({ dbName, beforeSessionPut: () => { throw new Error("simulated abort"); } });

    await expect(failing.commitTransition(first, {
      world: { ...first.world, revision: 2 },
      completedAt: "2026-09-28T00:00:02.000Z",
    })).rejects.toThrow("simulated abort");

    expect((await repository.loadLatest())?.world.revision).toBe(1);
  });

  it("refreshes to the last complete commit rather than an in-flight reservation", async () => {
    const repository = new RoommateRepository({ dbName: `roommate-test-${crypto.randomUUID()}` });
    const session = createRoommateFixture();
    await repository.commitTransition(session, { world: { ...session.world, revision: 1 }, completedAt: "2026-09-28T00:00:01.000Z" });

    const action = ACTION_CATALOG.get("wait")!.toMacroAction(session.world, "jev");
    applyWorldCommand(session.world, { type: "start-action", entry: { queueId: "wait-2", action, startedAt: "2026-09-28T00:00:00.000Z" } });
    const recovered = await repository.loadLatest();

    expect(recovered?.world.revision).toBe(1);
    expect(recovered?.world.activeActions).toEqual([]);
    expect(recovered?.world.objects.every((object) => object.reservedBy === null)).toBe(true);
  });

  it("rejects malformed and wrong-version imports", async () => {
    const repository = new RoommateRepository({ dbName: `roommate-test-${crypto.randomUUID()}` });

    await expect(repository.importSession("not json")).rejects.toThrow(/JSON/);
    await expect(repository.importSession(JSON.stringify({ ...createRoommateFixture(), schemaVersion: "roommate-exe/99" }))).rejects.toThrow(/版本|格式/);
  });
});
