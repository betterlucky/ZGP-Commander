import "./style.css";
import { formatTime } from "./math";
import { GpuLidarRenderer } from "./renderers/gpu-lidar";
import { LidarRenderer } from "./renderers/lidar";
import { Simulation } from "./sim";
import type { Camera, Unit } from "./types";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App root missing");

app.innerHTML = `
  <main class="shell">
    <header class="topbar">
      <div class="brand-block">
        <span class="brand">HOLDFAST</span>
        <span class="divider">//</span>
        <span class="system-name" id="system-name">GHOSTLINK</span>
      </div>
      <div class="mission-block">
        <span class="eyebrow">ACTIVE ENGAGEMENT</span>
        <strong>CLINIC SUPPLY RUN</strong>
      </div>
      <div class="threat-block">
        <span>CONTACT RISING</span>
        <div class="threat-track"><i id="threat-fill"></i></div>
        <b id="contact-count">15</b>
      </div>
      <div class="status-block">
        <span class="signal-dot"></span>
        <span>LINK <b id="signal-value">92%</b></span>
        <button class="pause-button" id="pause-button" type="button">Ⅱ PAUSE</button>
      </div>
    </header>

    <section class="workarea">
      <aside class="left-panel panel">
        <section class="panel-section objective-section">
          <div class="section-title"><span>OBJECTIVES</span><small>01 / 02</small></div>
          <div class="objective active">
            <span class="objective-icon">◇</span>
            <div><strong>MEDICAL CACHE <b id="cache-fraction">0%</b></strong><small id="cache-copy">Locate and secure supplies</small></div>
          </div>
          <div class="progress"><i id="cache-progress"></i></div>
          <div class="objective ready">
            <span class="objective-icon">⌂</span>
            <div><strong>EXTRACTION READY</strong><small>Ambulance bay · west access</small></div>
          </div>
        </section>

        <section class="panel-section order-section">
          <div class="section-title"><span>HIGH LEVEL ORDERS</span><small id="selected-count">1 UNIT</small></div>
          <button class="order-button primary" id="move-order" type="button"><kbd>M</kbd><span><b>MOVE / RETASK</b><small>Click the tactical feed</small></span></button>
          <button class="order-button" id="hold-order" type="button"><kbd>H</kbd><span><b>HOLD POSITION</b><small>Watch current approach</small></span></button>
          <button class="order-button" id="select-all" type="button"><kbd>A</kbd><span><b>SELECT SQUAD</b><small>Retask as formation</small></span></button>
        </section>

        <section class="panel-section layer-section">
          <div class="section-title"><span>RENDER PIPELINE</span><small>LIVE</small></div>
          <div class="pipeline-card">
            <span class="pipeline-mark">G</span>
            <div><b>GHOSTLINK</b><small id="pipeline-backend">WEBGL2 POINT BUFFER</small></div>
            <span class="pipeline-state">ONLINE</span>
          </div>
          <div class="sensor-readout">
            <span><i></i> FLOORPLAN</span><span><i></i> MOTION</span><span><i></i> AUDIO</span><span><i></i> CONTACTS</span>
          </div>
        </section>

        <section class="panel-section help-section">
          <div class="section-title"><span>CONTROLS</span></div>
          <p><b>Click</b> issue move · <b>Wheel</b> zoom</p>
          <p><b>1–4</b> select · <b>Space</b> pause · <b>R</b> reset</p>
        </section>
      </aside>

      <section class="viewport-wrap">
        <canvas id="gl-canvas"></canvas>
        <canvas id="game-canvas"></canvas>
        <div class="viewport-corners" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        <div class="feed-label top-left"><span class="live-dot"></span><b id="feed-label">VOLUMETRIC RECONSTRUCTION</b><small>SECTOR C7 · FLOOR 01</small></div>
        <div class="feed-label top-right"><b id="timecode">00:00</b><small id="feed-quality">POINT LOCK 88%</small></div>
        <div class="zoom-readout"><button id="zoom-out" type="button">−</button><span id="zoom-value">92%</span><button id="zoom-in" type="button">+</button></div>
        <div class="retask-hint" id="retask-hint">CLICK MAP TO RETASK SELECTED UNIT</div>
        <div class="performance-hud" id="performance-hud">
          <span><small>FPS</small><b id="perf-fps">--</b></span>
          <span><small>STATIC PTS</small><b id="perf-static">--</b></span>
          <span><small>DYNAMIC PTS</small><b id="perf-dynamic">--</b></span>
          <span><small>CONTACTS</small><b id="perf-contacts">100</b></span>
          <span><small>DRAW CALLS</small><b id="perf-draws">2</b></span>
        </div>
      </section>

      <aside class="right-panel panel">
        <div class="section-title squad-title"><span>SQUAD TELEMETRY</span><small>4 / 4 LINKED</small></div>
        <div id="unit-cards" class="unit-cards"></div>
        <section class="squad-summary">
          <div><span>COMPOSURE</span><b id="composure">68%</b></div>
          <div><span>AMMUNITION</span><b id="ammo-total">90</b></div>
          <div><span>OBJECTIVE</span><b id="objective-state">ACTIVE</b></div>
        </section>
      </aside>
    </section>

    <footer class="event-bar">
      <div class="event-heading"><span>INCIDENT LOG</span><small>AUTOSCROLL</small></div>
      <div id="event-log" class="event-log"></div>
      <button id="reset-button" type="button">↻ RESET RUN</button>
    </footer>
  </main>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas")!;
const glCanvas = document.querySelector<HTMLCanvasElement>("#gl-canvas")!;
const context = canvas.getContext("2d", { alpha: true });
if (!context) throw new Error("Canvas 2D is unavailable");

const simulation = new Simulation();
const lidar = new LidarRenderer();
const gpuLidar = new GpuLidarRenderer(glCanvas, simulation.state.map);
const camera: Camera = { zoom: 1.1, panX: 0, panY: 0 };
let cssWidth = 1;
let cssHeight = 1;
let lastFrame = performance.now();
let lastRender = 0;
let lastUiUpdate = 0;

const roleIcon: Record<Unit["role"], string> = {
  MEDIC: "+",
  SCAVENGER: "▣",
  RANGER: "⌁",
  ENGINEER: "△",
};

const get = <T extends HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element ${selector}`);
  return element;
};

const resizeCanvas = (): void => {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  cssWidth = Math.max(1, rect.width);
  cssHeight = Math.max(1, rect.height);
  const pixelWidth = Math.round(cssWidth * ratio);
  const pixelHeight = Math.round(cssHeight * ratio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  if (glCanvas.width !== pixelWidth || glCanvas.height !== pixelHeight) {
    glCanvas.width = pixelWidth;
    glCanvas.height = pixelHeight;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
};

const configureRenderer = (): void => {
  get("#feed-label").textContent = gpuLidar.available ? "GPU POINT BUFFER // 2× FACILITY" : "VOLUMETRIC RECONSTRUCTION // FALLBACK";
  get("#feed-quality").textContent = gpuLidar.available ? "100 CONTACTS · 2 DRAWS" : "CANVAS FALLBACK";
  get("#pipeline-backend").textContent = gpuLidar.available ? "WEBGL2 POINT BUFFER" : "CANVAS GHOSTLINK FALLBACK";
};

const renderUnitCards = (): void => {
  const container = get<HTMLDivElement>("#unit-cards");
  container.innerHTML = simulation.state.units.map((unit) => `
    <button class="unit-card ${unit.selected ? "selected" : ""} ${unit.state === "down" ? "down" : ""}" data-unit="${unit.id}" type="button">
      <span class="unit-index">${unit.id}</span>
      <span class="unit-silhouette role-${unit.role.toLowerCase()}"><i>${roleIcon[unit.role]}</i></span>
      <span class="unit-info">
        <span class="unit-heading"><b>${unit.name}</b><small>${unit.role}</small></span>
        <span class="stat-line health"><i style="width:${unit.health}%"></i></span>
        <span class="unit-meta"><span>♥ ${Math.round(unit.health)}</span><span>▥ ${unit.ammo}/${unit.maxAmmo}</span><span>⚡ ${Math.round(unit.stress)}</span></span>
        <span class="unit-order">${unit.state === "collecting" ? "SECURING CACHE" : unit.state === "moving" ? "MOVING TO WAYPOINT" : unit.state === "down" ? "SIGNAL DOWN" : "HOLDING POSITION"}</span>
      </span>
    </button>
  `).join("");
  container.querySelectorAll<HTMLButtonElement>("[data-unit]").forEach((button) => {
    button.addEventListener("click", (event) => simulation.selectUnit(Number(button.dataset.unit), event.shiftKey));
  });
};

const updateUI = (): void => {
  const state = simulation.state;
  const livingContacts = gpuLidar.available ? gpuLidar.stats.contacts : state.contacts.filter((contact) => contact.alive).length;
  get("#threat-fill").style.width = `${state.threat * 100}%`;
  get("#contact-count").textContent = livingContacts.toString().padStart(2, "0");
  get("#signal-value").textContent = `${Math.round(89 + Math.sin(state.signalPulse * 0.8) * 4)}%`;
  get("#cache-fraction").textContent = state.cacheSecured ? "SECURED" : `${Math.round(state.cacheProgress * 100)}%`;
  get("#cache-copy").textContent = state.cacheSecured ? "Supplies escrowed for extraction" : state.cacheProgress > 0 ? "Squad transferring supplies" : "Locate and secure supplies";
  get("#cache-progress").style.width = `${state.cacheProgress * 100}%`;
  get("#objective-state").textContent = state.cacheSecured ? "COMPLETE" : "ACTIVE";
  get("#timecode").textContent = formatTime(state.elapsed);
  get("#zoom-value").textContent = `${Math.round(camera.zoom * 100)}%`;
  const selected = state.units.filter((unit) => unit.selected).length;
  get("#selected-count").textContent = `${selected} UNIT${selected === 1 ? "" : "S"}`;
  get("#pause-button").textContent = state.paused ? "▶ RESUME" : "Ⅱ PAUSE";
  get("#retask-hint").textContent = state.paused ? "PAUSED — ORDERS MAY STILL BE ISSUED" : "CLICK MAP TO RETASK SELECTED UNIT";
  get("#composure").textContent = `${Math.round(100 - state.units.reduce((sum, unit) => sum + unit.stress, 0) / state.units.length)}%`;
  get("#ammo-total").textContent = state.units.reduce((sum, unit) => sum + unit.ammo, 0).toString();
  if (gpuLidar.available) {
    get("#perf-fps").textContent = Math.round(gpuLidar.stats.fps).toString();
    get("#perf-static").textContent = `${Math.round(gpuLidar.stats.staticPoints / 1000)}K`;
    get("#perf-dynamic").textContent = `${Math.round(gpuLidar.stats.dynamicPoints / 100) / 10}K`;
    get("#perf-contacts").textContent = gpuLidar.stats.contacts.toString();
    get("#perf-draws").textContent = gpuLidar.stats.drawCalls.toString();
  } else {
    get("#performance-hud").classList.add("fallback");
  }
  get<HTMLDivElement>("#event-log").innerHTML = state.events.slice(0, 5).map((event) => `
    <div class="event ${event.tone}"><time>${formatTime(event.time)}</time><span><b>${event.who}</b>${event.message}</span></div>
  `).join("");
  renderUnitCards();
};

const frame = (now: number): void => {
  const frameInterval = simulation.state.paused ? 180 : 15;
  if (now - lastRender < frameInterval) {
    requestAnimationFrame(frame);
    return;
  }
  const dt = Math.min((now - lastFrame) / 1000, 0.06);
  lastFrame = now;
  lastRender = now;
  resizeCanvas();
  if (gpuLidar.available) simulation.updateBenchmark(dt);
  else simulation.update(dt);
  if (gpuLidar.available) {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    gpuLidar.render(cssWidth, cssHeight, ratio, simulation.state, camera);
    gpuLidar.renderOverlay(context, cssWidth, cssHeight, simulation.state);
  } else lidar.render(context, cssWidth, cssHeight, simulation.state, camera);
  if (now - lastUiUpdate > 350) {
    updateUI();
    lastUiUpdate = now;
  }
  requestAnimationFrame(frame);
};

get<HTMLButtonElement>("#pause-button").addEventListener("click", () => simulation.togglePause());
get<HTMLButtonElement>("#hold-order").addEventListener("click", () => simulation.issueHold());
get<HTMLButtonElement>("#select-all").addEventListener("click", () => simulation.selectAll());
get<HTMLButtonElement>("#move-order").addEventListener("click", () => get("#retask-hint").classList.add("attention"));
get<HTMLButtonElement>("#reset-button").addEventListener("click", () => simulation.reset());
get<HTMLButtonElement>("#zoom-in").addEventListener("click", () => { camera.zoom = Math.min(1.32, camera.zoom + 0.08); });
get<HTMLButtonElement>("#zoom-out").addEventListener("click", () => { camera.zoom = Math.max(0.68, camera.zoom - 0.08); });

canvas.addEventListener("click", (event) => {
  const rect = canvas.getBoundingClientRect();
  const screenPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  const transform = gpuLidar.available ? gpuLidar.transform : lidar.transform;
  if (transform) {
    const worldPoint = transform.toWorld(screenPoint);
    simulation.issueMove(gpuLidar.available ? gpuLidar.toSimulationWorld(worldPoint) : worldPoint);
  }
  get("#retask-hint").classList.remove("attention");
});
canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  camera.zoom = Math.max(0.68, Math.min(1.32, camera.zoom * (event.deltaY > 0 ? 0.93 : 1.07)));
}, { passive: false });

window.addEventListener("keydown", (event) => {
  if (event.key === " ") { event.preventDefault(); simulation.togglePause(); }
  else if (event.key.toLowerCase() === "a") simulation.selectAll();
  else if (event.key.toLowerCase() === "h") simulation.issueHold();
  else if (event.key.toLowerCase() === "r") simulation.reset();
  else if (["1", "2", "3", "4"].includes(event.key)) simulation.selectUnit(Number(event.key));
});

new ResizeObserver(resizeCanvas).observe(canvas);
configureRenderer();
updateUI();
requestAnimationFrame(frame);
