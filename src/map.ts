import { distance, mulberry32 } from "./math";
import type { FacilityMap, Prop, Room, Vec2, WallSegment } from "./types";

const key = (x: number, y: number): string => `${x},${y}`;

const rooms: Room[] = [
  { id: "open-floor", label: "", x: 4, y: 3, w: 56, h: 33, explored: true },
  { id: "breach-cell", label: "", x: 16, y: 36, w: 1, h: 1, explored: true },
  { id: "landing", label: "LANDING / EXTRACTION", x: 10, y: 37, w: 12, h: 5, explored: true },
  { id: "receiving", label: "RECEIVING FLOOR", x: 5, y: 5, w: 17, h: 12, explored: true },
  { id: "bulk-stores", label: "BULK MEDICAL STORES", x: 23, y: 5, w: 23, h: 12, explored: true },
  { id: "dispatch", label: "DISPATCH", x: 47, y: 5, w: 12, h: 12, explored: true },
  { id: "sorting", label: "OPEN SORTING FLOOR", x: 14, y: 19, w: 34, h: 15, explored: true },
  { id: "loading", label: "LOADING APRON", x: 5, y: 26, w: 9, h: 9, explored: true },
];

const fixedProps: Prop[] = [
  { kind: "shelf", x: 10, y: 6, w: 2, h: 8, blocksMovement: true, blocksVision: true },
  { kind: "shelf", x: 17, y: 6, w: 2, h: 8, blocksMovement: true, blocksVision: true },
  { kind: "shelf", x: 25, y: 6, w: 2, h: 8, blocksMovement: true, blocksVision: true },
  { kind: "shelf", x: 33, y: 6, w: 2, h: 8, blocksMovement: true, blocksVision: true },
  { kind: "shelf", x: 41, y: 6, w: 2, h: 8, blocksMovement: true, blocksVision: true },
  { kind: "shelf", x: 50, y: 8, w: 7, h: 2, blocksMovement: true, blocksVision: true },
  { kind: "shelf", x: 50, y: 14, w: 7, h: 2, blocksMovement: true, blocksVision: true },
  { kind: "pallet", x: 8, y: 21, w: 4, h: 3, blocksMovement: true, blocksVision: false },
  { kind: "pallet", x: 20, y: 21, w: 4, h: 2, blocksMovement: true, blocksVision: false },
  { kind: "pallet", x: 31, y: 27, w: 5, h: 2, blocksMovement: true, blocksVision: false },
  { kind: "pallet", x: 47, y: 22, w: 4, h: 3, blocksMovement: true, blocksVision: false },
  { kind: "crate", x: 18, y: 29, w: 2, h: 2, blocksMovement: true, blocksVision: false },
  { kind: "crate", x: 40, y: 20, w: 2, h: 2, blocksMovement: true, blocksVision: false },
  { kind: "terminal", x: 6, y: 7, w: 1.5, h: 1, blocksMovement: true, blocksVision: false },
  { kind: "terminal", x: 56, y: 29, w: 1, h: 1, blocksMovement: true, blocksVision: false },
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
  for (let i = 0; i < 15; i += 1) {
    const x = Math.floor(random() * 52) + 5;
    const y = Math.floor(random() * 28) + 5;
    if (!walkable.has(key(x, y))) continue;
    if (fixedProps.some((prop) => distance({ x, y }, prop) < 2.2)) continue;
    props.push({
      kind: random() > 0.55 ? "chair" : "crate",
      x: x + 0.15 + random() * 0.45,
      y: y + 0.15 + random() * 0.45,
      w: 0.45 + random() * 0.35,
      h: 0.45 + random() * 0.35,
      rotation: random() * Math.PI,
      blocksMovement: false,
      blocksVision: false,
    });
  }
  return props;
};

export const createFacilityMap = (): FacilityMap => {
  const walkable = buildWalkable();
  const props = [...fixedProps, ...scatterClutter(walkable)];
  const blocked = (vision: boolean): Set<string> => {
    const cells = new Set<string>();
    for (const prop of props) {
      if (vision ? !prop.blocksVision : !prop.blocksMovement) continue;
      for (let y = Math.floor(prop.y); y < Math.ceil(prop.y + prop.h); y += 1) {
        for (let x = Math.floor(prop.x); x < Math.ceil(prop.x + prop.w); x += 1) cells.add(key(x, y));
      }
    }
    return cells;
  };
  const walls = buildWalls(walkable);
  walls.push({ a: { x: 16, y: 36 }, b: { x: 17, y: 36 }, door: true, locked: true });
  return {
    width: 64,
    height: 44,
    rooms: rooms.map((room) => ({ ...room })),
    walls,
    props,
    caches: [
      { id: "cache-1", pos: { x: 7.5, y: 8.5 } },
      { id: "cache-2", pos: { x: 21.5, y: 16.5 } },
      { id: "cache-3", pos: { x: 38.5, y: 18.5 } },
      { id: "cache-4", pos: { x: 54.5, y: 18.5 } },
      { id: "cache-5", pos: { x: 27.5, y: 31.5 } },
      { id: "cache-6", pos: { x: 52.5, y: 31.5 } },
    ],
    insertion: { x: 15.5, y: 40.5 },
    extraction: { x: 15.5, y: 40.5 },
    breach: { pos: { x: 16, y: 36 }, insideCell: { x: 16, y: 35 }, outsideCell: { x: 16, y: 36 }, open: false },
    contactSpawns: [
      { x: 6.5, y: 4.5 }, { x: 20.5, y: 4.5 }, { x: 36.5, y: 4.5 }, { x: 52.5, y: 4.5 },
      { x: 5.5, y: 18.5 }, { x: 5.5, y: 31.5 }, { x: 58.5, y: 20.5 }, { x: 58.5, y: 32.5 },
    ],
    walkable,
    movementBlocked: blocked(false),
    visionBlocked: blocked(true),
  };
};

export const isWalkable = (map: FacilityMap, point: Vec2): boolean =>
  map.walkable.has(key(Math.floor(point.x), Math.floor(point.y)))
  && !map.movementBlocked.has(key(Math.floor(point.x), Math.floor(point.y)));

export const nearestWalkable = (map: FacilityMap, point: Vec2): Vec2 => {
  const originX = Math.floor(point.x);
  const originY = Math.floor(point.y);
  if (isWalkable(map, point)) return { x: originX + 0.5, y: originY + 0.5 };
  for (let radius = 1; radius < 12; radius += 1) {
    for (let y = originY - radius; y <= originY + radius; y += 1) {
      for (let x = originX - radius; x <= originX + radius; x += 1) {
        if (isWalkable(map, { x: x + 0.5, y: y + 0.5 })) return { x: x + 0.5, y: y + 0.5 };
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
  const queue: Array<{ point: Vec2; priority: number }> = [{ point: startCell, priority: 0 }];
  const cameFrom = new Map<string, string>();
  const cost = new Map<string, number>([[key(startCell.x, startCell.y), 0]]);
  const closed = new Set<string>();
  const directions = [
    { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
    { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 },
  ];

  const sameCell = (a: Vec2, b: Vec2): boolean => a.x === b.x && a.y === b.y;
  const breachBlocked = (a: Vec2, b: Vec2): boolean => !map.breach.open && (
    (sameCell(a, map.breach.insideCell) && sameCell(b, map.breach.outsideCell))
    || (sameCell(b, map.breach.insideCell) && sameCell(a, map.breach.outsideCell))
  );

  const pushQueue = (entry: { point: Vec2; priority: number }): void => {
    queue.push(entry);
    let index = queue.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (queue[parent].priority <= entry.priority) break;
      queue[index] = queue[parent];
      index = parent;
    }
    queue[index] = entry;
  };

  const popQueue = (): Vec2 | null => {
    if (!queue.length) return null;
    const first = queue[0].point;
    const last = queue.pop();
    if (!queue.length || !last) return first;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= queue.length) break;
      const child = right < queue.length && queue[right].priority < queue[left].priority ? right : left;
      if (queue[child].priority >= last.priority) break;
      queue[index] = queue[child];
      index = child;
    }
    queue[index] = last;
    return first;
  };

  while (queue.length) {
    const current = popQueue()!;
    const currentKey = key(current.x, current.y);
    if (closed.has(currentKey)) continue;
    closed.add(currentKey);
    if (current.x === targetCell.x && current.y === targetCell.y) break;
    for (const direction of directions) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const nextKey = key(next.x, next.y);
      if (!isWalkable(map, { x: next.x + 0.5, y: next.y + 0.5 }) || breachBlocked(current, next)) continue;
      if (direction.x !== 0 && direction.y !== 0) {
        if (!isWalkable(map, { x: current.x + direction.x + 0.5, y: current.y + 0.5 })) continue;
        if (!isWalkable(map, { x: current.x + 0.5, y: current.y + direction.y + 0.5 })) continue;
      }
      const nextCost = (cost.get(currentKey) ?? 0) + (direction.x && direction.y ? Math.SQRT2 : 1);
      if (nextCost >= (cost.get(nextKey) ?? Infinity)) continue;
      cost.set(nextKey, nextCost);
      cameFrom.set(nextKey, currentKey);
      pushQueue({ point: next, priority: nextCost + distance(next, targetCell) });
    }
  }

  const targetKey = key(targetCell.x, targetCell.y);
  if (!cost.has(targetKey)) return [];
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

export const hasLineOfSight = (map: FacilityMap, from: Vec2, to: Vec2): boolean => {
  const steps = Math.max(1, Math.ceil(distance(from, to) * 3));
  for (let index = 1; index < steps; index += 1) {
    const t = index / steps;
    const cell = key(Math.floor(from.x + (to.x - from.x) * t), Math.floor(from.y + (to.y - from.y) * t));
    if (map.visionBlocked.has(cell)) return false;
  }
  return true;
};
