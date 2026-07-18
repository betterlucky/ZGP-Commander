import { describe, expect, it } from "vitest";
import { Simulation } from "../sim";
import { GpuLidarRenderer } from "./gpu-lidar";

interface FakeGpuCalls {
  bufferSubData: unknown[][];
  deleteBuffer: number;
  deleteProgram: number;
  deleteVertexArray: number;
  drawArrays: number;
  getUniformLocation: number;
  loseContext: number;
  vertexAttribPointer: number;
}

const makeFakeCanvas = (): { canvas: HTMLCanvasElement; calls: FakeGpuCalls } => {
  const calls: FakeGpuCalls = {
    bufferSubData: [],
    deleteBuffer: 0,
    deleteProgram: 0,
    deleteVertexArray: 0,
    drawArrays: 0,
    getUniformLocation: 0,
    loseContext: 0,
    vertexAttribPointer: 0,
  };
  const gl = {
    ARRAY_BUFFER: 1,
    BLEND: 2,
    COLOR_BUFFER_BIT: 4,
    COMPILE_STATUS: 5,
    DEPTH_TEST: 6,
    DYNAMIC_DRAW: 7,
    FLOAT: 8,
    FRAGMENT_SHADER: 9,
    LINK_STATUS: 10,
    ONE: 11,
    POINTS: 12,
    SRC_ALPHA: 13,
    STATIC_DRAW: 14,
    VERTEX_SHADER: 15,
    attachShader: () => undefined,
    bindBuffer: () => undefined,
    bindVertexArray: () => undefined,
    blendFunc: () => undefined,
    bufferData: () => undefined,
    bufferSubData: (...args: unknown[]) => calls.bufferSubData.push(args),
    clear: () => undefined,
    clearColor: () => undefined,
    compileShader: () => undefined,
    createBuffer: () => ({}),
    createProgram: () => ({}),
    createShader: () => ({}),
    createVertexArray: () => ({}),
    deleteBuffer: () => { calls.deleteBuffer += 1; },
    deleteProgram: () => { calls.deleteProgram += 1; },
    deleteShader: () => undefined,
    deleteVertexArray: () => { calls.deleteVertexArray += 1; },
    disable: () => undefined,
    drawArrays: () => { calls.drawArrays += 1; },
    enable: () => undefined,
    enableVertexAttribArray: () => undefined,
    getExtension: (name: string) => name === "WEBGL_lose_context" ? { loseContext: () => { calls.loseContext += 1; } } : null,
    getProgramInfoLog: () => "",
    getProgramParameter: () => true,
    getShaderInfoLog: () => "",
    getShaderParameter: () => true,
    getUniformLocation: () => { calls.getUniformLocation += 1; return {}; },
    linkProgram: () => undefined,
    shaderSource: () => undefined,
    uniform1f: () => undefined,
    uniform2f: () => undefined,
    useProgram: () => undefined,
    vertexAttribPointer: () => { calls.vertexAttribPointer += 1; },
    viewport: () => undefined,
  } as unknown as WebGL2RenderingContext;
  const canvas = { getContext: () => gl } as unknown as HTMLCanvasElement;
  return { canvas, calls };
};

describe("GpuLidarRenderer", () => {
  it("caches immutable WebGL state and reuses the transform", () => {
    const simulation = new Simulation();
    const { canvas, calls } = makeFakeCanvas();
    const renderer = new GpuLidarRenderer(canvas, simulation.state.map);
    const camera = { zoom: 1, panX: 0, panY: 0 };

    renderer.render(1280, 720, 1, simulation.state, camera);
    const firstTransform = renderer.transform;
    renderer.render(1280, 720, 1, simulation.state, camera);

    expect(renderer.transform).toBe(firstTransform);
    expect(calls.getUniformLocation).toBe(5);
    expect(calls.vertexAttribPointer).toBe(6);
    expect(calls.bufferSubData).toHaveLength(2);
    expect(calls.bufferSubData[0]).toHaveLength(5);

    camera.panX = 20;
    renderer.render(1280, 720, 1, simulation.state, camera);
    expect(renderer.transform).not.toBe(firstTransform);
  });

  it("prunes departed contact models and releases GPU resources exactly once", () => {
    const simulation = new Simulation();
    const { canvas, calls } = makeFakeCanvas();
    const renderer = new GpuLidarRenderer(canvas, simulation.state.map);
    const camera = { zoom: 1, panX: 0, panY: 0 };
    const internals = renderer as unknown as { liveContactModels: Map<number, unknown> };

    renderer.render(1280, 720, 1, simulation.state, camera);
    expect(internals.liveContactModels.size).toBe(simulation.state.contacts.length);

    simulation.state.contacts = simulation.state.contacts.slice(0, 1);
    renderer.render(1280, 720, 1, simulation.state, camera);
    expect(internals.liveContactModels.size).toBe(1);

    const drawCallsBeforeDispose = calls.drawArrays;
    renderer.dispose();
    renderer.dispose();
    renderer.render(1280, 720, 1, simulation.state, camera);

    expect(internals.liveContactModels.size).toBe(0);
    expect(calls.deleteBuffer).toBe(2);
    expect(calls.deleteVertexArray).toBe(2);
    expect(calls.deleteProgram).toBe(1);
    expect(calls.loseContext).toBe(1);
    expect(calls.drawArrays).toBe(drawCallsBeforeDispose);
  });
});
