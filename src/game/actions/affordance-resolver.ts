import type { ActionTarget, CharacterId, MacroAction, RoommateWorld } from "../../shared/roommate-schemas";
import { findNavigationPath } from "../navigation/pathfinder";
import { ACTION_CATALOG, type ActionDefinition } from "./catalog";
import { selectDiverseCandidates } from "./candidate-ranking";

function candidateTargets(world: RoommateWorld, definition: ActionDefinition, actorId: CharacterId): ActionTarget[] {
  if (definition.characterTarget) {
    return world.characters.filter((character) => character.id !== actorId).map((character) => ({ type: "character", id: character.id }));
  }
  if (definition.targetIds.length === 0 && definition.targetKinds.length === 0) return [{ type: "self", id: null }];
  return world.objects
    .filter((object) => definition.targetIds.includes(object.id) || definition.targetKinds.includes(object.kind))
    .map((object) => ({ type: "object", id: object.id }));
}

export function resolveAllAffordances(world: RoommateWorld, actorId: CharacterId): MacroAction[] {
  const actor = world.characters.find((character) => character.id === actorId);
  if (!actor) return [];
  const resolved: MacroAction[] = [];
  for (const definition of ACTION_CATALOG.values()) {
    for (const target of candidateTargets(world, definition, actorId)) {
      if (!definition.isAvailable(world, actorId, target)) continue;
      if (findNavigationPath(actor.roomId, target, world) === null) continue;
      resolved.push(definition.toMacroAction(world, actorId, target));
    }
  }
  return resolved;
}

export function resolveAffordances(world: RoommateWorld, actorId: CharacterId): MacroAction[] {
  return selectDiverseCandidates(world, resolveAllAffordances(world, actorId));
}
