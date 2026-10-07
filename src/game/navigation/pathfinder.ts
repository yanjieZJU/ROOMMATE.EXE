import type { ActionTarget, RoommateWorld } from "../../shared/roommate-schemas";
import { APARTMENT_LAYOUT, type NavigationNode } from "../render/apartment-layout";
import { interactionPointFor, type NavigationWaypoint } from "./interaction-points";

export function findRoomPath(
  nodes: readonly NavigationNode[],
  fromRoomId: string,
  toRoomId: string,
): NavigationWaypoint[] | null {
  const start = nodes.find((node) => node.roomId === fromRoomId);
  const goal = nodes.find((node) => node.roomId === toRoomId);
  if (!start || !goal) return null;
  if (start.id === goal.id) return [];

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const queue: Array<{ id: string; path: string[] }> = [{ id: start.id, path: [] }];
  const visited = new Set([start.id]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    const node = byId.get(current.id);
    if (!node) continue;
    for (const neighborId of node.neighbors) {
      if (visited.has(neighborId)) continue;
      const path = [...current.path, neighborId];
      if (neighborId === goal.id) {
        return path.map((id) => byId.get(id)).filter((entry): entry is NavigationNode => entry !== undefined)
          .map(({ id, roomId, x, y }) => ({ nodeId: id, roomId, x, y }));
      }
      visited.add(neighborId);
      queue.push({ id: neighborId, path });
    }
  }
  return null;
}

export function findNavigationPath(
  fromRoomId: string,
  target: ActionTarget,
  world?: RoommateWorld,
): NavigationWaypoint[] | null {
  if (target.type === "self") return [];
  const interactionPoint = interactionPointFor(target, world);
  if (!interactionPoint) return null;
  const roomPath = findRoomPath(APARTMENT_LAYOUT.nodes, fromRoomId, interactionPoint.roomId);
  return roomPath ? [...roomPath, interactionPoint] : null;
}
