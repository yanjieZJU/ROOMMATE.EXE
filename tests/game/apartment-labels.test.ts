import { describe, expect, it } from "vitest";

import { APARTMENT_LAYOUT } from "../../src/game/render/apartment-layout";
import {
  OBJECT_LABEL_STYLE,
  ROOM_LABEL_STYLE,
  placeObjectLabel,
} from "../../src/game/render/apartment-labels";
import { PIXEL_PALETTE } from "../../src/game/render/pixel-texture";

describe("readable apartment labels", () => {
  it("uses legible Chinese fonts and high-contrast sizes", () => {
    expect(ROOM_LABEL_STYLE).toMatchObject({
      fontSize: "11px",
      color: PIXEL_PALETTE.outline,
    });
    expect(OBJECT_LABEL_STYLE).toMatchObject({
      fontSize: "9px",
      color: PIXEL_PALETTE.outline,
      backgroundColor: PIXEL_PALETTE.cream,
      padding: { x: 2, y: 1 },
    });
    expect(ROOM_LABEL_STYLE.fontFamily).toMatch(/Microsoft YaHei|PingFang SC/);
    expect(OBJECT_LABEL_STYLE.fontFamily).toBe(ROOM_LABEL_STYLE.fontFamily);
  });

  it("places object labels outside their orange object while keeping them inside the room", () => {
    for (const object of APARTMENT_LAYOUT.objects) {
      const room = APARTMENT_LAYOUT.rooms.find((candidate) => candidate.id === object.roomId)!;
      const label = placeObjectLabel(object, room);
      const overlapsObject = label.y < object.y + object.height && label.y + label.height > object.y;

      expect(overlapsObject, object.id).toBe(false);
      expect(label.x, object.id).toBeGreaterThanOrEqual(room.x + 2);
      expect(label.y, object.id).toBeGreaterThanOrEqual(room.y + 2);
      expect(label.x + label.width, object.id).toBeLessThanOrEqual(room.x + room.width - 2);
      expect(label.y + label.height, object.id).toBeLessThanOrEqual(room.y + room.height - 2);
    }
  });
});
