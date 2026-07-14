import { hashNoise, mulberry32 } from "../math";
import type { Camera, FacilityMap, Prop, SimulationState, Unit, Vec2 } from "../types";
import { makeIsoTransform, type IsoTransform } from "./shared";

const STRIDE_FLOATS = 8;
const QUADRANTS = 2;
const CONTACT_COUNT = 100;

interface LocalPoint {
  x: number;
  y: number;
  z: number;
  alpha: number;
  size: number;
}

interface BenchmarkContact {
  origin: Vec2;
  angle: number;
  phase: number;
  speed: number;
  confidence: number;
  points: LocalPoint[];
}

export interface GpuLidarStats {
  fps: number;
  staticPoints: number;
  dynamicPoints: number;
  drawCalls: number;
  contacts: number;
}

export interface GpuLidarOptions {
  benchmarkContacts?: boolean;
}

const vertexShaderSource = `#version 300 es
precision highp float;
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec4 a_color;
layout(location = 2) in float a_size;
uniform vec2 u_resolution;
uniform vec2 u_origin;
uniform vec2 u_tile;
uniform float u_pixelRatio;
uniform float u_time;
out vec4 v_color;
out vec3 v_world;
void main() {
  vec2 pixel = u_origin + vec2(
    (a_position.x - a_position.y) * u_tile.x * 0.5,
    (a_position.x + a_position.y) * u_tile.y * 0.5 - a_position.z * u_tile.y
  );
  vec2 clip = vec2(pixel.x / u_resolution.x * 2.0 - 1.0, 1.0 - pixel.y / u_resolution.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = max(1.0, a_size * u_pixelRatio);
  float scan = 0.82 + 0.18 * sin((a_position.x + a_position.y) * 0.17 - u_time * 2.1);
  v_color = vec4(a_color.rgb * scan, a_color.a);
  v_world = a_position;
}`;

const fragmentShaderSource = `#version 300 es
precision highp float;
in vec4 v_color;
in vec3 v_world;
uniform float u_time;
out vec4 outColor;
void main() {
  vec2 delta = gl_PointCoord - vec2(0.5);
  float radius = length(delta);
  if (radius > 0.5) discard;
  float core = smoothstep(0.5, 0.04, radius);
  float sweep = smoothstep(0.955, 1.0, sin((v_world.x - v_world.y) * 0.08 - u_time * 0.9));
  float alpha = v_color.a * (0.32 + core * 0.8 + sweep * 0.5);
  outColor = vec4(v_color.rgb * (0.72 + core * 0.65 + sweep * 0.45), alpha);
}`;

const compileShader = (gl: WebGL2RenderingContext, type: number, source: string): WebGLShader => {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to allocate WebGL shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) ?? "Unknown shader error";
    gl.deleteShader(shader);
    throw new Error(info);
  }
  return shader;
};

const createProgram = (gl: WebGL2RenderingContext): WebGLProgram => {
  const program = gl.createProgram();
  if (!program) throw new Error("Unable to allocate WebGL program");
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "Unable to link WebGL program");
  return program;
};

const pushPoint = (
  target: number[],
  x: number,
  y: number,
  z: number,
  color: readonly [number, number, number],
  alpha: number,
  size: number,
): void => {
  target.push(x, y, z, color[0], color[1], color[2], alpha, size);
};

const propHeight: Record<Prop["kind"], number> = {
  desk: 0.72,
  bed: 0.48,
  shelf: 1.42,
  chair: 0.62,
  crate: 0.72,
  pallet: 0.38,
  terminal: 1.08,
};

export class GpuLidarRenderer {
  public readonly available: boolean;
  public readonly stats: GpuLidarStats = { fps: 0, staticPoints: 0, dynamicPoints: 0, drawCalls: 0, contacts: 0 };
  public transform: IsoTransform | null = null;
  private readonly gl: WebGL2RenderingContext | null;
  private readonly program: WebGLProgram | null;
  private readonly staticBuffer: WebGLBuffer | null;
  private readonly dynamicBuffer: WebGLBuffer | null;
  private readonly map: FacilityMap;
  private readonly virtualMap: FacilityMap;
  private readonly staticData: Float32Array;
  private readonly contacts: BenchmarkContact[];
  private readonly benchmarkMode: boolean;
  private readonly sectorCount: number;
  private readonly unitModels = new Map<number, LocalPoint[]>();
  private readonly liveContactModels = new Map<number, LocalPoint[]>();
  private dynamicData = new Float32Array(CONTACT_COUNT * 180 * STRIDE_FLOATS);
  private dynamicPointCount = 0;
  private lastFrameTime = 0;
  private smoothedFps = 60;
  private readonly displayOffset: Vec2;

  constructor(canvas: HTMLCanvasElement, map: FacilityMap, options: GpuLidarOptions = {}) {
    this.map = map;
    this.benchmarkMode = options.benchmarkContacts ?? false;
    this.sectorCount = this.benchmarkMode ? QUADRANTS : 1;
    this.virtualMap = { ...map, width: map.width * this.sectorCount, height: map.height * this.sectorCount };
    this.displayOffset = this.benchmarkMode ? { x: map.width, y: 0 } : { x: 0, y: 0 };
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      desynchronized: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
    this.gl = gl;
    if (!gl) {
      this.available = false;
      this.program = null;
      this.staticBuffer = null;
      this.dynamicBuffer = null;
      this.staticData = new Float32Array();
      this.contacts = [];
      return;
    }
    this.available = true;
    this.program = createProgram(gl);
    this.staticBuffer = gl.createBuffer();
    this.dynamicBuffer = gl.createBuffer();
    if (!this.staticBuffer || !this.dynamicBuffer) throw new Error("Unable to allocate point buffers");
    this.staticData = this.buildStaticPointCloud();
    this.contacts = this.benchmarkMode ? this.buildContacts() : [];
    this.stats.staticPoints = this.staticData.length / STRIDE_FLOATS;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.staticBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.staticData, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.dynamicData.byteLength, gl.DYNAMIC_DRAW);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0.002, 0.012, 0.018, 1);
  }

  public toSimulationWorld(point: Vec2): Vec2 {
    if (!this.benchmarkMode) return { x: point.x, y: point.y };
    const wrapped = {
      x: ((point.x - this.displayOffset.x) % this.map.width + this.map.width) % this.map.width,
      y: ((point.y - this.displayOffset.y) % this.map.height + this.map.height) % this.map.height,
    };
    return wrapped;
  }

  public toDisplayPoint(point: Vec2): Vec2 {
    return this.offsetPoint(point);
  }

  public previewTransform(width: number, height: number, camera: Camera): IsoTransform {
    return makeIsoTransform(width, height, this.virtualMap, camera);
  }

  public render(width: number, height: number, pixelRatio: number, state: SimulationState, camera: Camera): void {
    const gl = this.gl;
    const program = this.program;
    if (!gl || !program || !this.staticBuffer || !this.dynamicBuffer) return;
    const time = state.elapsed;
    const transform = makeIsoTransform(width, height, this.virtualMap, camera);
    this.transform = transform;
    this.buildDynamicPointCloud(state, time);

    const now = performance.now();
    if (this.lastFrameTime > 0) {
      const instantFps = 1000 / Math.max(1, now - this.lastFrameTime);
      this.smoothedFps = this.smoothedFps * 0.92 + instantFps * 0.08;
    }
    this.lastFrameTime = now;
    this.stats.fps = this.smoothedFps;
    this.stats.dynamicPoints = this.dynamicPointCount;
    this.stats.drawCalls = 2;

    const physicalWidth = Math.round(width * pixelRatio);
    const physicalHeight = Math.round(height * pixelRatio);
    gl.viewport(0, 0, physicalWidth, physicalHeight);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.uniform2f(gl.getUniformLocation(program, "u_resolution"), physicalWidth, physicalHeight);
    gl.uniform2f(gl.getUniformLocation(program, "u_origin"), transform.originX * pixelRatio, transform.originY * pixelRatio);
    gl.uniform2f(gl.getUniformLocation(program, "u_tile"), transform.tileW * pixelRatio, transform.tileH * pixelRatio);
    gl.uniform1f(gl.getUniformLocation(program, "u_pixelRatio"), pixelRatio);
    gl.uniform1f(gl.getUniformLocation(program, "u_time"), time);

    this.bindAttributes(this.staticBuffer);
    gl.drawArrays(gl.POINTS, 0, this.stats.staticPoints);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.dynamicData.subarray(0, this.dynamicPointCount * STRIDE_FLOATS));
    this.bindAttributes(this.dynamicBuffer);
    gl.drawArrays(gl.POINTS, 0, this.dynamicPointCount);
  }

  public renderOverlay(ctx: CanvasRenderingContext2D, width: number, height: number, state: SimulationState): void {
    const transform = this.transform;
    if (!transform) return;
    ctx.clearRect(0, 0, width, height);
    this.drawSectorLabels(ctx, transform);
    this.drawOrders(ctx, state, transform);
    this.drawObjectives(ctx, state, transform);
    const labels: Array<{ left: number; top: number; right: number; bottom: number }> = [];
    const units = [...state.units].sort((a, b) => Number(a.selected) - Number(b.selected));
    for (const unit of units) this.drawUnitOverlay(ctx, unit, transform, labels);
    this.drawScanOverlay(ctx, width, height, state);
  }

  private bindAttributes(buffer: WebGLBuffer): void {
    const gl = this.gl!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const stride = STRIDE_FLOATS * Float32Array.BYTES_PER_ELEMENT;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 7 * Float32Array.BYTES_PER_ELEMENT);
  }

  private buildStaticPointCloud(): Float32Array {
    const output: number[] = [];
    const floorColor: readonly [number, number, number] = [0.24, 0.52, 0.62];
    const wallColor: readonly [number, number, number] = [0.28, 0.66, 0.76];
    const walkable = [...this.map.walkable].map((cell) => cell.split(",").map(Number) as [number, number]);
    for (let quadrantY = 0; quadrantY < this.sectorCount; quadrantY += 1) {
      for (let quadrantX = 0; quadrantX < this.sectorCount; quadrantX += 1) {
        const offsetX = quadrantX * this.map.width;
        const offsetY = quadrantY * this.map.height;
        const sectorSeed = quadrantY * QUADRANTS + quadrantX;
        for (const [cellX, cellY] of walkable) {
          for (let sample = 0; sample < 10; sample += 1) {
            const x = offsetX + cellX + 0.04 + hashNoise(cellX * 17 + sample, cellY * 11, sectorSeed + 3) * 0.92;
            const y = offsetY + cellY + 0.04 + hashNoise(cellX * 7, cellY * 19 + sample, sectorSeed + 9) * 0.92;
            const variation = hashNoise(cellX + sample, cellY, sectorSeed + 21);
            pushPoint(output, x, y, variation * 0.025, floorColor, 0.13 + variation * 0.22, 0.72 + variation * 0.9);
          }
        }
        for (let wallIndex = 0; wallIndex < this.map.walls.length; wallIndex += 1) {
          const wall = this.map.walls[wallIndex];
          if (wall.door) continue;
          for (let sample = 0; sample <= 7; sample += 1) {
            const t = sample / 7;
            const x = offsetX + wall.a.x + (wall.b.x - wall.a.x) * t;
            const y = offsetY + wall.a.y + (wall.b.y - wall.a.y) * t;
            for (let layer = 0; layer < 6; layer += 1) {
              const noise = hashNoise(wallIndex + sample, layer, sectorSeed + 4);
              pushPoint(output, x, y, layer * 0.27 + noise * 0.055, wallColor, 0.17 + noise * 0.3, 0.68 + noise * 0.82);
            }
          }
        }
        for (let propIndex = 0; propIndex < this.map.props.length; propIndex += 1) {
          const prop = this.map.props[propIndex];
          const random = mulberry32(8100 + propIndex * 89 + sectorSeed * 301);
          const height = propHeight[prop.kind];
          const currentPropColor: readonly [number, number, number] = prop.blocksVision ? [0.38, 0.85, 0.9] : prop.blocksMovement ? [0.9, 0.62, 0.18] : [0.22, 0.46, 0.52];
          const sampleCount = Math.max(64, Math.ceil((prop.w + prop.h) * 24));
          for (let sample = 0; sample < sampleCount; sample += 1) {
            const edge = Math.floor(random() * 4);
            let localX = (random() - 0.5) * prop.w;
            let localY = (random() - 0.5) * prop.h;
            if (edge === 0) localX = -prop.w / 2;
            else if (edge === 1) localX = prop.w / 2;
            else if (edge === 2) localY = -prop.h / 2;
            else localY = prop.h / 2;
            const rotation = prop.rotation ?? 0;
            const cos = Math.cos(rotation);
            const sin = Math.sin(rotation);
            const x = offsetX + prop.x + prop.w / 2 + localX * cos - localY * sin;
            const y = offsetY + prop.y + prop.h / 2 + localX * sin + localY * cos;
            const z = random() > 0.54 ? height : random() * height;
            const emphasis = prop.blocksMovement ? 1 : 0.55;
            pushPoint(output, x, y, z, currentPropColor, (0.2 + random() * 0.34) * emphasis, 0.8 + random() * 0.8);
          }
        }
      }
    }
    return new Float32Array(output);
  }

  private buildContacts(): BenchmarkContact[] {
    const random = mulberry32(740193);
    const cells = [...this.map.walkable].map((cell) => cell.split(",").map(Number) as [number, number]);
    const contacts: BenchmarkContact[] = [];
    for (let index = 0; index < CONTACT_COUNT; index += 1) {
      const cell = cells[Math.floor(random() * cells.length)];
      const quadrantX = index % 4 === 0 ? 1 : Math.floor(random() * this.sectorCount);
      const quadrantY = Math.floor(random() * this.sectorCount);
      contacts.push({
        origin: {
          x: cell[0] + 0.5 + quadrantX * this.map.width,
          y: cell[1] + 0.5 + quadrantY * this.map.height,
        },
        angle: random() * Math.PI * 2,
        phase: random() * Math.PI * 2,
        speed: 0.45 + random() * 0.9,
        confidence: 0.45 + random() * 0.55,
        points: this.buildHumanoidPoints(12000 + index * 71, 0.34 + random() * 0.12, 0.95 + random() * 0.18, 0.72 + random() * 0.34, false),
      });
    }
    return contacts;
  }

  private getUnitModel(unit: Unit): LocalPoint[] {
    const existing = this.unitModels.get(unit.id);
    if (existing) return existing;
    const width = unit.role === "SCAVENGER" || unit.role === "ENGINEER" ? 0.47 : 0.38;
    const weaponLength = unit.weapon === "rifle" ? 1.45 : unit.weapon === "shotgun" ? 1.18 : 1.02;
    const points = this.buildHumanoidPoints(22000 + unit.id * 113, width, 1.02, weaponLength, true);
    this.unitModels.set(unit.id, points);
    return points;
  }

  private getLiveContactModel(contactId: number): LocalPoint[] {
    const existing = this.liveContactModels.get(contactId);
    if (existing) return existing;
    const points = this.buildHumanoidPoints(12000 + contactId * 71, 0.38, 1.02, 0.86, false);
    this.liveContactModels.set(contactId, points);
    return points;
  }

  private buildHumanoidPoints(seed: number, width: number, heightScale: number, weaponLength: number, equipped: boolean): LocalPoint[] {
    const random = mulberry32(seed);
    const points: LocalPoint[] = [];
    for (let index = 0; index < 54; index += 1) {
      const angle = random() * Math.PI * 2;
      points.push({
        x: (random() - 0.5) * 0.48,
        y: Math.cos(angle) * Math.sqrt(random()) * width,
        z: (0.92 + random() * 0.78) * heightScale,
        alpha: 0.45 + random() * 0.55,
        size: 0.9 + random() * 1.4,
      });
    }
    for (let index = 0; index < 22; index += 1) {
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random()) * 0.24;
      points.push({ x: 0.08 + Math.cos(angle) * radius, y: Math.sin(angle) * radius, z: 1.94 * heightScale + (random() - 0.5) * 0.34, alpha: 0.65 + random() * 0.35, size: 1 + random() * 1.3 });
    }
    this.addLocalLimb(points, { x: -0.12, y: width * 0.55, z: 1.05 }, { x: -0.55, y: width * 0.78, z: 0.06 }, random, 13);
    this.addLocalLimb(points, { x: -0.12, y: -width * 0.55, z: 1.05 }, { x: -0.48, y: -width * 0.78, z: 0.06 }, random, 13);
    this.addLocalLimb(points, { x: 0.08, y: width * 0.78, z: 1.58 }, { x: 0.68, y: width * 0.42, z: 1.36 }, random, 12);
    this.addLocalLimb(points, { x: 0.08, y: -width * 0.78, z: 1.58 }, { x: 0.62, y: -width * 0.32, z: 1.38 }, random, 12);
    this.addLocalLimb(points, { x: 0.36, y: 0, z: 1.38 }, { x: weaponLength, y: 0, z: 1.37 }, random, equipped ? 24 : 14);
    if (equipped) {
      for (let index = 0; index < 28; index += 1) {
        points.push({ x: -0.26 - random() * 0.3, y: (random() - 0.5) * width * 1.7, z: 1.0 + random() * 0.72, alpha: 0.35 + random() * 0.45, size: 0.8 + random() });
      }
    }
    return points;
  }

  private addLocalLimb(
    points: LocalPoint[],
    start: Pick<LocalPoint, "x" | "y" | "z">,
    end: Pick<LocalPoint, "x" | "y" | "z">,
    random: () => number,
    count: number,
  ): void {
    for (let index = 0; index < count; index += 1) {
      const t = index / Math.max(1, count - 1);
      points.push({
        x: start.x + (end.x - start.x) * t + (random() - 0.5) * 0.055,
        y: start.y + (end.y - start.y) * t + (random() - 0.5) * 0.055,
        z: start.z + (end.z - start.z) * t + (random() - 0.5) * 0.055,
        alpha: 0.48 + random() * 0.52,
        size: 0.85 + random() * 1.05,
      });
    }
  }

  private buildDynamicPointCloud(state: SimulationState, time: number): void {
    const contactPoints = this.benchmarkMode
      ? this.contacts.reduce((total, contact) => total + contact.points.length, 0)
      : state.contacts.reduce((total, contact) => total + this.getLiveContactModel(contact.id).length, 0);
    const requiredPoints = contactPoints + state.units.reduce((total, unit) => total + this.getUnitModel(unit).length, 0);
    if (this.dynamicData.length < requiredPoints * STRIDE_FLOATS) {
      this.dynamicData = new Float32Array(Math.ceil(requiredPoints * STRIDE_FLOATS * 1.2));
      if (this.gl && this.dynamicBuffer) {
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.dynamicBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, this.dynamicData.byteLength, this.gl.DYNAMIC_DRAW);
      }
    }
    let cursor = 0;
    const write = (x: number, y: number, z: number, r: number, g: number, b: number, alpha: number, size: number): void => {
      this.dynamicData[cursor++] = x; this.dynamicData[cursor++] = y; this.dynamicData[cursor++] = z;
      this.dynamicData[cursor++] = r; this.dynamicData[cursor++] = g; this.dynamicData[cursor++] = b;
      this.dynamicData[cursor++] = alpha; this.dynamicData[cursor++] = size;
    };

    if (this.benchmarkMode) {
      for (let index = 0; index < this.contacts.length; index += 1) {
        const contact = this.contacts[index];
        const travel = Math.sin(time * contact.speed + contact.phase) * 1.35;
        const sway = Math.cos(time * contact.speed * 0.73 + contact.phase) * 0.42;
        const cos = Math.cos(contact.angle);
        const sin = Math.sin(contact.angle);
        const originX = contact.origin.x + cos * travel - sin * sway;
        const originY = contact.origin.y + sin * travel + cos * sway;
        const flicker = 0.7 + Math.sin(time * 7 + index) * 0.18;
        for (const point of contact.points) {
          const x = originX + point.x * cos - point.y * sin;
          const y = originY + point.x * sin + point.y * cos;
          write(x, y, point.z + Math.sin(time * 3 + contact.phase) * 0.025, 1, 0.045, 0.018, Math.min(1, point.alpha * contact.confidence * (1.08 + flicker * 0.25)), point.size * 3.5);
        }
      }
      this.stats.contacts = this.contacts.length;
    } else {
      const activeContacts = state.contacts.filter((contact) => contact.alive || contact.hitFlash > 0);
      for (const contact of activeContacts) {
        const points = this.getLiveContactModel(contact.id);
        const cos = Math.cos(contact.facing);
        const sin = Math.sin(contact.facing);
        const originX = contact.pos.x + this.displayOffset.x;
        const originY = contact.pos.y + this.displayOffset.y;
        const fade = contact.alive ? 1 : Math.min(1, contact.hitFlash);
        const flash = Math.min(1, contact.hitFlash);
        for (const point of points) {
          const x = originX + point.x * cos - point.y * sin;
          const y = originY + point.x * sin + point.y * cos;
          write(x, y, point.z + Math.sin(time * 3 + contact.phase) * 0.025, 1, 0.045 + flash * 0.72, 0.018 + flash * 0.38, point.alpha * contact.confidence * fade, point.size * (3.35 + flash * 1.2));
        }
      }
      this.stats.contacts = activeContacts.filter((contact) => contact.alive).length;
    }

    for (const unit of state.units) {
      const points = this.getUnitModel(unit);
      const cos = Math.cos(unit.facing);
      const sin = Math.sin(unit.facing);
      const originX = unit.pos.x + this.displayOffset.x;
      const originY = unit.pos.y + this.displayOffset.y;
      const bob = unit.state === "moving" ? Math.sin(unit.phase * 2) * 0.035 : 0;
      for (const point of points) {
        const x = originX + point.x * cos - point.y * sin;
        const y = originY + point.x * sin + point.y * cos;
        write(x, y, point.z + bob, 0.46, 0.97, 1, Math.min(1, point.alpha * 1.28), point.size * 2.85);
      }
    }
    this.dynamicPointCount = cursor / STRIDE_FLOATS;
  }

  private offsetPoint(point: Vec2): Vec2 {
    return { x: point.x + this.displayOffset.x, y: point.y + this.displayOffset.y };
  }

  private drawSectorLabels(ctx: CanvasRenderingContext2D, transform: IsoTransform): void {
    if (this.sectorCount === 1) return;
    ctx.save(); ctx.font = `700 ${Math.max(8, transform.tileW * 0.75)}px monospace`; ctx.textAlign = "center";
    for (let y = 0; y < this.sectorCount; y += 1) {
      for (let x = 0; x < this.sectorCount; x += 1) {
        const center = transform.toScreen({ x: (x + 0.5) * this.map.width, y: (y + 0.5) * this.map.height }, 0.02);
        ctx.fillStyle = "rgba(104,188,210,.22)";
        ctx.fillText(`SECTOR ${String.fromCharCode(65 + y * QUADRANTS + x)}`, center.x, center.y);
      }
    }
    ctx.restore();
  }

  private drawOrders(ctx: CanvasRenderingContext2D, state: SimulationState, transform: IsoTransform): void {
    for (const unit of state.units) {
      if (!unit.selected || !unit.path.length) continue;
      const start = transform.toScreen(this.offsetPoint(unit.pos), 0.05);
      ctx.save(); ctx.strokeStyle = "rgba(84,228,255,.8)"; ctx.lineWidth = 1.2; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.moveTo(start.x, start.y);
      for (const waypoint of unit.path) {
        const screen = transform.toScreen(this.offsetPoint(waypoint), 0.05);
        ctx.lineTo(screen.x, screen.y);
      }
      ctx.stroke(); ctx.restore();
    }
  }

  private drawObjectives(ctx: CanvasRenderingContext2D, state: SimulationState, transform: IsoTransform): void {
    const extraction = transform.toScreen(this.offsetPoint(state.map.extraction), 0.03);
    ctx.save(); ctx.shadowBlur = 8; ctx.lineWidth = 1.2;
    for (const [index, site] of state.caches.entries()) {
      const cache = transform.toScreen(this.offsetPoint(site.pos), 0.3);
      ctx.strokeStyle = site.secured ? "rgba(102,165,155,.38)" : "rgba(255,187,61,.92)";
      ctx.shadowColor = site.secured ? "#5ba99b" : "#ffb83d";
      ctx.strokeRect(cache.x - 5, cache.y - 4, 10, 8);
      ctx.beginPath(); ctx.arc(cache.x, cache.y, 8 + (site.secured ? 0 : Math.sin(state.elapsed * 3)), 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = site.secured ? "rgba(110,175,165,.7)" : "#ffc15a";
      ctx.font = "700 8px monospace"; ctx.textAlign = "center"; ctx.fillText(`${index + 1}`, cache.x, cache.y - 11);
    }
    const breach = transform.toScreen(this.offsetPoint(state.map.breach.pos), 0.08);
    ctx.strokeStyle = state.breachOpen ? "rgba(77,238,207,.85)" : "rgba(255,105,78,.95)";
    ctx.shadowColor = state.breachOpen ? "#4deecf" : "#ff5a45";
    ctx.strokeRect(breach.x - 9, breach.y - 5, 18, 10);
    ctx.fillStyle = state.breachOpen ? "#4deecf" : "#ff7b64"; ctx.font = "700 8px monospace";
    ctx.fillText(state.breachOpen ? "OPEN" : "F BREACH", breach.x, breach.y - 9);
    ctx.strokeStyle = "rgba(77,238,207,.85)"; ctx.shadowColor = "#4deecf";
    ctx.beginPath(); ctx.ellipse(extraction.x, extraction.y, 13, 7, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }

  private drawUnitOverlay(ctx: CanvasRenderingContext2D, unit: Unit, transform: IsoTransform, labels: Array<{ left: number; top: number; right: number; bottom: number }>): void {
    const point = transform.toScreen(this.offsetPoint(unit.pos), 2.45);
    const ground = transform.toScreen(this.offsetPoint(unit.pos), 0.02);
    ctx.save();
    ctx.strokeStyle = unit.selected ? "rgba(102,234,255,.92)" : "rgba(102,225,245,.38)";
    ctx.lineWidth = unit.selected ? 1.4 : 0.8;
    ctx.setLineDash(unit.selected ? [4, 3] : []);
    ctx.beginPath(); ctx.ellipse(ground.x, ground.y, 8, 4, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    const label = `${unit.id}  ${unit.name}  ·  ${unit.role}`;
    ctx.font = "700 9px monospace";
    const width = Math.max(82, ctx.measureText(label).width + 12);
    let labelY = point.y;
    let bounds = { left: point.x - width / 2, top: labelY - 11, right: point.x + width / 2, bottom: labelY + 4 };
    while (labels.some((other) => bounds.left < other.right && bounds.right > other.left && bounds.top < other.bottom && bounds.bottom > other.top)) {
      labelY -= 17;
      bounds = { ...bounds, top: labelY - 11, bottom: labelY + 4 };
    }
    labels.push(bounds);
    ctx.fillStyle = "rgba(2,8,12,.92)"; ctx.fillRect(bounds.left, bounds.top, width, 15);
    ctx.strokeStyle = unit.selected ? "rgba(110,239,255,.9)" : "rgba(95,225,250,.36)"; ctx.strokeRect(bounds.left, bounds.top, width, 15);
    ctx.fillStyle = "#83ecff"; ctx.textAlign = "center"; ctx.fillText(label, point.x, labelY);
    if (unit.shotFlash > 0) {
      const muzzle = transform.toScreen(this.offsetPoint({ x: unit.pos.x + Math.cos(unit.facing) * 1.35, y: unit.pos.y + Math.sin(unit.facing) * 1.35 }), 1.35);
      ctx.fillStyle = `rgba(255,235,165,${unit.shotFlash})`; ctx.shadowColor = "#fff0a8"; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(muzzle.x, muzzle.y, 3 + unit.shotFlash * 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  private drawScanOverlay(ctx: CanvasRenderingContext2D, width: number, height: number, state: SimulationState): void {
    const x = ((state.signalPulse * 54) % (width + 180)) - 90;
    const gradient = ctx.createLinearGradient(x - 75, 0, x + 75, 0);
    gradient.addColorStop(0, "rgba(80,225,255,0)");
    gradient.addColorStop(0.5, "rgba(80,225,255,.035)");
    gradient.addColorStop(1, "rgba(80,225,255,0)");
    ctx.fillStyle = gradient; ctx.fillRect(x - 75, 0, 150, height);
  }
}
