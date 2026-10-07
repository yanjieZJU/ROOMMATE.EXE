import { z } from "zod";

import {
  JEV_MODEL,
  ROOMMATE_DAY_COUNT,
  ROOMMATE_DAY_DURATION_MS,
  ROOMMATE_SCHEMA_VERSION,
} from "./constants";
import { UsageSchema } from "./schemas";

export const CharacterIdSchema = z.enum(["player", "jev"]);
export const RoommateRoomIdSchema = z.string().min(1);

export const ActionTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("self"), id: z.null() }),
  z.object({ type: z.literal("object"), id: z.string().min(1) }),
  z.object({ type: z.literal("character"), id: CharacterIdSchema }),
]);

export const NeedStateSchema = z.object({
  hunger: z.number().min(0).max(100),
  energy: z.number().min(0).max(100),
  mood: z.number().min(0).max(100),
  focus: z.number().min(0).max(100),
});

export const RoomSchema = z.object({
  id: RoommateRoomIdSchema,
  label: z.string().min(1),
  floor: z.union([z.literal(1), z.literal(2)]),
  neighbors: z.array(RoommateRoomIdSchema),
});

const ObjectStateValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const ApartmentObjectSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.string().min(1),
  roomId: RoommateRoomIdSchema,
  state: z.record(z.string(), ObjectStateValueSchema),
  reservedBy: CharacterIdSchema.nullable(),
});

export const RoommateCharacterSchema = z.object({
  id: CharacterIdSchema,
  displayName: z.string().min(1),
  roomId: RoommateRoomIdSchema,
  facing: z.enum(["left", "right"]),
  needs: NeedStateSchema,
  inventory: z.array(z.string()),
  backgroundFacts: z.array(z.string()),
});

export const MemoryFactSchema = z.object({
  id: z.string().min(1),
  occurredAt: z.string().min(1),
  text: z.string().min(1),
  actorIds: z.array(CharacterIdSchema),
  roomId: RoommateRoomIdSchema.nullable(),
  objectIds: z.array(z.string()),
  status: z.enum(["ordinary", "unresolved", "resolved"]),
  sourceActionId: z.string().nullable(),
});

export const CommitmentSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  text: z.string().min(1),
  participantIds: z.array(CharacterIdSchema).min(1),
  status: z.enum(["open", "fulfilled", "broken"]),
  dueDay: z.number().int().min(1).max(ROOMMATE_DAY_COUNT).nullable(),
});

export const MacroActionSchema = z.object({
  id: z.string().min(1),
  definitionId: z.string().min(1),
  actorId: CharacterIdSchema,
  label: z.string().min(1),
  knownCostText: z.string().min(1),
  durationMs: z.number().int().min(4_000).max(12_000),
  animationKey: z.string().min(1),
  target: ActionTargetSchema,
  targetId: z.string().nullable(),
  targetRoomId: RoommateRoomIdSchema.nullable().optional(),
  effects: z.array(z.object({
    path: z.string().min(1),
    operation: z.enum(["set", "increment", "append", "remove"]),
    value: z.unknown(),
  })).default([]),
  factTemplates: z.array(z.string().min(1)).default([]),
});

export const QueuedActionSchema = z.object({
  queueId: z.string().min(1),
  action: MacroActionSchema,
});

export const ActiveActionSchema = QueuedActionSchema.extend({
  startedAt: z.string().min(1),
});

export const DecisionSnapshotSchema = z.object({
  kind: z.enum(["action", "lease"]).optional(),
  sessionId: z.string().min(1).optional(),
  decisionIndex: z.number().int().nonnegative().optional(),
  decisionPointId: z.string().min(1),
  requestedAt: z.string().min(1),
  day: z.number().int().min(1).max(ROOMMATE_DAY_COUNT),
  elapsedMs: z.number().int().min(0).max(ROOMMATE_DAY_DURATION_MS),
  publicEvent: z.string().nullable(),
  observableState: z.array(z.string().min(1)),
  relevantFacts: z.array(MemoryFactSchema).max(12),
  commitments: z.array(CommitmentSchema),
  candidates: z.array(MacroActionSchema).min(2).max(8),
  stateHash: z.string().regex(/^[a-f0-9]{64}$/),
}).superRefine((snapshot, context) => {
  const required = snapshot.kind === "lease" ? 2 : 3;
  if (snapshot.candidates.length < required || (snapshot.kind === "lease" && snapshot.candidates.length !== 2)) {
    context.addIssue({ code: "custom", path: ["candidates"], message: snapshot.kind === "lease" ? "续租判断必须恰好包含两个选项" : "动作判断必须包含 3–8 个选项" });
  }
});

export const RoommateDecisionSchema = z.object({
  id: z.string().min(1),
  decidedAt: z.string().min(1),
  stateHash: z.string().regex(/^[a-f0-9]{64}$/),
  selectedActionId: z.string().min(1),
  probabilities: z.record(z.string(), z.number().min(0).max(1)).default({}),
  confidence: z.number().min(0).max(1).nullable().default(null),
  model: z.literal(JEV_MODEL),
  usage: UsageSchema,
  snapshot: DecisionSnapshotSchema,
}).superRefine((decision, context) => {
  const probabilityKeys = Object.keys(decision.probabilities);
  if (probabilityKeys.length > 0 && !Object.hasOwn(decision.probabilities, decision.selectedActionId)) {
    context.addIssue({ code: "custom", path: ["probabilities"], message: "选中动作必须存在于概率表中" });
  }
  const candidateIds = new Set(decision.snapshot.candidates.map((candidate) => candidate.id));
  if (!candidateIds.has(decision.selectedActionId)) {
    context.addIssue({ code: "custom", path: ["selectedActionId"], message: "选中动作必须来自候选集合" });
  }
  if (probabilityKeys.some((id) => !candidateIds.has(id))) {
    context.addIssue({ code: "custom", path: ["probabilities"], message: "概率表只能包含候选集合" });
  }
  const total = Object.values(decision.probabilities).reduce((sum, probability) => sum + probability, 0);
  if (probabilityKeys.length > 0 && Math.abs(total - 1) > 1e-6) {
    context.addIssue({ code: "custom", path: ["probabilities"], message: "概率总和必须为 1" });
  }
});

export const RoommateWorldSchema = z.object({
  revision: z.number().int().nonnegative(),
  day: z.number().int().min(1).max(ROOMMATE_DAY_COUNT),
  elapsedMs: z.number().int().min(0).max(ROOMMATE_DAY_DURATION_MS),
  paused: z.boolean(),
  publicEvent: z.string().nullable(),
  rooms: z.array(RoomSchema).length(7),
  objects: z.array(ApartmentObjectSchema),
  characters: z.array(RoommateCharacterSchema).length(2),
  facts: z.array(MemoryFactSchema),
  commitments: z.array(CommitmentSchema),
  activeActions: z.array(ActiveActionSchema),
  appliedEventIds: z.array(z.string()),
  relationship: z.object({
    trust: z.number().min(0).max(100),
    pressure: z.number().min(0).max(100),
  }),
  environment: z.object({
    cleanliness: z.number().min(0).max(100),
    noise: z.number().min(0).max(100),
  }),
  jevControl: z.object({
    status: z.enum(["active", "paused"]),
    consecutiveFailures: z.number().int().min(0),
  }),
}).superRefine((world, context) => {
  const roomIds = world.rooms.map((room) => room.id);
  const objectIds = world.objects.map((object) => object.id);
  const characterIds = world.characters.map((character) => character.id);
  for (const [path, ids] of [["rooms", roomIds], ["objects", objectIds], ["characters", characterIds]] as const) {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: "custom", path: [path], message: `${path} id 必须唯一` });
    }
  }
  const knownRooms = new Set(roomIds);
  if (world.objects.some((object) => !knownRooms.has(object.roomId)) || world.characters.some((character) => !knownRooms.has(character.roomId))) {
    context.addIssue({ code: "custom", path: ["rooms"], message: "角色和物品必须位于已知房间" });
  }
});

export const RoommateSessionSchema = z.object({
  schemaVersion: z.literal(ROOMMATE_SCHEMA_VERSION),
  id: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  status: z.enum(["playing", "paused", "lease", "complete"]),
  world: RoommateWorldSchema,
  decisions: z.array(RoommateDecisionSchema),
  lease: z.object({
    playerChoice: z.enum(["renew", "leave"]).nullable(),
    jevChoice: z.enum(["renew", "leave"]).nullable(),
    revealed: z.boolean(),
  }),
});

export type CharacterId = z.infer<typeof CharacterIdSchema>;
export type ActionTarget = z.infer<typeof ActionTargetSchema>;
export type NeedState = z.infer<typeof NeedStateSchema>;
export type Room = z.infer<typeof RoomSchema>;
export type ApartmentObject = z.infer<typeof ApartmentObjectSchema>;
export type RoommateCharacter = z.infer<typeof RoommateCharacterSchema>;
export type MemoryFact = z.infer<typeof MemoryFactSchema>;
export type Commitment = z.infer<typeof CommitmentSchema>;
export type MacroAction = z.infer<typeof MacroActionSchema>;
export type QueuedAction = z.infer<typeof QueuedActionSchema>;
export type ActiveAction = z.infer<typeof ActiveActionSchema>;
export type DecisionSnapshot = z.infer<typeof DecisionSnapshotSchema>;
export type RoommateDecision = z.infer<typeof RoommateDecisionSchema>;
export type RoommateWorld = z.infer<typeof RoommateWorldSchema>;
export type RoommateSession = z.infer<typeof RoommateSessionSchema>;
