// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActionMenu } from "../../src/client/roommate/ActionMenu";
import { ACTION_CATALOG } from "../../src/game/actions/catalog";
import { createRoommateFixture } from "../fixtures/roommate";

afterEach(cleanup);

describe("contextual action menu", () => {
  it("shows executable action labels and supports keyboard selection", async () => {
    const world = createRoommateFixture().world;
    const actions = ["rest", "sleep"].map((id) => ACTION_CATALOG.get(id)!.toMacroAction(world, "player", { type: "object", id: "player-bed" }));
    const onChoose = vi.fn();
    const user = userEvent.setup();

    render(<ActionMenu objectLabel="你的床" actions={actions} onChoose={onChoose} onClose={vi.fn()} />);

    await user.keyboard("{Enter}");
    expect(onChoose).toHaveBeenCalledWith(actions[0]);
    expect(screen.getByText("占用座位八秒")).toBeTruthy();
  });
});
