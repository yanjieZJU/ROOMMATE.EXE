import { describe, expect, it } from "vitest";

import { ACTION_CATALOG } from "../../src/game/actions/catalog";
import { applyScheduledEvent, eventsDue } from "../../src/game/events/scheduler";
import { SEVEN_DAY_EVENTS } from "../../src/game/events/seven-day-events";
import { createRoommateFixture } from "../fixtures/roommate";

describe("fixed seven-day events", () => {
  it("defines four disruptions between move-in and lease markers with catalog-backed handling paths", () => {
    expect(SEVEN_DAY_EVENTS.map((event) => event.id)).toEqual([
      "day-1-move-in",
      "day-2-last-dinner",
      "day-3-quiet-night",
      "day-4-visitor",
      "day-6-illness-blackout",
      "day-7-lease",
    ]);
    expect(SEVEN_DAY_EVENTS.map((event) => event.day)).toEqual([1, 2, 3, 4, 6, 7]);
    for (const event of SEVEN_DAY_EVENTS) {
      expect(event.handlingActionIds.length, event.id).toBeGreaterThanOrEqual(2);
      expect(event.handlingActionIds.every((id) => ACTION_CATALOG.has(id)), event.id).toBe(true);
    }
  });

  it("reports all unapplied events due by the next clock state in chronological order", () => {
    const previous = createRoommateFixture().world;
    const next = structuredClone(previous);
    next.day = 3;
    next.elapsedMs = 1;

    expect(eventsDue(previous, next).map((event) => event.id)).toEqual([
      "day-1-move-in",
      "day-2-last-dinner",
      "day-3-quiet-night",
    ]);
  });

  it("applies every event as a concrete, idempotent world change", () => {
    let world = createRoommateFixture().world;
    for (const event of SEVEN_DAY_EVENTS) world = applyScheduledEvent(world, event);

    expect(world.objects.find((object) => object.id === "storage-cabinet")?.state.boxes).toBe(3);
    expect(world.objects.find((object) => object.id === "fridge")?.state).toMatchObject({ portions: 1, working: true });
    expect(world.objects.find((object) => object.id === "work-desk")?.state.quietRequired).toBe(true);
    expect(world.objects.find((object) => object.id === "sofa")?.state.visitorPresent).toBe(true);
    expect(world.objects.find((object) => object.id === "fuse-box")?.state.working).toBe(false);
    expect(world.characters.find((character) => character.id === "jev")?.needs.mood).toBeLessThan(65);
    expect(world.publicEvent).toBe("租约今晚到期");
    expect(world.appliedEventIds).toHaveLength(6);

    const replayed = applyScheduledEvent(world, SEVEN_DAY_EVENTS[5]!);
    expect(replayed).toBe(world);
    expect(replayed.appliedEventIds).toHaveLength(6);
  });
});
