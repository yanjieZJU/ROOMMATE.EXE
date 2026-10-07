// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LeaseEnding } from "../../src/client/roommate/LeaseEnding";
import { submitPlayerLeaseChoice } from "../../src/game/ending/lease-decision";
import { createRoommateFixture } from "../fixtures/roommate";

afterEach(cleanup);

describe("lease ending UI", () => {
  it("keeps the player's card sealed until both choices can flip together", async () => {
    const base = createRoommateFixture();
    base.status = "lease";
    base.world.day = 7;
    const completed = submitPlayerLeaseChoice(base, "renew");
    completed.lease.jevChoice = "leave";
    completed.lease.revealed = true;
    completed.status = "complete";
    const onChoose = vi.fn(async () => completed);
    const user = userEvent.setup();

    render(<LeaseEnding session={base} onChoose={onChoose} />);
    await user.click(screen.getByRole("button", { name: "选择续租" }));

    expect(await screen.findByText("你的选择：续租")).toBeTruthy();
    expect(screen.getByText("Jev 的选择：搬走")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/70%|概率|最佳结局|人格总结/);
    expect(screen.getByRole("button", { name: "查看七日关键决策" })).toBeTruthy();
  });
});
