import type { MacroAction, RoommateWorld } from "../../shared/roommate-schemas";
import { findNavigationPath } from "../navigation/pathfinder";
import { ACTION_CATALOG, type ActionCategory } from "./catalog";

export interface RankedAction {
  action: MacroAction;
  category: ActionCategory;
  score: number;
}

function actionScore(world: RoommateWorld, action: MacroAction): number {
  const definition = ACTION_CATALOG.get(action.definitionId)!;
  const actor = world.characters.find((character) => character.id === action.actorId)!;
  let score = 100 - definition.priority;
  if (definition.category === "food") score += actor.needs.hunger * 1.2;
  if (definition.category === "movement-rest") score += (100 - actor.needs.energy) * 0.5;
  if (definition.category === "social") score += Math.max(0, 50 - world.relationship.trust) * 0.4;
  score -= (findNavigationPath(actor.roomId, action.target, world)?.length ?? 20) * 3;
  if (world.facts.slice(-3).some((fact) => fact.sourceActionId === action.id)) score -= 100;
  return score;
}

export function rankAffordances(world: RoommateWorld, actions: readonly MacroAction[]): RankedAction[] {
  return actions.map((action) => ({
    action,
    category: ACTION_CATALOG.get(action.definitionId)!.category,
    score: actionScore(world, action),
  })).sort((left, right) => right.score - left.score || left.action.id.localeCompare(right.action.id));
}

export function selectDiverseCandidates(world: RoommateWorld, actions: readonly MacroAction[], limit = 8): MacroAction[] {
  const ranked = rankAffordances(world, actions);
  const selected: RankedAction[] = [];
  const used = new Set<string>();
  for (const candidate of ranked) {
    if (selected.some((entry) => entry.category === candidate.category)) continue;
    selected.push(candidate);
    used.add(candidate.action.id);
    if (selected.length === limit) break;
  }
  const usedRooms = new Set(selected.map((candidate) => candidate.action.targetRoomId).filter((roomId): roomId is string => roomId !== null && roomId !== undefined));
  for (const candidate of ranked) {
    if (selected.length === limit) break;
    const roomId = candidate.action.targetRoomId;
    if (!roomId || usedRooms.has(roomId) || used.has(candidate.action.id)) continue;
    selected.push(candidate);
    used.add(candidate.action.id);
    usedRooms.add(roomId);
  }
  for (const candidate of ranked) {
    if (selected.length === limit) break;
    if (!used.has(candidate.action.id)) selected.push(candidate);
  }
  return selected.map((candidate) => candidate.action);
}
