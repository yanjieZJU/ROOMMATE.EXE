export const JEV_API_URL = "https://opencode.ai/zen/v1/systemone" as const;
export const JEV_MODEL = "jev-1.13-free" as const;

export const ROOMMATE_SCHEMA_VERSION = "roommate-exe/2" as const;
export const ROOMMATE_DAY_COUNT = 7 as const;
export const ROOMMATE_DAY_DURATION_MS = 90_000 as const;

export const ROOMMATE_ROOM_IDS = [
  "player-bedroom",
  "landing",
  "jev-bedroom",
  "kitchen",
  "living-room",
  "bathroom",
  "entry-balcony",
] as const;

export const ROOMMATE_OBJECT_IDS = [
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
