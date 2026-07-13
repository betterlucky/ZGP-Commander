import { clamp, hashNoise, mulberry32 } from "../math";
import type { Camera, Contact, Prop, SimulationState, Unit, Vec2 } from "../types";
import { makeIsoTransform, type IsoTransform } from "./shared";

interface Point3 {
  x: number;
  y: number;
  z: number;
  alpha?: number;
  size?: number;
}

export class LidarRenderer {
  public transform: IsoTransform | null = null;

  public render(ctx: CanvasRenderingContext2D, width: number, height: number, state: SimulationState, camera: Camera): void {
    const transform = makeIsoTransform(width, height, state.map, camera);
    this.transform = transform;
    ctx.clearRect(0, 0, width, height);
    const background = ctx.createRadialGradient(width * 0.54, height * 0.5, 0, width * 0.54, height * 0.5, width * 0.72);
    background.addColorStop(0, "#08131a");
    background.addColorStop(0.55, "#03090d");
    background.addColorStop(1, "#010305");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    this.drawFloor(ctx, state, transform);
    this.drawPaths(ctx, state, transform);
    this.drawProps(ctx, state, transform);
    this.drawWalls(ctx, state, transform);
    this.drawObjectives(ctx, state, transform);
    this.drawContacts(ctx, state, transform);
    this.drawUnits(ctx, state, transform);
    this.drawScan(ctx, width, height, state);
  }

  private drawFloor(ctx: CanvasRenderingContext2D, state: SimulationState, transform: IsoTransform): void {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "rgba(152,192,207,.24)";
    for (const cell of state.map.walkable) {
      const [x, y] = cell.split(",").map(Number);
      const explored = x < 38 || (y > 25 && x < 41);
      const count = explored ? 3 : 1;
      for (let i = 0; i < count; i += 1) {
        const px = x + 0.08 + hashNoise(x * 5 + i, y * 7, 44) * 0.84;
        const py = y + 0.08 + hashNoise(x * 11, y * 3 + i, 91) * 0.84;
        const point = transform.toScreen({ x: px, y: py });
        const variation = hashNoise(x + i, y, 8);
        ctx.globalAlpha = explored ? 0.22 + variation * 0.28 : 0.05 + variation * 0.08;
        const size = variation > 0.8 ? 1.35 : 0.8;
        ctx.fillRect(point.x, point.y, size, size);
      }
    }

    ctx.lineWidth = 0.65;
    ctx.strokeStyle = "rgba(119,176,196,.11)";
    for (const room of state.map.rooms) {
      if (!room.label || !room.explored) continue;
      const corners = [
        transform.toScreen({ x: room.x, y: room.y }),
        transform.toScreen({ x: room.x + room.w, y: room.y }),
        transform.toScreen({ x: room.x + room.w, y: room.y + room.h }),
        transform.toScreen({ x: room.x, y: room.y + room.h }),
      ];
      ctx.beginPath(); ctx.moveTo(corners[0].x, corners[0].y);
      for (let i = 1; i < corners.length; i += 1) ctx.lineTo(corners[i].x, corners[i].y);
      ctx.closePath(); ctx.stroke();
      const label = transform.toScreen({ x: room.x + room.w * 0.5, y: room.y + room.h * 0.5 }, 0.03);
      ctx.globalAlpha = 0.58;
      ctx.font = `${Math.max(8, transform.tileW * 0.38)}px 'Roboto Mono', monospace`;
      ctx.textAlign = "center"; ctx.fillStyle = "rgba(160,213,228,.7)";
      ctx.fillText(room.label, label.x, label.y);
    }
    ctx.restore();
  }

  private drawWalls(ctx: CanvasRenderingContext2D, state: SimulationState, transform: IsoTransform): void {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = "rgba(135,205,225,.45)";
    ctx.shadowBlur = 2;
    ctx.fillStyle = "#9fc7d2";
    for (let index = 0; index < state.map.walls.length; index += 1) {
      const wall = state.map.walls[index];
      const samples = 5;
      for (let i = 0; i <= samples; i += 1) {
        const t = i / samples;
        const x = wall.a.x + (wall.b.x - wall.a.x) * t;
        const y = wall.a.y + (wall.b.y - wall.a.y) * t;
        for (let layer = 0; layer < 3; layer += 1) {
          const z = layer * 0.52 + hashNoise(index, i + layer, 7) * 0.08;
          const point = transform.toScreen({ x, y }, z);
          ctx.globalAlpha = 0.24 + layer * 0.16 + hashNoise(index + i, layer, 3) * 0.2;
          const size = layer === 2 ? 1.45 : 1;
          ctx.fillRect(point.x, point.y, size, size);
        }
      }
    }
    ctx.restore();
  }

  private drawProps(ctx: CanvasRenderingContext2D, state: SimulationState, transform: IsoTransform): void {
    for (let index = 0; index < state.map.props.length; index += 1) {
      const prop = state.map.props[index];
      const height = prop.kind === "shelf" ? 1.35 : prop.kind === "terminal" ? 1.05 : prop.kind === "bed" ? 0.5 : 0.7;
      this.drawPointBox(ctx, transform, prop, height, index);
    }
  }

  private drawPointBox(ctx: CanvasRenderingContext2D, transform: IsoTransform, prop: Prop, height: number, seed: number): void {
    const random = mulberry32(6100 + seed * 97);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = prop.kind === "terminal" ? "#8bd8df" : "#7599a3";
    ctx.shadowColor = "rgba(90,180,200,.35)";
    ctx.shadowBlur = 1.5;
    const rotation = prop.rotation ?? 0;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    for (let i = 0; i < 32; i += 1) {
      const edge = Math.floor(random() * 4);
      let localX = (random() - 0.5) * prop.w;
      let localY = (random() - 0.5) * prop.h;
      if (edge === 0) localX = -prop.w / 2;
      if (edge === 1) localX = prop.w / 2;
      if (edge === 2) localY = -prop.h / 2;
      if (edge === 3) localY = prop.h / 2;
      const x = prop.x + prop.w / 2 + localX * cos - localY * sin;
      const y = prop.y + prop.h / 2 + localX * sin + localY * cos;
      const z = random() > 0.55 ? height : random() * height;
      const point = transform.toScreen({ x, y }, z);
      ctx.globalAlpha = 0.18 + random() * 0.35;
      ctx.fillRect(point.x, point.y, 0.8 + random(), 0.8 + random());
    }
    ctx.restore();
  }

  private drawPaths(ctx: CanvasRenderingContext2D, state: SimulationState, transform: IsoTransform): void {
    for (const unit of state.units) {
      if (!unit.selected || !unit.path.length) continue;
      const start = transform.toScreen(unit.pos, 0.04);
      ctx.save(); ctx.strokeStyle = "rgba(74,225,255,.76)"; ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]); ctx.shadowColor = "#45dfff"; ctx.shadowBlur = 5;
      ctx.beginPath(); ctx.moveTo(start.x, start.y);
      for (const waypoint of unit.path) {
        const point = transform.toScreen(waypoint, 0.04);
        ctx.lineTo(point.x, point.y);
      }
      ctx.stroke(); ctx.setLineDash([]);
      const last = transform.toScreen(unit.path[unit.path.length - 1], 0.04);
      ctx.beginPath(); ctx.arc(last.x, last.y, 5, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  private drawObjectives(ctx: CanvasRenderingContext2D, state: SimulationState, transform: IsoTransform): void {
    const cache = transform.toScreen(state.map.cache, 0.4);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = "#ffb42e"; ctx.shadowBlur = 12;
    ctx.strokeStyle = "#ffc14d"; ctx.lineWidth = 1.4;
    const size = transform.tileW * 0.38;
    ctx.strokeRect(cache.x - size / 2, cache.y - size * 0.42, size, size * 0.76);
    ctx.beginPath(); ctx.moveTo(cache.x, cache.y - size * 0.3); ctx.lineTo(cache.x, cache.y + size * 0.22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cache.x - size * 0.25, cache.y - size * 0.04); ctx.lineTo(cache.x + size * 0.25, cache.y - size * 0.04); ctx.stroke();
    ctx.strokeStyle = `rgba(255,185,54,${0.5 + Math.sin(state.elapsed * 3) * 0.25})`;
    ctx.beginPath(); ctx.arc(cache.x, cache.y, size * 0.72, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    const extract = transform.toScreen(state.map.extraction, 0.02);
    ctx.save(); ctx.strokeStyle = "rgba(75,240,210,.9)"; ctx.fillStyle = "rgba(55,210,185,.12)";
    ctx.shadowColor = "#4af0d5"; ctx.shadowBlur = 10; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(extract.x, extract.y, transform.tileW * 1.2, transform.tileH * 1.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.font = `700 ${Math.max(9, transform.tileW * 0.42)}px monospace`; ctx.textAlign = "center";
    ctx.fillText("EXTRACTION", extract.x, extract.y + transform.tileH * 2);
    ctx.restore();
  }

  private drawUnits(ctx: CanvasRenderingContext2D, state: SimulationState, transform: IsoTransform): void {
    const sorted = [...state.units].sort((a, b) => a.pos.x + a.pos.y - (b.pos.x + b.pos.y));
    for (const unit of sorted) this.drawUnit(ctx, unit, state, transform);
  }

  private drawUnit(ctx: CanvasRenderingContext2D, unit: Unit, state: SimulationState, transform: IsoTransform): void {
    const gait = unit.state === "moving" ? Math.sin(unit.phase) * 0.35 : 0;
    const forward = { x: Math.cos(unit.facing), y: Math.sin(unit.facing) };
    const right = { x: -forward.y, y: forward.x };
    const points: Point3[] = [];
    const random = mulberry32(9000 + unit.id * 171);

    for (let i = 0; i < 44; i += 1) {
      const angle = random() * Math.PI * 2;
      const radial = Math.sqrt(random());
      const localForward = (random() - 0.5) * 0.52;
      const localRight = Math.cos(angle) * radial * (unit.role === "SCAVENGER" ? 0.45 : 0.36);
      points.push({
        x: unit.pos.x + forward.x * localForward + right.x * localRight,
        y: unit.pos.y + forward.y * localForward + right.y * localRight,
        z: 1.05 + random() * 0.72,
        alpha: 0.45 + random() * 0.55,
        size: 0.8 + random() * 1.2,
      });
    }
    for (let i = 0; i < 20; i += 1) {
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random()) * 0.25;
      const zAngle = (random() - 0.5) * Math.PI;
      points.push({
        x: unit.pos.x + forward.x * 0.08 + right.x * Math.cos(angle) * radius,
        y: unit.pos.y + forward.y * 0.08 + right.y * Math.cos(angle) * radius,
        z: 1.95 + Math.sin(zAngle) * 0.23,
        alpha: 0.65 + random() * 0.35,
        size: 1 + random() * 1.2,
      });
    }
    this.addLimb(points, unit.pos, { x: right.x * 0.2, y: right.y * 0.2, z: 1.12 }, { x: right.x * 0.3 + forward.x * gait, y: right.y * 0.3 + forward.y * gait, z: 0.05 }, random);
    this.addLimb(points, unit.pos, { x: -right.x * 0.2, y: -right.y * 0.2, z: 1.12 }, { x: -right.x * 0.3 - forward.x * gait, y: -right.y * 0.3 - forward.y * gait, z: 0.05 }, random);
    this.addLimb(points, unit.pos, { x: right.x * 0.32 + forward.x * 0.05, y: right.y * 0.32 + forward.y * 0.05, z: 1.65 }, { x: right.x * 0.17 + forward.x * 0.72, y: right.y * 0.17 + forward.y * 0.72, z: 1.34 }, random);
    this.addLimb(points, unit.pos, { x: -right.x * 0.32 + forward.x * 0.05, y: -right.y * 0.32 + forward.y * 0.05, z: 1.65 }, { x: -right.x * 0.12 + forward.x * 0.67, y: -right.y * 0.12 + forward.y * 0.67, z: 1.36 }, random);
    this.addLimb(points, unit.pos, { x: forward.x * 0.42, y: forward.y * 0.42, z: 1.4 }, { x: forward.x * (unit.weapon === "rifle" ? 1.35 : 1.08), y: forward.y * (unit.weapon === "rifle" ? 1.35 : 1.08), z: 1.37 }, random, 16);

    if (unit.role === "MEDIC" || unit.role === "ENGINEER") {
      for (let i = 0; i < 16; i += 1) {
        points.push({
          x: unit.pos.x - forward.x * (0.28 + random() * 0.26) + right.x * (random() - 0.5) * 0.7,
          y: unit.pos.y - forward.y * (0.28 + random() * 0.26) + right.y * (random() - 0.5) * 0.7,
          z: 1.05 + random() * 0.75,
          alpha: 0.45 + random() * 0.4,
        });
      }
    }

    if (unit.state === "holding") {
      const coneLength = unit.weapon === "rifle" ? 7.5 : 5.8;
      const spread = 0.42;
      const cone = [
        transform.toScreen(unit.pos, 0.03),
        transform.toScreen({ x: unit.pos.x + Math.cos(unit.facing - spread) * coneLength, y: unit.pos.y + Math.sin(unit.facing - spread) * coneLength }, 0.03),
        transform.toScreen({ x: unit.pos.x + Math.cos(unit.facing + spread) * coneLength, y: unit.pos.y + Math.sin(unit.facing + spread) * coneLength }, 0.03),
      ];
      ctx.save(); ctx.fillStyle = "rgba(60,215,245,.055)"; ctx.strokeStyle = "rgba(75,226,252,.25)"; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(cone[0].x, cone[0].y); ctx.lineTo(cone[1].x, cone[1].y); ctx.lineTo(cone[2].x, cone[2].y); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }

    const ground = transform.toScreen(unit.pos);
    ctx.save(); ctx.strokeStyle = unit.selected ? "rgba(85,236,255,.9)" : "rgba(85,220,245,.34)";
    ctx.lineWidth = unit.selected ? 1.6 : 0.9; ctx.setLineDash(unit.selected ? [4, 4] : []);
    ctx.beginPath(); ctx.ellipse(ground.x, ground.y, transform.tileW * 0.52, transform.tileH * 0.52, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    const hip = transform.toScreen(unit.pos, 1.08);
    const chest = transform.toScreen({ x: unit.pos.x + forward.x * 0.04, y: unit.pos.y + forward.y * 0.04 }, 1.56);
    const head = transform.toScreen({ x: unit.pos.x + forward.x * 0.08, y: unit.pos.y + forward.y * 0.08 }, 1.98);
    const leftFoot = transform.toScreen({ x: unit.pos.x + right.x * 0.3 + forward.x * gait, y: unit.pos.y + right.y * 0.3 + forward.y * gait }, 0.05);
    const rightFoot = transform.toScreen({ x: unit.pos.x - right.x * 0.3 - forward.x * gait, y: unit.pos.y - right.y * 0.3 - forward.y * gait }, 0.05);
    const weaponEnd = transform.toScreen({ x: unit.pos.x + forward.x * (unit.weapon === "rifle" ? 1.35 : 1.08), y: unit.pos.y + forward.y * (unit.weapon === "rifle" ? 1.35 : 1.08) }, 1.37);
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = unit.state === "down" ? "rgba(239,91,76,.55)" : "rgba(114,235,255,.5)";
    ctx.shadowColor = unit.color; ctx.shadowBlur = 5; ctx.lineWidth = 1.05; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(head.x, head.y); ctx.lineTo(chest.x, chest.y); ctx.lineTo(hip.x, hip.y); ctx.lineTo(leftFoot.x, leftFoot.y);
    ctx.moveTo(hip.x, hip.y); ctx.lineTo(rightFoot.x, rightFoot.y); ctx.moveTo(chest.x, chest.y); ctx.lineTo(weaponEnd.x, weaponEnd.y); ctx.stroke(); ctx.restore();
    this.drawCloud(ctx, transform, points, unit.state === "down" ? "#ef5b4c" : unit.color, 8);

    if (unit.shotFlash > 0) {
      const muzzle = transform.toScreen({ x: unit.pos.x + forward.x * 1.4, y: unit.pos.y + forward.y * 1.4 }, 1.37);
      ctx.save(); ctx.fillStyle = `rgba(255,234,160,${unit.shotFlash})`; ctx.shadowColor = "#fff0a8"; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(muzzle.x, muzzle.y, 2 + unit.shotFlash * 3, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }

    const label = transform.toScreen(unit.pos, 2.45);
    ctx.save(); ctx.font = `700 ${Math.max(9, transform.tileW * 0.48)}px monospace`; ctx.textAlign = "center";
    ctx.fillStyle = "rgba(3,9,13,.88)"; ctx.fillRect(label.x - transform.tileW * 0.68, label.y - 12, transform.tileW * 1.36, 16);
    ctx.fillStyle = unit.color; ctx.fillText(`${unit.id} ${unit.name}`, label.x, label.y); ctx.restore();

    if (unit.state === "collecting") {
      const marker = transform.toScreen(unit.pos, 2.85);
      ctx.save(); ctx.strokeStyle = "#ffc04b"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(marker.x, marker.y, 5 + Math.sin(state.elapsed * 3) * 1.2, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
  }

  private addLimb(points: Point3[], origin: Vec2, start: Point3, end: Point3, random: () => number, count = 10): void {
    for (let i = 0; i < count; i += 1) {
      const t = i / Math.max(1, count - 1);
      const jitter = (random() - 0.5) * 0.07;
      points.push({
        x: origin.x + start.x + (end.x - start.x) * t + jitter,
        y: origin.y + start.y + (end.y - start.y) * t + jitter,
        z: start.z + (end.z - start.z) * t + jitter,
        alpha: 0.5 + random() * 0.5,
        size: 0.8 + random() * 0.9,
      });
    }
  }

  private drawContacts(ctx: CanvasRenderingContext2D, state: SimulationState, transform: IsoTransform): void {
    const sorted = [...state.contacts].sort((a, b) => a.pos.x + a.pos.y - (b.pos.x + b.pos.y));
    for (const contact of sorted) this.drawContact(ctx, contact, state, transform);
  }

  private drawContact(ctx: CanvasRenderingContext2D, contact: Contact, state: SimulationState, transform: IsoTransform): void {
    const forward = { x: Math.cos(contact.facing), y: Math.sin(contact.facing) };
    const right = { x: -forward.y, y: forward.x };
    const random = mulberry32(17000 + contact.id * 83);
    const points: Point3[] = [];
    const fragmentation = clamp(contact.confidence, 0.35, 1);
    for (let i = 0; i < 55; i += 1) {
      if (random() > fragmentation) continue;
      const lurch = Math.sin(contact.phase) * 0.18;
      points.push({
        x: contact.pos.x + forward.x * ((random() - 0.55) * 0.48 + lurch) + right.x * (random() - 0.5) * 0.58,
        y: contact.pos.y + forward.y * ((random() - 0.55) * 0.48 + lurch) + right.y * (random() - 0.5) * 0.58,
        z: 0.45 + random() * 1.25,
        alpha: 0.25 + random() * 0.58,
        size: 0.7 + random() * 1.4,
      });
    }
    this.addLimb(points, contact.pos, { x: right.x * 0.27, y: right.y * 0.27, z: 1.2 }, { x: right.x * 0.48 + forward.x * 0.72, y: right.y * 0.48 + forward.y * 0.72, z: 0.85 }, random, 8);
    this.addLimb(points, contact.pos, { x: -right.x * 0.27, y: -right.y * 0.27, z: 1.2 }, { x: -right.x * 0.52 + forward.x * 0.65, y: -right.y * 0.52 + forward.y * 0.65, z: 0.75 }, random, 8);
    const flicker = 0.68 + Math.sin(state.elapsed * 8 + contact.id) * 0.18;
    ctx.save(); ctx.globalAlpha = flicker;
    this.drawCloud(ctx, transform, points, contact.hitFlash > 0 ? "#ffd8a0" : "#ed3f36", 5);
    ctx.restore();
  }

  private drawCloud(ctx: CanvasRenderingContext2D, transform: IsoTransform, points: Point3[], color: string, blur: number): void {
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = blur;
    for (const cloudPoint of points) {
      const point = transform.toScreen(cloudPoint, cloudPoint.z);
      ctx.globalAlpha = cloudPoint.alpha ?? 0.65;
      const size = cloudPoint.size ?? 1;
      ctx.fillRect(point.x, point.y, size, size);
    }
    ctx.restore();
  }

  private drawScan(ctx: CanvasRenderingContext2D, width: number, height: number, state: SimulationState): void {
    const center = { x: width * 0.54, y: height * 0.52 };
    const radius = Math.hypot(width, height) * 0.65;
    const start = state.scanAngle - 0.08;
    const end = state.scanAngle + 0.02;
    ctx.save();
    const gradient = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, radius);
    gradient.addColorStop(0, "rgba(83,230,255,.08)");
    gradient.addColorStop(1, "rgba(83,230,255,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath(); ctx.moveTo(center.x, center.y);
    ctx.arc(center.x, center.y, radius, start, end); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(100,235,255,.22)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(center.x, center.y); ctx.lineTo(center.x + Math.cos(end) * radius, center.y + Math.sin(end) * radius); ctx.stroke();
    ctx.restore();

    ctx.save(); ctx.fillStyle = "rgba(120,210,230,.018)";
    for (let y = 1; y < height; y += 5) ctx.fillRect(0, y, width, 1);
    ctx.restore();
  }
}
