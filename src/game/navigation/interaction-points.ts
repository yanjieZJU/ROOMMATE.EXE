import type { ActionTarget, RoommateWorld } from "../../shared/roommate-schemas";
import { APARTMENT_LAYOUT } from "../render/apartment-layout";

export interface NavigationWaypoint {
  nodeId: string;
  roomId: string;
  x: number;
  y: number;
}

export function interactionPointFor(target: ActionTarget, world?: RoommateWorld): NavigationWaypoint | null {
  if (target.type === "self") return null;
  if (target.type === "character") {
    const character = world?.characters.find((candidate) => candidate.id === target.id);
    const roomNode = character && APARTMENT_LAYOUT.nodes.find((node) => node.roomId === character.roomId);
    return character && roomNode
      ? { nodeId: `character-${character.id}`, roomId: character.roomId, x: roomNode.x, y: roomNode.y }
      : null;
  }

  const object = APARTMENT_LAYOUT.objects.find((candidate) => candidate.id === target.id);
  const room = object && APARTMENT_LAYOUT.rooms.find((candidate) => candidate.id === object.roomId);
  if (!object || !room) return null;
  return {
    nodeId: `object-${object.id}`,
    roomId: object.roomId,
    x: Math.max(room.x + 10, Math.min(room.x + room.width - 10, object.x + object.width / 2)),
    y: Math.max(room.y + 18, Math.min(room.y + room.height - 10, object.y + object.height + 6)),
  };
}
