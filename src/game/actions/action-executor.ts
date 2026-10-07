import type {
  CharacterId,
  MacroAction,
  QueuedAction,
  RoommateWorld,
} from "../../shared/roommate-schemas";
import type { NavigationWaypoint } from "../navigation/interaction-points";
import { findNavigationPath } from "../navigation/pathfinder";
import { WorldRuleError, type WorldCommand } from "../simulation/world-reducer";

export interface ActionExecutionPort {
  navigate(actorId: CharacterId, queueId: string, waypoints: NavigationWaypoint[], signal: AbortSignal): Promise<void>;
  perform(actorId: CharacterId, queueId: string, action: MacroAction, signal: AbortSignal): Promise<void>;
}

export interface ActionExecutorDependencies {
  getWorld(): RoommateWorld;
  dispatch(command: WorldCommand): void | Promise<void>;
  port: ActionExecutionPort;
  isValid(world: RoommateWorld, action: MacroAction): boolean;
  now(): string;
}

function aborted(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export class ActionExecutor {
  private readonly controllers = new Map<string, AbortController>();

  constructor(private readonly dependencies: ActionExecutorDependencies) {}

  cancel(queueId: string): void {
    this.controllers.get(queueId)?.abort();
  }

  async execute(entry: QueuedAction): Promise<"completed" | "invalidated" | "cancelled"> {
    const controller = new AbortController();
    this.controllers.set(entry.queueId, controller);
    let started = false;
    try {
      const initial = this.dependencies.getWorld();
      const actor = initial.characters.find((candidate) => candidate.id === entry.action.actorId);
      if (!actor) return "invalidated";
      const path = findNavigationPath(actor.roomId, entry.action.target, initial);
      if (!path) return "invalidated";

      await this.dependencies.port.navigate(entry.action.actorId, entry.queueId, path, controller.signal);
      if (controller.signal.aborted) return "cancelled";

      let currentRoomId = actor.roomId;
      for (const waypoint of path) {
        if (waypoint.roomId === currentRoomId) continue;
        await this.dependencies.dispatch({ type: "move", actorId: entry.action.actorId, toRoomId: waypoint.roomId });
        currentRoomId = waypoint.roomId;
      }

      const arrived = this.dependencies.getWorld();
      if (!this.dependencies.isValid(arrived, entry.action)) return "invalidated";
      try {
        await this.dependencies.dispatch({
          type: "start-action",
          entry: { ...structuredClone(entry), startedAt: this.dependencies.now() },
        });
        started = true;
      } catch (error) {
        if (error instanceof WorldRuleError) return "invalidated";
        throw error;
      }

      await this.dependencies.port.perform(entry.action.actorId, entry.queueId, entry.action, controller.signal);
      if (controller.signal.aborted) {
        await this.dependencies.dispatch({ type: "cancel-action", queueId: entry.queueId });
        return "cancelled";
      }
      await this.dependencies.dispatch({ type: "complete-action", queueId: entry.queueId, completedAt: this.dependencies.now() });
      return "completed";
    } catch (error) {
      if (aborted(error) || controller.signal.aborted) {
        if (started) await this.dependencies.dispatch({ type: "cancel-action", queueId: entry.queueId });
        return "cancelled";
      }
      throw error;
    } finally {
      this.controllers.delete(entry.queueId);
    }
  }
}
