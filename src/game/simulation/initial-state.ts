import {
  ROOMMATE_OBJECT_IDS,
  ROOMMATE_ROOM_IDS,
  ROOMMATE_SCHEMA_VERSION,
} from "../../shared/constants";
import { RoommateSessionSchema, type RoommateSession } from "../../shared/roommate-schemas";

const ROOM_LABELS: Record<(typeof ROOMMATE_ROOM_IDS)[number], string> = {
  "player-bedroom": "你的卧室",
  landing: "楼梯平台",
  "jev-bedroom": "Jev 的卧室",
  kitchen: "厨房",
  "living-room": "公共客厅",
  bathroom: "浴室",
  "entry-balcony": "玄关与小阳台",
};

const ROOM_NEIGHBORS: Record<(typeof ROOMMATE_ROOM_IDS)[number], string[]> = {
  "player-bedroom": ["landing"],
  landing: ["player-bedroom", "jev-bedroom", "living-room"],
  "jev-bedroom": ["landing"],
  kitchen: ["living-room"],
  "living-room": ["kitchen", "bathroom", "entry-balcony", "landing"],
  bathroom: ["living-room"],
  "entry-balcony": ["living-room"],
};

const OBJECT_DEFINITIONS: Array<{
  id: (typeof ROOMMATE_OBJECT_IDS)[number];
  label: string;
  kind: string;
  roomId: (typeof ROOMMATE_ROOM_IDS)[number];
  state?: Record<string, string | number | boolean | null>;
}> = [
  { id: "player-bed", label: "你的床", kind: "bed", roomId: "player-bedroom" },
  { id: "jev-bed", label: "Jev 的床", kind: "bed", roomId: "jev-bedroom" },
  { id: "player-door", label: "你的房门", kind: "door", roomId: "player-bedroom", state: { open: true } },
  { id: "jev-door", label: "Jev 的房门", kind: "door", roomId: "jev-bedroom", state: { open: false } },
  { id: "fridge", label: "冰箱", kind: "appliance", roomId: "kitchen", state: { working: true, portions: 2 } },
  { id: "stove", label: "灶台", kind: "appliance", roomId: "kitchen", state: { working: true } },
  { id: "dining-table", label: "餐桌", kind: "surface", roomId: "kitchen", state: { clutter: 0 } },
  { id: "sofa", label: "沙发", kind: "seat", roomId: "living-room" },
  { id: "television", label: "电视", kind: "appliance", roomId: "living-room", state: { on: false, volume: 0 } },
  { id: "work-desk", label: "工作桌", kind: "desk", roomId: "jev-bedroom", state: { occupied: false } },
  { id: "shower", label: "淋浴", kind: "fixture", roomId: "bathroom", state: { working: true } },
  { id: "trash-bin", label: "垃圾桶", kind: "container", roomId: "kitchen", state: { fullness: 20 } },
  { id: "storage-cabinet", label: "储物柜", kind: "storage", roomId: "entry-balcony", state: { freeSlots: 1 } },
  { id: "plant", label: "绿植", kind: "plant", roomId: "living-room", state: { watered: false } },
  { id: "message-board", label: "公共留言板", kind: "board", roomId: "entry-balcony", state: { notes: 0 } },
  { id: "fuse-box", label: "电箱", kind: "utility", roomId: "entry-balcony", state: { working: true } },
];

export function createInitialRoommateSession(now: string): RoommateSession {
  const timestamp = new Date(now);
  if (Number.isNaN(timestamp.valueOf())) {
    throw new TypeError("now must be an ISO-compatible timestamp");
  }

  return RoommateSessionSchema.parse({
    schemaVersion: ROOMMATE_SCHEMA_VERSION,
    id: `roommate-${timestamp.valueOf()}`,
    createdAt: now,
    updatedAt: now,
    status: "playing",
    world: {
      revision: 0,
      day: 1,
      elapsedMs: 0,
      paused: false,
      publicEvent: "搬入日",
      rooms: ROOMMATE_ROOM_IDS.map((id) => ({
        id,
        label: ROOM_LABELS[id],
        floor: id === "player-bedroom" || id === "landing" || id === "jev-bedroom" ? 2 : 1,
        neighbors: ROOM_NEIGHBORS[id],
      })),
      objects: OBJECT_DEFINITIONS.map((object) => ({ ...object, state: object.state ?? {}, reservedBy: null })),
      characters: [
        {
          id: "player",
          displayName: "你",
          roomId: "player-bedroom",
          facing: "right",
          needs: { hunger: 20, energy: 80, mood: 75, focus: 60 },
          inventory: [],
          backgroundFacts: ["今天刚搬进这间公寓"],
        },
        {
          id: "jev",
          displayName: "Jev",
          roomId: "jev-bedroom",
          facing: "left",
          needs: { hunger: 25, energy: 55, mood: 65, focus: 55 },
          inventory: [],
          backgroundFacts: ["刚搬到这座城市", "在家远程工作", "收入足以覆盖普通生活", "睡眠时间并不固定", "带来了几个还没拆开的箱子"],
        },
      ],
      facts: [],
      commitments: [],
      activeActions: [],
      appliedEventIds: [],
      relationship: { trust: 50, pressure: 20 },
      environment: { cleanliness: 70, noise: 10 },
      jevControl: { status: "active", consecutiveFailures: 0 },
    },
    decisions: [],
    lease: { playerChoice: null, jevChoice: null, revealed: false },
  });
}
