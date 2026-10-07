import type { CharacterId } from "../../shared/roommate-schemas";

export const LOGICAL_WIDTH = 480;
export const LOGICAL_HEIGHT = 270;

export interface LayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RoomLayout extends LayoutRect {
  id: string;
  label: string;
}

export interface ObjectLayout extends LayoutRect {
  id: string;
  roomId: string;
}

export interface NavigationNode {
  id: string;
  roomId: string;
  x: number;
  y: number;
  neighbors: string[];
}

const rooms: RoomLayout[] = [
  { id: "player-bedroom", label: "你的卧室", x: 4, y: 4, width: 140, height: 100 },
  { id: "landing", label: "楼梯平台", x: 144, y: 4, width: 192, height: 100 },
  { id: "jev-bedroom", label: "Jev 的卧室", x: 336, y: 4, width: 140, height: 100 },
  { id: "kitchen", label: "厨房", x: 4, y: 104, width: 130, height: 162 },
  { id: "living-room", label: "公共客厅", x: 134, y: 104, width: 170, height: 162 },
  { id: "bathroom", label: "浴室", x: 304, y: 104, width: 80, height: 162 },
  { id: "entry-balcony", label: "玄关/阳台", x: 384, y: 104, width: 92, height: 162 },
];

const objects: ObjectLayout[] = [
  { id: "player-bed", roomId: "player-bedroom", x: 16, y: 58, width: 70, height: 28 },
  { id: "player-door", roomId: "player-bedroom", x: 122, y: 66, width: 14, height: 34 },
  { id: "jev-bed", roomId: "jev-bedroom", x: 390, y: 58, width: 70, height: 28 },
  { id: "jev-door", roomId: "jev-bedroom", x: 344, y: 66, width: 14, height: 34 },
  { id: "fridge", roomId: "kitchen", x: 12, y: 126, width: 28, height: 52 },
  { id: "stove", roomId: "kitchen", x: 46, y: 148, width: 34, height: 30 },
  { id: "dining-table", roomId: "kitchen", x: 84, y: 196, width: 42, height: 28 },
  { id: "sofa", roomId: "living-room", x: 150, y: 204, width: 72, height: 30 },
  { id: "television", roomId: "living-room", x: 246, y: 150, width: 42, height: 32 },
  { id: "work-desk", roomId: "jev-bedroom", x: 364, y: 26, width: 48, height: 22 },
  { id: "shower", roomId: "bathroom", x: 316, y: 124, width: 34, height: 62 },
  { id: "trash-bin", roomId: "kitchen", x: 14, y: 226, width: 22, height: 28 },
  { id: "storage-cabinet", roomId: "entry-balcony", x: 392, y: 174, width: 34, height: 70 },
  { id: "plant", roomId: "living-room", x: 270, y: 220, width: 24, height: 34 },
  { id: "message-board", roomId: "entry-balcony", x: 432, y: 128, width: 34, height: 28 },
  { id: "fuse-box", roomId: "entry-balcony", x: 438, y: 184, width: 26, height: 34 },
];

const nodes: NavigationNode[] = [
  { id: "node-player-bedroom", roomId: "player-bedroom", x: 105, y: 82, neighbors: ["node-landing"] },
  { id: "node-landing", roomId: "landing", x: 240, y: 82, neighbors: ["node-player-bedroom", "node-jev-bedroom", "node-living-room"] },
  { id: "node-jev-bedroom", roomId: "jev-bedroom", x: 370, y: 82, neighbors: ["node-landing"] },
  { id: "node-kitchen", roomId: "kitchen", x: 110, y: 242, neighbors: ["node-living-room"] },
  { id: "node-living-room", roomId: "living-room", x: 236, y: 242, neighbors: ["node-kitchen", "node-bathroom", "node-entry-balcony", "node-landing"] },
  { id: "node-bathroom", roomId: "bathroom", x: 368, y: 242, neighbors: ["node-living-room"] },
  { id: "node-entry-balcony", roomId: "entry-balcony", x: 402, y: 252, neighbors: ["node-living-room"] },
];

export const APARTMENT_LAYOUT = {
  rooms,
  objects,
  nodes,
  spawns: {
    player: { nodeId: "node-player-bedroom" },
    jev: { nodeId: "node-jev-bedroom" },
  } satisfies Record<CharacterId, { nodeId: string }>,
} as const;
