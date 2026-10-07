import { ROOMMATE_DAY_COUNT } from "../../shared/constants";
import {
  RoommateWorldSchema,
  type ActiveAction,
  type CharacterId,
  type MacroAction,
  type MemoryFact,
  type RoommateWorld,
} from "../../shared/roommate-schemas";

type ActionEffect = MacroAction["effects"][number];

export type WorldCommand =
  | { type: "move"; actorId: CharacterId; toRoomId: string }
  | { type: "start-action"; entry: ActiveAction }
  | { type: "complete-action"; queueId: string; completedAt: string }
  | { type: "cancel-action"; queueId: string }
  | { type: "apply-event"; eventId: string; label: string; facts?: MemoryFact[] }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "day-transition"; nextDay: number };

export class WorldRuleError extends Error {
  readonly code = "INVALID_INPUT" as const;

  constructor(message: string) {
    super(message);
    this.name = "WorldRuleError";
  }
}

function invalid(message: string): never {
  throw new WorldRuleError(message);
}

function findCharacter(world: RoommateWorld, actorId: CharacterId) {
  return world.characters.find((character) => character.id === actorId) ?? invalid(`Unknown actor: ${actorId}`);
}

function findObject(world: RoommateWorld, objectId: string) {
  return world.objects.find((object) => object.id === objectId) ?? invalid(`Unknown object: ${objectId}`);
}

function assertEffectSupported(world: RoommateWorld, effect: ActionEffect): void {
  const parts = effect.path.split(".");
  if (parts[0] === "characters" && parts[1]) {
    const character = findCharacter(world, parts[1] as CharacterId);
    if (parts[2] === "roomId" && effect.operation === "set" && typeof effect.value === "string") {
      if (!world.rooms.some((room) => room.id === effect.value)) invalid(`Unknown room: ${effect.value}`);
      return;
    }
    if (parts[2] === "needs" && parts[3] && effect.operation === "increment" && typeof effect.value === "number") {
      if (!(parts[3] in character.needs)) invalid(`Unknown need: ${parts[3]}`);
      return;
    }
    if (parts[2] === "inventory" && (effect.operation === "append" || effect.operation === "remove") && typeof effect.value === "string") {
      return;
    }
  }
  if (parts[0] === "objects" && parts[1] && parts[2] === "state" && parts[3]) {
    findObject(world, parts[1]);
    if (effect.operation === "set") return;
    if (effect.operation === "increment" && typeof effect.value === "number") return;
  }
  if ((parts[0] === "relationship" || parts[0] === "environment") && parts[1] && effect.operation === "increment" && typeof effect.value === "number") {
    if (!(parts[1] in world[parts[0]])) invalid(`Unknown world state: ${effect.path}`);
    return;
  }
  invalid(`Unsupported action effect: ${effect.path} ${effect.operation}`);
}

function applyEffect(world: RoommateWorld, effect: ActionEffect): void {
  const parts = effect.path.split(".");
  if (parts[0] === "characters") {
    const character = findCharacter(world, parts[1] as CharacterId);
    if (parts[2] === "roomId") {
      character.roomId = effect.value as string;
      return;
    }
    if (parts[2] === "needs") {
      const need = parts[3] as keyof typeof character.needs;
      character.needs[need] = Math.max(0, Math.min(100, character.needs[need] + (effect.value as number)));
      return;
    }
    if (parts[2] === "inventory") {
      const item = effect.value as string;
      if (effect.operation === "append") character.inventory.push(item);
      if (effect.operation === "remove") character.inventory = character.inventory.filter((entry) => entry !== item);
      return;
    }
  }
  if (parts[0] === "relationship" || parts[0] === "environment") {
    const state = world[parts[0]] as Record<string, number>;
    const key = parts[1]!;
    state[key] = Math.max(0, Math.min(100, state[key]! + (effect.value as number)));
    return;
  }
  const object = findObject(world, parts[1]!);
  const key = parts[3]!;
  if (effect.operation === "set") {
    object.state[key] = effect.value as string | number | boolean | null;
    return;
  }
  const current = object.state[key];
  if (typeof current !== "number") invalid(`Cannot increment non-number state: ${effect.path}`);
  object.state[key] = current + (effect.value as number);
}

function validateActionStart(world: RoommateWorld, entry: ActiveAction): void {
  const action = entry.action;
  findCharacter(world, action.actorId);
  if (world.activeActions.some((active) => active.action.actorId === action.actorId)) {
    invalid(`${action.actorId} already has an active action`);
  }
  if (world.activeActions.some((active) => active.queueId === entry.queueId)) invalid(`Duplicate action queue id: ${entry.queueId}`);
  if (action.target.type === "object") {
    const target = findObject(world, action.target.id);
    if (target.reservedBy !== null) invalid(`${action.targetId} is already reserved`);
  }
}

function activeEntry(world: RoommateWorld, queueId: string): ActiveAction {
  return world.activeActions.find((candidate) => candidate.queueId === queueId) ?? invalid(`Action is not active: ${queueId}`);
}

function validateActionCompletion(world: RoommateWorld, queueId: string): ActiveAction {
  const active = activeEntry(world, queueId);
  const action = active.action;
  if (action.target.type === "object" && findObject(world, action.target.id).reservedBy !== action.actorId) {
    invalid(`Action target is not reserved by ${action.actorId}`);
  }
  for (const effect of action.effects) assertEffectSupported(world, effect);
  return active;
}

function appendActionFacts(world: RoommateWorld, action: MacroAction, completedAt: string): void {
  const actor = findCharacter(world, action.actorId);
  action.factTemplates.forEach((text, index) => {
    world.facts.push({
      id: `${action.id}:${completedAt}:${index}`,
      occurredAt: completedAt,
      text,
      actorIds: [action.actorId],
      roomId: actor.roomId,
      objectIds: action.targetId ? [action.targetId] : [],
      status: "ordinary",
      sourceActionId: action.id,
    });
  });
}

export function applyWorldCommand(world: RoommateWorld, command: WorldCommand): RoommateWorld {
  if (command.type === "move") {
    const actor = findCharacter(world, command.actorId);
    const room = world.rooms.find((candidate) => candidate.id === actor.roomId) ?? invalid(`Unknown room: ${actor.roomId}`);
    if (!room.neighbors.includes(command.toRoomId)) invalid(`${command.toRoomId} is not adjacent to ${actor.roomId}`);
  } else if (command.type === "start-action") {
    validateActionStart(world, command.entry);
  } else if (command.type === "complete-action") {
    validateActionCompletion(world, command.queueId);
  } else if (command.type === "cancel-action") {
    activeEntry(world, command.queueId);
  } else if (command.type === "day-transition") {
    if (command.nextDay !== world.day + 1 || command.nextDay > ROOMMATE_DAY_COUNT) invalid("Days must advance exactly once");
  }

  if (command.type === "apply-event" && world.appliedEventIds.includes(command.eventId)) return world;

  const next = structuredClone(world);
  switch (command.type) {
    case "move":
      findCharacter(next, command.actorId).roomId = command.toRoomId;
      break;
    case "start-action":
      next.activeActions.push(structuredClone(command.entry));
      if (command.entry.action.target.type === "object") findObject(next, command.entry.action.target.id).reservedBy = command.entry.action.actorId;
      break;
    case "complete-action": {
      const active = activeEntry(next, command.queueId);
      for (const effect of active.action.effects) applyEffect(next, effect);
      next.activeActions = next.activeActions.filter((candidate) => candidate.queueId !== command.queueId);
      if (active.action.target.type === "object") findObject(next, active.action.target.id).reservedBy = null;
      appendActionFacts(next, active.action, command.completedAt);
      break;
    }
    case "cancel-action": {
      const active = activeEntry(next, command.queueId);
      next.activeActions = next.activeActions.filter((candidate) => candidate.queueId !== command.queueId);
      if (active.action.target.type === "object") findObject(next, active.action.target.id).reservedBy = null;
      break;
    }
    case "apply-event":
      next.appliedEventIds.push(command.eventId);
      next.publicEvent = command.label;
      next.facts.push(...structuredClone(command.facts ?? []));
      break;
    case "pause":
      next.paused = true;
      break;
    case "resume":
      next.paused = false;
      break;
    case "day-transition":
      next.day = command.nextDay;
      next.elapsedMs = 0;
      next.publicEvent = null;
      break;
  }
  next.revision += 1;
  return RoommateWorldSchema.parse(next);
}

export function completeMacroAction(world: RoommateWorld, action: MacroAction, completedAt: string): RoommateWorld {
  const active = world.activeActions.find((entry) => entry.action.actorId === action.actorId && entry.action.id === action.id);
  if (!active) throw new WorldRuleError(`Action is not active: ${action.id}`);
  return applyWorldCommand(world, { type: "complete-action", queueId: active.queueId, completedAt });
}
