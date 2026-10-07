import type { ActionTarget, MacroAction, RoommateWorld } from "../../shared/roommate-schemas";
import { ACTION_CATALOG } from "./catalog";

export function resolvePlayerTargetActions(world: RoommateWorld, target: ActionTarget): MacroAction[] {
  return [...ACTION_CATALOG.values()]
    .filter((definition) => !definition.autonomousOnly)
    .filter((definition) => definition.isAvailable(world, "player", target))
    .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id))
    .map((definition) => definition.toMacroAction(world, "player", target));
}

export function resolvePlayerObjectActions(world: RoommateWorld, objectId: string): MacroAction[] {
  return resolvePlayerTargetActions(world, { type: "object", id: objectId });
}
