import { RoommateWorldSchema, type MemoryFact, type RoommateWorld } from "../../shared/roommate-schemas";

export function appendFacts(world: RoommateWorld, facts: readonly MemoryFact[]): RoommateWorld {
  const known = new Set(world.facts.map((fact) => fact.id));
  const additions = facts.filter((fact) => !known.has(fact.id));
  if (additions.length === 0) return world;
  return RoommateWorldSchema.parse({
    ...structuredClone(world),
    revision: world.revision + 1,
    facts: [...structuredClone(world.facts), ...structuredClone(additions)],
  });
}
