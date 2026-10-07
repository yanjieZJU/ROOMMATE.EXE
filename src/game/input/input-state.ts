const LEFT = new Set(["KeyA", "ArrowLeft"]);
const RIGHT = new Set(["KeyD", "ArrowRight"]);
const UP = new Set(["KeyW", "ArrowUp"]);
const DOWN = new Set(["KeyS", "ArrowDown"]);

export class InputState {
  private readonly held = new Set<string>();

  keyDown(code: string): void { this.held.add(code); }
  keyUp(code: string): void { this.held.delete(code); }
  clear(): void { this.held.clear(); }
  handleBlur = (): void => { this.clear(); };
  handleVisibilityChange = (hidden: boolean): void => { if (hidden) this.clear(); };

  vector(): { x: number; y: number } {
    const active = (keys: Set<string>) => [...keys].some((key) => this.held.has(key));
    return {
      x: Number(active(RIGHT)) - Number(active(LEFT)),
      y: Number(active(DOWN)) - Number(active(UP)),
    };
  }
}
