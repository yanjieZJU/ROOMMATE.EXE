import { describe, expect, it, vi } from "vitest";

import { PIXEL_PALETTE, createPixelTexture, rasterizePixelDefinition } from "../../src/game/render/pixel-texture";

describe("code-native pixel textures", () => {
  it("uses the approved apartment palette", () => {
    expect(PIXEL_PALETTE).toMatchObject({
      outline: "#17252a",
      cream: "#f6e7c8",
      coral: "#ef5b67",
      orange: "#e99a3f",
      teal: "#155e63",
      blue: "#68a9c9",
      green: "#5f9c5a",
    });
  });

  it("rasterizes palette indexes at an integer scale", () => {
    const raster = rasterizePixelDefinition({ key: "test", width: 2, height: 2, scale: 3, pixels: ["oc", "tg"] });

    expect(raster).toMatchObject({ width: 6, height: 6, scale: 3 });
    expect(raster.cells).toEqual(["#17252a", "#f6e7c8", "#155e63", "#5f9c5a"]);
  });

  it("disables smoothing when registering a canvas texture", () => {
    const fillRect = vi.fn();
    const context = { fillStyle: "", fillRect, imageSmoothingEnabled: true };
    const refresh = vi.fn();
    const scene = {
      textures: {
        exists: vi.fn(() => false),
        createCanvas: vi.fn(() => ({ context, refresh })),
      },
    };

    createPixelTexture(scene, { key: "test", width: 1, height: 1, scale: 4, pixels: ["o"] });

    expect(context.imageSmoothingEnabled).toBe(false);
    expect(fillRect).toHaveBeenCalledWith(0, 0, 4, 4);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
