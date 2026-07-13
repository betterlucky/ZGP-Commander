import type { Camera, FacilityMap, Vec2 } from "../types";

export interface TopDownTransform {
  scale: number;
  originX: number;
  originY: number;
  toScreen(point: Vec2): Vec2;
  toWorld(point: Vec2): Vec2;
}

export interface IsoTransform {
  tileW: number;
  tileH: number;
  originX: number;
  originY: number;
  toScreen(point: Vec2, z?: number): Vec2;
  toWorld(point: Vec2): Vec2;
}

export const makeTopDownTransform = (
  width: number,
  height: number,
  map: FacilityMap,
  camera: Camera,
): TopDownTransform => {
  const scale = Math.min(width / map.width, height / map.height) * 0.94 * camera.zoom;
  const contentWidth = map.width * scale;
  const contentHeight = map.height * scale;
  const originX = (width - contentWidth) / 2 + camera.panX;
  const originY = (height - contentHeight) / 2 + camera.panY;
  return {
    scale,
    originX,
    originY,
    toScreen: (point) => ({ x: originX + point.x * scale, y: originY + point.y * scale }),
    toWorld: (point) => ({ x: (point.x - originX) / scale, y: (point.y - originY) / scale }),
  };
};

export const makeIsoTransform = (
  width: number,
  height: number,
  map: FacilityMap,
  camera: Camera,
): IsoTransform => {
  const total = map.width + map.height;
  const fitWidth = (width * 1.88) / total;
  const fitHeight = (height * 1.75) / (total * 0.48 + 5);
  const tileW = Math.min(fitWidth, fitHeight) * camera.zoom;
  const tileH = tileW * 0.48;
  const extentHeight = total * tileH * 0.5;
  const centerOffsetX = (map.width - map.height) * tileW * 0.25;
  const originX = width * 0.5 - centerOffsetX + camera.panX;
  const originY = (height - extentHeight) * 0.5 + 1.3 * tileH + camera.panY;
  return {
    tileW,
    tileH,
    originX,
    originY,
    toScreen: (point, z = 0) => ({
      x: originX + (point.x - point.y) * tileW * 0.5,
      y: originY + (point.x + point.y) * tileH * 0.5 - z * tileH,
    }),
    toWorld: (point) => {
      const screenX = (point.x - originX) / (tileW * 0.5);
      const screenY = (point.y - originY) / (tileH * 0.5);
      return { x: (screenX + screenY) * 0.5, y: (screenY - screenX) * 0.5 };
    },
  };
};

export const roundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void => {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
};
