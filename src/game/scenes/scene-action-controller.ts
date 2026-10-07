import type { GameBridge } from "../../client/game/game-bridge";
import type { CharacterId, MacroAction } from "../../shared/roommate-schemas";
import type { NavigationWaypoint } from "../navigation/interaction-points";

export interface SceneActionDriver {
  navigate(actorId: CharacterId, waypoints: NavigationWaypoint[], queueId: string): Promise<void>;
  perform(actorId: CharacterId, action: MacroAction, queueId: string): Promise<void>;
  cancel(queueId: string): void;
}

export function registerSceneActionHandlers(bridge: GameBridge, driver: SceneActionDriver): () => void {
  let active = true;
  const offNavigate = bridge.on("navigateAction", ({ actorId, queueId, waypoints }) => {
    void driver.navigate(actorId, waypoints, queueId).then(
      () => { if (active) bridge.emit("navigationCompleted", { actorId, queueId }); },
      (error) => { if (active) bridge.emit("navigationFailed", { actorId, queueId, reason: error instanceof Error ? error.message : "无法到达目标" }); },
    );
  });
  const offPerform = bridge.on("performAction", ({ actorId, queueId, action }) => {
    void driver.perform(actorId, action, queueId).then(
      () => { if (active) bridge.emit("performanceCompleted", { actorId, queueId }); },
      (error) => { if (active) bridge.emit("performanceFailed", { actorId, queueId, reason: error instanceof Error ? error.message : "动作无法完成" }); },
    );
  });
  const offCancel = bridge.on("cancelVisualAction", ({ queueId }) => driver.cancel(queueId));
  return () => {
    active = false;
    offNavigate();
    offPerform();
    offCancel();
  };
}
