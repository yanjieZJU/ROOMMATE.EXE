import { describe, expect, it } from "vitest";

import { ACTION_CATALOG } from "../../src/game/actions/catalog";
import { SEVEN_DAY_EVENTS } from "../../src/game/events/seven-day-events";

const MVP_ACTION_IDS = [
  "wait", "observe-room", "rest", "sleep", "cook-meal", "eat-meal", "buy-food", "clean", "take-trash",
  "repair", "watch-tv", "work", "shower", "read-board", "knock", "invite", "help", "refuse", "apologize",
] as const;

describe("roommate action catalog", () => {
  it("covers the complete MVP macro-action vocabulary", () => {
    expect([...ACTION_CATALOG.keys()]).toEqual(MVP_ACTION_IDS);

    const categories = new Set([...ACTION_CATALOG.values()].map((definition) => definition.category));
    expect(categories).toEqual(new Set([
      "movement-rest",
      "food",
      "care-repair",
      "use-borrow-return",
      "social",
    ]));

    for (const definition of ACTION_CATALOG.values()) {
      expect(definition.durationMs, definition.id).toBeGreaterThanOrEqual(4_000);
      expect(definition.durationMs, definition.id).toBeLessThanOrEqual(12_000);
      expect(definition.animationKey, definition.id).not.toBe("");
      expect(definition.effectTemplates.length, definition.id).toBeGreaterThan(0);
      expect(definition.factTemplates.length, definition.id).toBeGreaterThan(0);
    }
  });

  it("keeps four disruptions between move-in and lease markers", () => {
    expect(SEVEN_DAY_EVENTS.map((event) => event.id)).toEqual([
      "day-1-move-in",
      "day-2-last-dinner",
      "day-3-quiet-night",
      "day-4-visitor",
      "day-6-illness-blackout",
      "day-7-lease",
    ]);
  });
});
