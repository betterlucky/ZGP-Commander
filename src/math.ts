import type { Vec2 } from "./types";

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

export const angleTo = (a: Vec2, b: Vec2): number => Math.atan2(b.y - a.y, b.x - a.x);

export const moveTowards = (from: Vec2, to: Vec2, amount: number): Vec2 => {
  const d = distance(from, to);
  if (d <= amount || d === 0) return { ...to };
  return {
    x: from.x + ((to.x - from.x) / d) * amount,
    y: from.y + ((to.y - from.y) / d) * amount,
  };
};

export const mulberry32 = (seed: number): (() => number) => {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
};

export const hashNoise = (x: number, y: number, seed = 0): number => {
  const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return value - Math.floor(value);
};

export const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
};
