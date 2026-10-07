import type { LayoutRect } from "./apartment-layout";
import { PIXEL_PALETTE } from "./pixel-texture";

const CHINESE_UI_FONT = '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif';

export const ROOM_LABEL_STYLE = {
  fontFamily: CHINESE_UI_FONT,
  fontSize: "11px",
  fontStyle: "bold",
  color: PIXEL_PALETTE.outline,
} as const;

export const OBJECT_LABEL_STYLE = {
  fontFamily: CHINESE_UI_FONT,
  fontSize: "9px",
  fontStyle: "bold",
  color: PIXEL_PALETTE.outline,
  backgroundColor: PIXEL_PALETTE.cream,
  padding: { x: 2, y: 1 },
} as const;

export interface LabelPlacement extends LayoutRect {}

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

export function placeObjectLabel(object: LayoutRect, room: LayoutRect, text = "物品"): LabelPlacement {
  const height = 13;
  const width = Math.min(room.width - 4, Math.max(20, [...text].length * 9 + 4));
  const x = Math.round(clamp(object.x + object.width / 2 - width / 2, room.x + 2, room.x + room.width - width - 2));
  const above = object.y - height - 2;
  const roomTitleBottom = room.y + 18;
  const below = object.y + object.height + 2;
  const y = above >= roomTitleBottom ? above : clamp(below, roomTitleBottom, room.y + room.height - height - 2);
  return { x, y, width, height };
}
