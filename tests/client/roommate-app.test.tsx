// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RoommateApp, type RoommateGameViewProps } from "../../src/client/roommate/RoommateApp";
import type { RoommateSession } from "../../src/shared/roommate-schemas";
import { createInitialRoommateSession } from "../../src/game/simulation/initial-state";

afterEach(cleanup);

function FakeGame({ bridge }: RoommateGameViewProps) {
  return (
    <section aria-label="测试公寓">
      <button onClick={() => bridge.emit("objectSelected", { objectId: "player-bed" })}>选择床</button>
      <button onClick={() => bridge.emit("animationCompleted", { actorId: "player", actionId: "rest@player-bed" })}>完成休息</button>
    </section>
  );
}

function repository() {
  let saved: RoommateSession | null = null;
  return {
    loadLatest: vi.fn(async () => saved),
    commitTransition: vi.fn(async (session: RoommateSession, transition: { world: RoommateSession["world"]; completedAt: string }) => {
      saved = { ...session, world: transition.world, updatedAt: transition.completedAt };
      return saved;
    }),
    savePaused: vi.fn(async (session: RoommateSession) => session),
  };
}

describe("ROOMMATE.EXE shell", () => {
  it("starts a factual roommate session and commits a chosen object action only after animation", async () => {
    const store = repository();
    const user = userEvent.setup();
    render(<RoommateApp repository={store} GameView={FakeGame} autoJev={false} />);

    await user.click(screen.getByRole("button", { name: "开始合租" }));
    expect(screen.getByText("第 1 天")).toBeTruthy();
    expect(screen.getByText(/刚搬到这座城市/)).toBeTruthy();
    expect(screen.queryByText(/好感|信任|续租倾向/)).toBeNull();

    await user.click(screen.getByRole("button", { name: "选择床" }));
    expect(screen.getByRole("dialog", { name: "你的床的可执行动作" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /坐下休息/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(store.commitTransition).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "完成休息" }));
    await waitFor(() => expect(store.commitTransition).toHaveBeenCalledTimes(1));
  });

  it("renders physical need cues without social scores", async () => {
    const createSession = (now: string) => {
      const session = createInitialRoommateSession(now);
      session.world.characters.find((character) => character.id === "jev")!.needs = { hunger: 90, energy: 10, mood: 20, focus: 20 };
      return session;
    };
    const user = userEvent.setup();
    render(<RoommateApp repository={repository()} GameView={FakeGame} createSession={createSession} autoJev={false} />);
    await user.click(screen.getByRole("button", { name: "开始合租" }));

    expect(screen.getByLabelText("Jev 的身体状态").textContent).toContain("饥饿");
    expect(screen.getByLabelText("Jev 的身体状态").textContent).toContain("打哈欠");
    expect(screen.getByLabelText("Jev 的身体状态").textContent).toContain("踱步");
    expect(document.body.textContent).not.toMatch(/好感|信任值|续租倾向/);
  });

  it("pauses the world and offers one retry when Jev is unavailable", async () => {
    const api = { decideRoommate: vi.fn(async () => { throw { error: { message: "室友暂时失去回应", retryable: true } }; }) };
    const user = userEvent.setup();
    render(<RoommateApp repository={repository()} api={api} GameView={FakeGame} />);
    await user.click(screen.getByRole("button", { name: "开始合租" }));

    expect((await screen.findByRole("alert")).textContent).toContain("室友暂时失去回应");
    expect(screen.getAllByRole("button", { name: "重试连接 Jev" })).toHaveLength(1);
  });
});
