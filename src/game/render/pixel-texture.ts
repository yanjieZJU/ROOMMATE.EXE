export const PIXEL_PALETTE = {
  outline: "#17252a",
  cream: "#f6e7c8",
  coral: "#ef5b67",
  orange: "#e99a3f",
  teal: "#155e63",
  blue: "#68a9c9",
  green: "#5f9c5a",
  transparent: "transparent",
} as const;

const SYMBOLS: Record<string, keyof typeof PIXEL_PALETTE> = {
  o: "outline",
  c: "cream",
  r: "coral",
  a: "orange",
  t: "teal",
  b: "blue",
  g: "green",
  ".": "transparent",
};

export interface PixelDefinition {
  key: string;
  width: number;
  height: number;
  scale: number;
  pixels: string[];
}

export interface PixelTextureScene {
  textures: {
    exists(key: string): boolean;
    createCanvas(key: string, width: number, height: number): {
      context: { fillStyle: string | CanvasGradient | CanvasPattern; imageSmoothingEnabled: boolean; clearRect?(x: number, y: number, width: number, height: number): void; fillRect(x: number, y: number, width: number, height: number): void };
      refresh(): void;
    } | null;
  };
}

export function rasterizePixelDefinition(definition: PixelDefinition) {
  if (!Number.isInteger(definition.scale) || definition.scale < 1) throw new RangeError("pixel scale must be a positive integer");
  if (definition.pixels.length !== definition.height || definition.pixels.some((row) => row.length !== definition.width)) {
    throw new RangeError("pixel definition dimensions do not match rows");
  }
  return {
    width: definition.width * definition.scale,
    height: definition.height * definition.scale,
    scale: definition.scale,
    cells: definition.pixels.flatMap((row) => [...row].map((symbol) => PIXEL_PALETTE[SYMBOLS[symbol] ?? "transparent"])),
  };
}

export function createPixelTexture(scene: PixelTextureScene, definition: PixelDefinition): void {
  if (scene.textures.exists(definition.key)) return;
  const raster = rasterizePixelDefinition(definition);
  const texture = scene.textures.createCanvas(definition.key, raster.width, raster.height);
  if (!texture) throw new Error(`无法创建像素纹理：${definition.key}`);
  texture.context.imageSmoothingEnabled = false;
  texture.context.clearRect?.(0, 0, raster.width, raster.height);
  raster.cells.forEach((color, index) => {
    if (color === "transparent") return;
    texture.context.fillStyle = color;
    texture.context.fillRect((index % definition.width) * definition.scale, Math.floor(index / definition.width) * definition.scale, definition.scale, definition.scale);
  });
  texture.refresh();
}
