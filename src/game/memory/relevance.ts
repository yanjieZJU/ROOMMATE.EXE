import type { CharacterId, MemoryFact, RoommateWorld } from "../../shared/roommate-schemas";

export interface MemoryContext {
  actorIds: readonly CharacterId[];
  roomId: string | null;
  objectIds: readonly string[];
}

function score(fact: MemoryFact, context: MemoryContext): number {
  let value = 0;
  if (fact.status === "unresolved") value += 1_000;
  if (fact.actorIds.some((actorId) => context.actorIds.includes(actorId))) value += 100;
  if (fact.roomId !== null && fact.roomId === context.roomId) value += 50;
  if (fact.objectIds.some((objectId) => context.objectIds.includes(objectId))) value += 25;
  return value;
}

function compareFacts(left: MemoryFact, right: MemoryFact, context: MemoryContext): number {
  const scoreDelta = score(right, context) - score(left, context);
  if (scoreDelta !== 0) return scoreDelta;
  const timeDelta = Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
  if (timeDelta !== 0) return timeDelta;
  return left.id.localeCompare(right.id);
}

export function selectRelevantFacts(world: RoommateWorld, context: MemoryContext, limit = 12): MemoryFact[] {
  if (!Number.isInteger(limit) || limit < 0) throw new RangeError("memory limit must be a non-negative integer");
  const sorted = [...world.facts].sort((left, right) => compareFacts(left, right, context));
  return sorted.slice(0, limit);
}
