import type { PixelDefinition } from "./pixel-texture";

export const ANIMATION_KEYS = [
  "idle", "look", "sit", "sleep", "cook", "eat", "carry", "clean", "repair",
  "watch", "work", "shower", "read", "knock", "talk", "help",
] as const;

const body = [
  "..oo....",
  ".occco..",
  ".ococo..",
  "..ooo...",
  ".rrrrr..",
  ".r.r.r..",
  "..o.o...",
  ".oo.oo..",
];

export const TEXTURE_ATLAS: readonly PixelDefinition[] = [
  { key: "player", width: 8, height: 8, scale: 2, pixels: body },
  { key: "jev", width: 8, height: 8, scale: 2, pixels: body.map((row) => row.replaceAll("r", "t")) },
  ...ANIMATION_KEYS.map((key) => ({ key: `action-${key}`, width: 8, height: 8, scale: 2, pixels: body })),
];
