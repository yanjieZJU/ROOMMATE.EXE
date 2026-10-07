import { describe, expect, it } from "vitest";

import { ACTION_CATALOG } from "../../src/game/actions/catalog";
import { APARTMENT_LAYOUT, LOGICAL_HEIGHT, LOGICAL_WIDTH } from "../../src/game/render/apartment-layout";
import { ANIMATION_KEYS } from "../../src/game/render/texture-atlas";

function inside(inner: { x: number; y: number; width: number; height: number }, outer: { x: number; y: number; width: number; height: number }) {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
}

describe("fixed apartment cutaway layout", () => {
  it("fits all seven non-overlapping rooms and sixteen objects inside 480×270", () => {
    expect([LOGICAL_WIDTH, LOGICAL_HEIGHT]).toEqual([480, 270]);
    expect(APARTMENT_LAYOUT.rooms).toHaveLength(7);
    expect(APARTMENT_LAYOUT.objects.length).toBeGreaterThanOrEqual(12);
    expect(APARTMENT_LAYOUT.objects.length).toBeLessThanOrEqual(16);

    const canvas = { x: 0, y: 0, width: LOGICAL_WIDTH, height: LOGICAL_HEIGHT };
    for (const room of APARTMENT_LAYOUT.rooms) expect(inside(room, canvas), room.id).toBe(true);
    for (let left = 0; left < APARTMENT_LAYOUT.rooms.length; left += 1) {
      for (let right = left + 1; right < APARTMENT_LAYOUT.rooms.length; right += 1) {
        const a = APARTMENT_LAYOUT.rooms[left]!;
        const b = APARTMENT_LAYOUT.rooms[right]!;
        const overlaps = a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
        expect(overlaps, `${a.id}/${b.id}`).toBe(false);
      }
    }
    for (const object of APARTMENT_LAYOUT.objects) {
      const room = APARTMENT_LAYOUT.rooms.find((candidate) => candidate.id === object.roomId)!;
      expect(inside(object, room), object.id).toBe(true);
    }
  });

  it("provides valid character spawns and connected navigation nodes", () => {
    for (const actorId of ["player", "jev"] as const) {
      const spawn = APARTMENT_LAYOUT.spawns[actorId];
      expect(APARTMENT_LAYOUT.nodes.some((node) => node.id === spawn.nodeId)).toBe(true);
    }
    expect(new Set(APARTMENT_LAYOUT.nodes.map((node) => node.roomId))).toEqual(new Set(APARTMENT_LAYOUT.rooms.map((room) => room.id)));
    for (const node of APARTMENT_LAYOUT.nodes) {
      expect(node.neighbors.every((id) => APARTMENT_LAYOUT.nodes.some((candidate) => candidate.id === id)), node.id).toBe(true);
    }
  });

  it("has a texture-atlas animation for every catalog action", () => {
    const expected = new Set([...ACTION_CATALOG.values()].map((definition) => definition.animationKey));
    expect(new Set(ANIMATION_KEYS)).toEqual(expected);
  });
});
