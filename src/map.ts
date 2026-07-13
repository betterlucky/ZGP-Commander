import { distance, mulberry32 } from "./math";
import type { FacilityMap, Prop, Room, Vec2, WallSegment } from "./types";

const key = (x: number, y: number): string => `${x},${y}`;

const rooms: Room[] = [
  { id: "pharmacy", label: "PHARMACY", x: 2, y: 2, w: 12, h: 8, explored: true },
  { id: "stores", label: "MEDICAL STORES", x: 16, y: 2, w: 8, h: 8, explored: true },
  { id: "north-hall", label: "NORTH GALLERY", x: 12, y: 5, w: 30, h: 3, explored: true },
  { id: "lab", label: "DIAGNOSTICS", x: 39, y: 2, w: 11, h: 9, explored: false },
  { id: "west-ward", label: "RECOVERY WARD", x: 2, y: 13, w: 14, h: 10, explored: true },
  { id: "reception", label: "RECEPTION", x: 18, y: 12, w: 14, h: 11, explored: true },
  { id: "east-corridor", label: "EAST CORRIDOR", x: 33, y: 6, w: 4, h: 21, explored: true },
  { id: "triage", label: "TRIAGE", x: 39, y: 14, w: 11, h: 12, explored: false },
  { id: "service", label: "SERVICE PASSAGE", x: 9, y: 26, w: 31, h: 4, explored: true },
  { id: "exit", label: "AMBULANCE BAY", x: 2, y: 25, w: 8, h: 6, explored: true },
  { id: "pharmacy-link", label: "", x: 6, y: 9, w: 3, h: 5, explored: true },
  { id: "stores-link", label: "", x: 20, y: 9, w: 3, h: 4, explored: true },
  { id: "reception-link", label: "", x: 31, y: 17, w: 3, h: 3, explored: true },
  { id: "triage-link", label: "", x: 36, y: 18, w: 4, h: 3, explored: false },
  { id: "ward-link", label: "", x: 8, y: 22, w: 3, h: 5, explored: true },
  { id: "reception-service", label: "", x: 24, y: 22, w: 4, h: 5, explored: true },
];

const fixedProps: Prop[] = [
  { kind: "shelf", x: 3, y: 3, w: 1, h: 5 },
  { kind: "shelf", x: 5, y: 3, w: 1, h: 5 },
  { kind: "terminal", x: 11, y: 3, w: 1.5, h: 1 },
  { kind: "crate", x: 9.2, y: 6.1, w: 1.2, h: 1.2 },
  { kind: "shelf", x: 17, y: 3, w: 1, h: 5 },
  { kind: "shelf", x: 21.7, y: 3, w: 1, h: 5 },
  { kind: "bed", x: 3.5, y: 14.5, w: 3, h: 1.2 },
  { kind: "bed", x: 3.5, y: 18, w: 3, h: 1.2 },
  { kind: "bed", x: 10.5, y: 14.5, w: 3, h: 1.2 },
  { kind: "bed", x: 10.5, y: 18, w: 3, h: 1.2 },
  { kind: "desk", x: 20, y: 14, w: 4, h: 1.4 },
  { kind: "chair", x: 21, y: 16, w: 0.8, h: 0.8 },
  { kind: "desk", x: 26, y: 19, w: 4, h: 1.4 },
  { kind: "chair", x: 28.8, y: 17.4, w: 0.8, h: 0.8 },
  { kind: "terminal", x: 30, y: 13, w: 1, h: 1 },
  { kind: "desk", x: 41, y: 3.5, w: 3, h: 1.2 },
  { kind: "terminal", x: 47.5, y: 3, w: 1, h: 1 },
  { kind: "bed", x: 40.5, y: 16, w: 3.2, h: 1.2 },
  { kind: "bed", x: 45.5, y: 16, w: 3.2, h: 1.2 },
  { kind: "bed", x: 40.5, y: 21, w: 3.2, h: 1.2 },
  { kind: "bed", x: 45.5, y: 21, w: 3.2, h: 1.2 },
  { kind: "crate", x: 13, y: 27, w: 1.2, h: 1.2 },
  { kind: "crate", x: 16, y: 27.2, w: 1.1, h: 1.1 },
  { kind: "terminal", x: 37.5, y: 27, w: 1, h: 1 },
];

const buildWalkable = (): Set<string> => {
  const walkable = new Set<string>();
  for (const room of rooms) {
    for (let y = room.y; y < room.y + room.h; y += 1) {
      for (let x = room.x; x < room.x + room.w; x += 1) walkable.add(key(x, y));
    }
  }
  return walkable;
};

const buildWalls = (walkable: Set<string>): WallSegment[] => {
  const walls: WallSegment[] = [];
  for (const cell of walkable) {
    const [x, y] = cell.split(",").map(Number);
    if (!walkable.has(key(x, y - 1))) walls.push({ a: { x, y }, b: { x: x + 1, y } });
    if (!walkable.has(key(x + 1, y))) walls.push({ a: { x: x + 1, y }, b: { x: x + 1, y: y + 1 } });
    if (!walkable.has(key(x, y + 1))) walls.push({ a: { x: x + 1, y: y + 1 }, b: { x, y: y + 1 } });
    if (!walkable.has(key(x - 1, y))) walls.push({ a: { x, y: y + 1 }, b: { x, y } });
  }
  return walls;
};

const scatterClutter = (walkable: Set<string>): Prop[] => {
  const random = mulberry32(88041);
  const props: Prop[] = [];
  for (let i = 0; i < 34; i += 1) {
    const x = Math.floor(random() * 48) + 2;
    const y = Math.floor(random() * 28) + 2;
    if (!walkable.has(key(x, y))) continue;
    if (fixedProps.some((prop) => distance({ x, y }, prop) < 2.2)) continue;
    props.push({
      kind: random() > 0.55 ? "chair" : "crate",
      x: x + 0.15 + random() * 0.45,
      y: y + 0.15 + random() * 0.45,
      w: 0.45 + random() * 0.35,
      h: 0.45 + random() * 0.35,
      rotation: random() * Math.PI,
    });
  }
  return props;
};

export const createFacilityMap = (): FacilityMap => {
  const walkable = buildWalkable();
  return {
    width: 52,
    height: 33,
    rooms: rooms.map((room) => ({ ...room })),
    walls: buildWalls(walkable),
    props: [...fixedProps, ...scatterClutter(walkable)],
    cache: { x: 9.8, y: 6.7 },
    extraction: { x: 5.2, y: 28.2 },
    walkable,
  };
};

export const isWalkable = (map: FacilityMap, point: Vec2): boolean =>
  map.walkable.has(key(Math.floor(point.x), Math.floor(point.y)));

export const nearestWalkable = (map: FacilityMap, point: Vec2): Vec2 => {
  const originX = Math.floor(point.x);
  const originY = Math.floor(point.y);
  if (map.walkable.has(key(originX, originY))) return { x: originX + 0.5, y: originY + 0.5 };
  for (let radius = 1; radius < 12; radius += 1) {
    for (let y = originY - radius; y <= originY + radius; y += 1) {
      for (let x = originX - radius; x <= originX + radius; x += 1) {
        if (map.walkable.has(key(x, y))) return { x: x + 0.5, y: y + 0.5 };
      }
    }
  }
  return { x: 5.5, y: 28.5 };
};

export const findPath = (map: FacilityMap, from: Vec2, requestedTarget: Vec2): Vec2[] => {
  const start = nearestWalkable(map, from);
  const target = nearestWalkable(map, requestedTarget);
  const startCell = { x: Math.floor(start.x), y: Math.floor(start.y) };
  const targetCell = { x: Math.floor(target.x), y: Math.floor(target.y) };
  const queue: Vec2[] = [startCell];
  const cameFrom = new Map<string, string>();
  const visited = new Set<string>([key(startCell.x, startCell.y)]);
  const directions = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
  let cursor = 0;

  while (cursor < queue.length) {
    const current = queue[cursor++];
    if (current.x === targetCell.x && current.y === targetCell.y) break;
    for (const direction of directions) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const nextKey = key(next.x, next.y);
      if (!map.walkable.has(nextKey) || visited.has(nextKey)) continue;
      visited.add(nextKey);
      cameFrom.set(nextKey, key(current.x, current.y));
      queue.push(next);
    }
  }

  const targetKey = key(targetCell.x, targetCell.y);
  if (!visited.has(targetKey)) return [];
  const reversed: Vec2[] = [];
  let currentKey = targetKey;
  while (currentKey !== key(startCell.x, startCell.y)) {
    const [x, y] = currentKey.split(",").map(Number);
    reversed.push({ x: x + 0.5, y: y + 0.5 });
    currentKey = cameFrom.get(currentKey) ?? key(startCell.x, startCell.y);
  }
  reversed.reverse();

  const compressed: Vec2[] = [];
  for (let i = 0; i < reversed.length; i += 1) {
    const current = reversed[i];
    const previous = i === 0 ? start : reversed[i - 1];
    const next = reversed[i + 1];
    if (!next) {
      compressed.push(target);
      continue;
    }
    const directionA = { x: Math.sign(current.x - previous.x), y: Math.sign(current.y - previous.y) };
    const directionB = { x: Math.sign(next.x - current.x), y: Math.sign(next.y - current.y) };
    if (directionA.x !== directionB.x || directionA.y !== directionB.y) compressed.push(current);
  }
  return compressed;
};
