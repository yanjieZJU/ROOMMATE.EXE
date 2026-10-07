import { useCallback, useEffect, useRef, useState } from "react";

import type { GameBridge } from "../game/game-bridge";
import type { ApiClient } from "../api/client";
import type { RoommateRepository, CompletedTransition } from "../state/roommate-repository";
import { resolveAffordances } from "../../game/actions/affordance-resolver";
import { resolvePlayerObjectActions } from "../../game/actions/player-actions";
import { applyScheduledEvent, eventsDue } from "../../game/events/scheduler";
import { JevAutonomyController } from "../../game/jev/autonomy-controller";
import { buildDecisionSnapshot } from "../../game/jev/decision-snapshot";
import { advanceSimulationClock } from "../../game/simulation/clock";
import { applyWorldCommand, completeMacroAction } from "../../game/simulation/world-reducer";
import { createInitialRoommateSession } from "../../game/simulation/initial-state";
import type { MacroAction, RoommateSession } from "../../shared/roommate-schemas";
import type { RoommateDecision } from "../../shared/roommate-schemas";

export type RoommateRepositoryPort = Pick<RoommateRepository, "loadLatest" | "commitTransition" | "savePaused">;
export type RoommateApiPort = Pick<ApiClient, "decideRoommate">;

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "error" in error) {
    return String((error as { error?: { message?: string } }).error?.message ?? "室友暂时失去回应");
  }
  if (error instanceof Error) return error.message;
  return "室友暂时失去回应";
}

export function useRoommateSession({
  api,
  repository,
  bridge,
  createSession = createInitialRoommateSession,
  autoJev = true,
  dayDurationMs = 90_000,
}: {
  api: RoommateApiPort;
  repository: RoommateRepositoryPort;
  bridge: GameBridge;
  createSession?: (now: string) => RoommateSession;
  autoJev?: boolean;
  dayDurationMs?: number;
}) {
  const [session, setSessionState] = useState<RoommateSession>();
  const [loading, setLoading] = useState(true);
  const [selectedObjectId, setSelectedObjectId] = useState<string>();
  const [error, setError] = useState<string>();
  const sessionRef = useRef<RoommateSession | undefined>(undefined);
  const pending = useRef(new Map<"player" | "jev", MacroAction>());
  const pendingDecisions = useRef(new Map<"player" | "jev", RoommateDecision>());
  const jevBusy = useRef(false);

  const setSession = useCallback((value: RoommateSession | ((current: RoommateSession | undefined) => RoommateSession | undefined)) => {
    setSessionState((current) => {
      const next = typeof value === "function" ? value(current) : value;
      sessionRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    let alive = true;
    void repository.loadLatest().then((restored) => {
      if (!alive) return;
      if (restored) { sessionRef.current = restored; setSessionState(restored); }
      setLoading(false);
    });
    return () => { alive = false; };
  }, [repository]);

  useEffect(() => {
    const offObject = bridge.on("objectSelected", ({ objectId }) => setSelectedObjectId(objectId));
    const offMove = bridge.on("playerMoved", ({ roomId }) => {
      const current = sessionRef.current;
      if (!current) return;
      const player = current.world.characters.find((character) => character.id === "player");
      if (!player || player.roomId === roomId) return;
      try {
        setSession({ ...current, world: applyWorldCommand(current.world, { type: "move", actorId: "player", toRoomId: roomId }) });
      } catch { /* scene may briefly cross a non-adjacent room edge */ }
    });
    const offAnimation = bridge.on("animationCompleted", ({ actorId, actionId }) => {
      const action = pending.current.get(actorId);
      const current = sessionRef.current;
      if (!action || action.id !== actionId || !current) return;
      pending.current.delete(actorId);
      const completedAt = new Date().toISOString();
      const world = completeMacroAction(current.world, action, completedAt);
      const transition: CompletedTransition = { world, completedAt, decision: pendingDecisions.current.get(actorId) };
      pendingDecisions.current.delete(actorId);
      void repository.commitTransition(current, transition).then(setSession).catch((caught) => setError(errorMessage(caught)));
    });
    return () => { offObject(); offMove(); offAnimation(); };
  }, [bridge, repository, setSession]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => {
      const current = sessionRef.current;
      if (!current || current.world.paused || current.status !== "playing") return;
      const advanced = advanceSimulationClock(current.world, 250, { dayDurationMs });
      let world = advanced.world;
      for (const event of eventsDue(current.world, world)) world = applyScheduledEvent(world, event);
      setSession({ ...current, world, status: advanced.leaseReached ? "lease" : current.status, updatedAt: new Date().toISOString() });
    }, 250);
    return () => window.clearInterval(timer);
  }, [dayDurationMs, session?.id, setSession]);

  const startAction = useCallback((action: MacroAction) => {
    const current = sessionRef.current;
    if (!current) return;
    const world = applyWorldCommand(current.world, {
      type: "start-action",
      entry: { queueId: action.id, action, startedAt: new Date().toISOString() },
    });
    pending.current.set(action.actorId, action);
    setSession({ ...current, world });
    setSelectedObjectId(undefined);
    const scaledDuration = Math.max(40, Math.round(action.durationMs * dayDurationMs / 90_000));
    bridge.emit("playAction", { actorId: action.actorId, actionId: action.id, durationMs: scaledDuration });
  }, [bridge, dayDurationMs, setSession]);

  const requestJev = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || current.world.paused || current.status !== "playing" || jevBusy.current || pending.current.has("jev")) return;
    jevBusy.current = true;
    try {
      const revision = current.world.revision;
      const snapshot = await buildDecisionSnapshot(current.world, resolveAffordances(current.world, "jev"), {
        sessionId: current.id,
        decisionIndex: current.decisions.length,
      });
      const controller = new JevAutonomyController({
        decide: api.decideRoommate,
        currentStateHash: () => sessionRef.current?.world.revision === revision ? snapshot.stateHash : "stale",
        commit: (decision) => {
          const action = snapshot.candidates.find((candidate) => candidate.id === decision.selectedActionId);
          if (!action) throw new Error("Jev 返回了不存在的动作");
          pendingDecisions.current.set("jev", decision);
          startAction(action);
        },
      });
      await controller.request(snapshot);
      setError(undefined);
    } catch (caught) {
      const active = sessionRef.current;
      if (active && !active.world.paused) setSession({ ...active, world: applyWorldCommand(active.world, { type: "pause" }) });
      setError(errorMessage(caught));
    } finally {
      jevBusy.current = false;
    }
  }, [api.decideRoommate, setSession, startAction]);

  useEffect(() => {
    if (!autoJev || !session || error || session.world.paused || session.world.activeActions.some((entry) => entry.action.actorId === "jev")) return;
    void requestJev();
  }, [autoJev, error, requestJev, session]);

  const start = useCallback(() => {
    const next = createSession(new Date().toISOString());
    sessionRef.current = next;
    setSessionState(next);
  }, [createSession]);

  const retry = useCallback(() => {
    const current = sessionRef.current;
    if (!current) return;
    setError(undefined);
    if (current.world.paused) setSession({ ...current, world: applyWorldCommand(current.world, { type: "resume" }) });
  }, [setSession]);

  const selectedObject = session?.world.objects.find((object) => object.id === selectedObjectId);
  const actions = session && selectedObjectId ? resolvePlayerObjectActions(session.world, selectedObjectId) : [];

  return {
    session,
    loading,
    error,
    start,
    retry,
    selectedObject,
    actions,
    closeActions: () => setSelectedObjectId(undefined),
    chooseAction: startAction,
    replaceSession: setSession,
  };
}
