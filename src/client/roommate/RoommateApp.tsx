import { useMemo, type ComponentType } from "react";

import { createHttpApiClient } from "../api/client";
import { GameBridge } from "../game/game-bridge";
import { RoommateGame, type RoommateGameProps } from "../game/RoommateGame";
import { RoommateRepository } from "../state/roommate-repository";
import { createInitialRoommateSession } from "../../game/simulation/initial-state";
import type { RoommateSession } from "../../shared/roommate-schemas";
import { ActionMenu } from "./ActionMenu";
import { GameHud } from "./GameHud";
import { NeedCue } from "./NeedCue";
import { PauseOverlay } from "./PauseOverlay";
import { LeaseEnding } from "./LeaseEnding";
import { requestJevLeaseChoice, submitPlayerLeaseChoice } from "../../game/ending/lease-decision";
import { useRoommateSession, type RoommateApiPort, type RoommateRepositoryPort } from "./use-roommate-session";

export type RoommateGameViewProps = RoommateGameProps;

export function RoommateApp({
  api: apiProp,
  repository: repositoryProp,
  createSession = createInitialRoommateSession,
  GameView = RoommateGame,
  autoJev = true,
  dayDurationMs = 90_000,
}: {
  api?: RoommateApiPort;
  repository?: RoommateRepositoryPort;
  createSession?: (now: string) => RoommateSession;
  GameView?: ComponentType<RoommateGameViewProps>;
  autoJev?: boolean;
  dayDurationMs?: number;
}) {
  const api = useMemo(() => apiProp ?? createHttpApiClient(), [apiProp]);
  const repository = useMemo(() => repositoryProp ?? new RoommateRepository(), [repositoryProp]);
  const bridge = useMemo(() => new GameBridge(), []);
  const state = useRoommateSession({ api, repository, bridge, createSession, autoJev, dayDurationMs });

  if (!state.session) {
    return (
      <main className="roommate-shell roommate-home">
        <p className="roommate-kicker">JEV-1.13-FREE / REALTIME CHOICE SIMULATION</p>
        <h1>合租七日<br /><span>ROOMMATE.EXE</span></h1>
        <p>和一个由 Jev 判断每次行动的室友，共同生活七天。你只能像真正的室友一样移动、使用物品和做出行动。</p>
        <button className="primary" onClick={state.start}>{state.loading ? "开始合租" : "开始合租"}</button>
      </main>
    );
  }

  const jev = state.session.world.characters.find((character) => character.id === "jev")!;
  if (state.session.status === "lease" || state.session.status === "complete") {
    return <main className="roommate-shell"><LeaseEnding session={state.session} onChoose={async (choice) => {
      const complete = await requestJevLeaseChoice(submitPlayerLeaseChoice(state.session!, choice), api.decideRoommate);
      state.replaceSession(complete);
      return complete;
    }} /></main>;
  }
  return (
    <main className="roommate-shell">
      <GameHud session={state.session} />
      <section className="apartment-stage">
        <GameView world={state.session.world} bridge={bridge} />
        <NeedCue character={jev} />
        {state.selectedObject && (
          <ActionMenu objectLabel={state.selectedObject.label} actions={state.actions} onChoose={state.chooseAction} onClose={state.closeActions} />
        )}
        {state.error && <PauseOverlay message={state.error} onRetry={state.retry} />}
      </section>
      <footer className="game-help"><span>WASD / 方向键移动</span><span>点击物品互动</span><span>状态通过动作呈现</span></footer>
    </main>
  );
}
