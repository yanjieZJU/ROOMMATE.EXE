import type { CharacterId, MacroAction, RoommateWorld } from "../../shared/roommate-schemas";
import type { ActionExecutionPort } from "../../game/actions/action-executor";
import type { NavigationWaypoint } from "../../game/navigation/interaction-points";

export interface GameBridgeEvents {
  objectSelected: { objectId: string };
  targetSelected: { targetType: "object" | "character"; targetId: string; screenX: number; screenY: number };
  playerMoved: { x: number; y: number; roomId: string };
  animationCompleted: { actorId: "player" | "jev"; actionId: string };
  sceneReady: undefined;
  worldChanged: { world: RoommateWorld };
  playAction: { actorId: "player" | "jev"; actionId: string; durationMs: number };
  navigateAction: { actorId: CharacterId; queueId: string; waypoints: NavigationWaypoint[] };
  navigationCompleted: { actorId: CharacterId; queueId: string };
  navigationFailed: { actorId: CharacterId; queueId: string; reason: string };
  performAction: { actorId: CharacterId; queueId: string; action: MacroAction };
  performanceCompleted: { actorId: CharacterId; queueId: string };
  performanceFailed: { actorId: CharacterId; queueId: string; reason: string };
  cancelVisualAction: { queueId: string };
}

type Listener<T> = (payload: T) => void;

export class GameBridge {
  private readonly listeners = new Map<keyof GameBridgeEvents, Set<Listener<never>>>();

  on<K extends keyof GameBridgeEvents>(event: K, listener: Listener<GameBridgeEvents[K]>): () => void {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener as Listener<never>);
    this.listeners.set(event, listeners);
    return () => listeners.delete(listener as Listener<never>);
  }

  emit<K extends keyof GameBridgeEvents>(event: K, payload: GameBridgeEvents[K]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(payload as never);
  }
}

function bridgePromise(
  bridge: GameBridge,
  actorId: CharacterId,
  queueId: string,
  signal: AbortSignal,
  request: () => void,
  completedEvent: "navigationCompleted" | "performanceCompleted",
  failedEvent: "navigationFailed" | "performanceFailed",
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { offCompleted(); offFailed(); signal.removeEventListener("abort", onAbort); };
    const offCompleted = bridge.on(completedEvent, (payload) => {
      if (payload.actorId !== actorId || payload.queueId !== queueId) return;
      cleanup();
      resolve();
    });
    const offFailed = bridge.on(failedEvent, (payload) => {
      if (payload.actorId !== actorId || payload.queueId !== queueId) return;
      cleanup();
      reject(new Error(payload.reason));
    });
    const onAbort = () => {
      bridge.emit("cancelVisualAction", { queueId });
      cleanup();
      reject(new DOMException("cancelled", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
    else request();
  });
}

export function createBridgeExecutionPort(bridge: GameBridge): ActionExecutionPort {
  return {
    navigate: (actorId, queueId, waypoints, signal) => bridgePromise(
      bridge, actorId, queueId, signal,
      () => bridge.emit("navigateAction", { actorId, queueId, waypoints }),
      "navigationCompleted", "navigationFailed",
    ),
    perform: (actorId, queueId, action, signal) => bridgePromise(
      bridge, actorId, queueId, signal,
      () => bridge.emit("performAction", { actorId, queueId, action }),
      "performanceCompleted", "performanceFailed",
    ),
  };
}
