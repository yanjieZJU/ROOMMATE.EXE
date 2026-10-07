import { describe, expect, it } from "vitest";

import { InputState } from "../../src/game/input/input-state";

describe("keyboard input state", () => {
  it("cancels opposite directions deterministically and clears on keyup", () => {
    const input = new InputState();
    input.keyDown("KeyA");
    input.keyDown("ArrowRight");
    input.keyDown("KeyW");

    expect(input.vector()).toEqual({ x: 0, y: -1 });
    input.keyUp("KeyW");
    expect(input.vector()).toEqual({ x: 0, y: 0 });
    input.keyUp("ArrowRight");
    expect(input.vector()).toEqual({ x: -1, y: 0 });
  });

  it("clears every held key on blur and when the document becomes hidden", () => {
    const input = new InputState();
    input.keyDown("KeyD");
    input.keyDown("ArrowDown");
    input.handleBlur();
    expect(input.vector()).toEqual({ x: 0, y: 0 });

    input.keyDown("KeyD");
    input.handleVisibilityChange(true);
    expect(input.vector()).toEqual({ x: 0, y: 0 });
  });
});
