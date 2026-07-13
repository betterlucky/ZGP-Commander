import { distance, formatTime } from "../math";
import { GpuLidarRenderer } from "../renderers/gpu-lidar";
import { LidarRenderer } from "../renderers/lidar";
import { makeIsoTransform } from "../renderers/shared";
import { Simulation } from "../sim";
import type { Deployment, MissionOutcome } from "../campaign/types";
import type { Camera, TacticalOutcome, Unit, Vec2 } from "../types";

interface TacticalScreenHandlers {
  onResolve(outcome: MissionOutcome): void;
  onReturn(): void;
}

const roleIcon: Record<Unit["role"], string> = {
  MEDIC: "+",
  SCAVENGER: "▣",
  RANGER: "⌁",
  ENGINEER: "△",
};

const baseScavengeSkill: Record<Unit["role"], number> = {
  MEDIC: 32,
  SCAVENGER: 82,
  RANGER: 42,
  ENGINEER: 56,
};

const escapeHtml = (value: string): string => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

export const mountTacticalScreen = (
  root: HTMLElement,
  deployment: Deployment,
  handlers: TacticalScreenHandlers,
): (() => void) => {
  const benchmarkMode = new URLSearchParams(window.location.search).get("benchmark") === "1";
  const simulation = new Simulation({
    missionTitle: deployment.offer.title,
    objectiveLabel: deployment.offer.objective,
    riskLabel: deployment.offer.risk,
    threat: deployment.offer.threat,
    units: deployment.people.map((person) => ({
      personId: person.id,
      name: person.callsign,
      role: person.role,
      color: person.color,
      weapon: person.weapon,
      health: Math.max(45, 100 + person.injuries.filter((injury) => injury.stat === "health").reduce((sum, injury) => sum + injury.modifier * 100, 0)),
      scavengeSkill: Math.min(99, baseScavengeSkill[person.role] + Math.min(14, person.career.missions * 2)),
    })),
  });

  root.innerHTML = `
    <main class="shell tactical-shell">
      <header class="topbar">
        <div class="brand-block"><span class="brand">HOLDFAST</span><span class="divider">//</span><span class="system-name">GHOSTLINK</span></div>
        <div class="mission-block"><span class="eyebrow">ACTIVE ENGAGEMENT · ${deployment.offer.risk}</span><strong>${escapeHtml(deployment.offer.title.toUpperCase())}</strong></div>
        <div class="threat-block"><span>CONTACT PRESSURE</span><div class="threat-track"><i id="threat-fill"></i></div><b id="contact-count">--</b></div>
        <div class="status-block"><span class="signal-dot"></span><span>LINK <b id="signal-value">92%</b></span><button class="pause-button" id="pause-button" type="button">Ⅱ PAUSE</button></div>
      </header>

      <section class="workarea">
        <aside class="left-panel panel">
          <section class="panel-section objective-section">
            <div class="section-title"><span>OBJECTIVE</span><small>${deployment.offer.risk}</small></div>
            <div class="objective active"><span class="objective-icon">◇</span><div><strong>CACHE TRANSFER <b id="cache-fraction">0%</b></strong><small id="cache-copy">Right-click the cache to assign the best scavenger</small></div></div>
            <div class="progress"><i id="cache-progress"></i></div>
            <div class="objective ready"><span class="objective-icon">⌂</span><div><strong id="extraction-heading">EXTRACTION MARKED</strong><small id="extraction-copy">Return every standing survivor to the marked zone</small></div></div>
            <button class="extract-button" id="extract-button" type="button">CALL EXTRACTION</button>
          </section>

          <section class="panel-section order-section">
            <div class="section-title"><span>HIGH LEVEL ORDERS</span><small id="selected-count">1 UNIT</small></div>
            <button class="order-button primary" id="move-order" type="button"><kbd>RMB</kbd><span><b>MOVE / INTERACT</b><small>Right-click ground or cache</small></span></button>
            <button class="order-button" id="hold-order" type="button"><kbd>H</kbd><span><b>HOLD POSITION</b><small>Stop and engage</small></span></button>
            <button class="order-button" id="reload-order" type="button"><kbd>R</kbd><span><b>RELOAD</b><small>Stationary until complete</small></span></button>
            <button class="order-button" id="select-all" type="button"><kbd>A</kbd><span><b>SELECT SQUAD</b><small>Retask as formation</small></span></button>
          </section>

          <section class="panel-section layer-section">
            <div class="section-title"><span>RENDER PIPELINE</span><small>LIVE</small></div>
            <div class="pipeline-card"><span class="pipeline-mark">G</span><div><b>GHOSTLINK</b><small id="pipeline-backend">WEBGL2 POINT BUFFER</small></div><span class="pipeline-state">ONLINE</span></div>
            <div class="sensor-readout"><span><i></i> FLOORPLAN</span><span><i></i> MOTION</span><span><i></i> AUDIO</span><span><i></i> CONTACTS</span></div>
          </section>
        </aside>

        <section class="viewport-wrap">
          <canvas id="gl-canvas"></canvas><canvas id="game-canvas"></canvas>
          <div class="selection-box" id="selection-box"></div>
          <div class="viewport-corners" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
          <div class="feed-label top-left"><span class="live-dot"></span><b id="feed-label">TACTICAL RECONSTRUCTION</b><small>${escapeHtml(deployment.offer.location.toUpperCase())}</small></div>
          <div class="feed-label top-right"><b id="timecode">00:00</b><small id="feed-quality">LIVE CONTACT MODEL</small></div>
          <div class="zoom-readout"><button id="zoom-out" type="button">−</button><span id="zoom-value">110%</span><button id="zoom-in" type="button">+</button></div>
          <div class="retask-hint" id="retask-hint">DRAG SELECT · RIGHT-CLICK MOVE / SCAVENGE · MIDDLE-DRAG PAN</div>
          <div class="performance-hud" id="performance-hud">
            <span><small>FPS</small><b id="perf-fps">--</b></span><span><small>STATIC PTS</small><b id="perf-static">--</b></span><span><small>DYNAMIC PTS</small><b id="perf-dynamic">--</b></span><span><small>CONTACTS</small><b id="perf-contacts">--</b></span><span><small>DRAW CALLS</small><b id="perf-draws">2</b></span>
          </div>
        </section>

        <aside class="right-panel panel">
          <div class="section-title squad-title"><span>SQUAD TELEMETRY</span><small id="linked-count">${deployment.people.length} LINKED</small></div>
          <div id="unit-cards" class="unit-cards tactical-unit-cards"></div>
          <section class="squad-summary"><div><span>COMPOSURE</span><b id="composure">--</b></div><div><span>AMMUNITION</span><b id="ammo-total">--</b></div><div><span>NEUTRALISED</span><b id="neutralised">0</b></div></section>
        </aside>
      </section>

      <footer class="event-bar"><div class="event-heading"><span>INCIDENT LOG</span><small>AUTOSCROLL</small></div><div id="event-log" class="event-log"></div><div class="operation-id"><small>OPERATION</small><b>${deployment.operationId.toUpperCase()}</b></div></footer>
    </main>
  `;

  const canvas = root.querySelector<HTMLCanvasElement>("#game-canvas")!;
  const glCanvas = root.querySelector<HTMLCanvasElement>("#gl-canvas")!;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) throw new Error("Canvas 2D is unavailable");
  const lidar = new LidarRenderer();
  const gpuLidar = new GpuLidarRenderer(glCanvas, simulation.state.map, { benchmarkContacts: benchmarkMode });
  const camera: Camera = { zoom: 0.94, panX: 0, panY: 0 };
  let cssWidth = 1;
  let cssHeight = 1;
  let lastFrame = performance.now();
  let lastRender = 0;
  let lastUiUpdate = 0;
  let animationFrame = 0;
  let resolved = false;
  let selectionDrag: { start: Vec2; current: Vec2; additive: boolean } | null = null;
  let panDrag: { start: Vec2; panX: number; panY: number } | null = null;

  const get = <T extends HTMLElement>(selector: string): T => {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing tactical element ${selector}`);
    return element;
  };

  const resizeCanvas = (): void => {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    cssWidth = Math.max(1, rect.width);
    cssHeight = Math.max(1, rect.height);
    const pixelWidth = Math.round(cssWidth * ratio);
    const pixelHeight = Math.round(cssHeight * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width = pixelWidth; canvas.height = pixelHeight; }
    if (glCanvas.width !== pixelWidth || glCanvas.height !== pixelHeight) { glCanvas.width = pixelWidth; glCanvas.height = pixelHeight; }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  const renderUnitCards = (): void => {
    const container = get<HTMLDivElement>("#unit-cards");
    container.innerHTML = simulation.state.units.map((unit) => {
      const order = unit.state === "collecting" ? "SCAVENGING — DEFENCE REDUCED" : unit.state === "moving" ? "MOVING IN FORMATION — WEAPONS LIMITED" : unit.state === "reloading" ? `RELOADING · ${Math.max(0, unit.reloadTimer).toFixed(1)}S` : unit.state === "down" ? "INCAPACITATED · LINK ACTIVE" : "HOLDING · ENGAGING";
      return `
        <button class="unit-card ${unit.selected ? "selected" : ""} ${unit.state === "down" ? "down" : ""}" data-unit="${unit.id}" type="button">
          <span class="unit-index">${unit.id}</span><span class="unit-silhouette role-${unit.role.toLowerCase()}"><i>${roleIcon[unit.role]}</i></span>
          <span class="unit-info"><span class="unit-heading"><b>${escapeHtml(unit.name)}</b><small>${unit.role}</small></span><span class="stat-line health"><i style="width:${unit.health}%"></i></span><span class="unit-meta"><span>♥ ${Math.round(unit.health)}</span><span>▥ ${unit.ammo}+${unit.reserveAmmo}</span><span>SCV ${unit.scavengeSkill}</span></span><span class="unit-order">${order}</span></span>
        </button>
      `;
    }).join("");
    container.querySelectorAll<HTMLButtonElement>("[data-unit]").forEach((button) => button.addEventListener("click", (event) => simulation.selectUnit(Number(button.dataset.unit), event.shiftKey)));
  };

  const updateUI = (): void => {
    const state = simulation.state;
    const livingContacts = gpuLidar.available ? gpuLidar.stats.contacts : state.contacts.filter((contact) => contact.alive).length;
    get("#threat-fill").style.width = `${state.threat * 100}%`;
    get("#contact-count").textContent = livingContacts.toString().padStart(2, "0");
    get("#signal-value").textContent = `${Math.round(89 + Math.sin(state.signalPulse * .8) * 4)}%`;
    get("#cache-fraction").textContent = state.cacheSecured ? "SECURED" : `${Math.round(state.cacheProgress * 100)}%`;
    get("#cache-copy").textContent = state.cacheSecured ? "Objective complete. Withdraw the squad." : state.cacheProgress > 0 ? "Assigned scavenger transferring supplies; squad covering" : "Right-click the cache to assign the best scavenger";
    get("#cache-progress").style.width = `${state.cacheProgress * 100}%`;
    get("#timecode").textContent = formatTime(state.elapsed);
    get("#zoom-value").textContent = `${Math.round(camera.zoom * 100)}%`;
    const selected = state.units.filter((unit) => unit.selected).length;
    get("#selected-count").textContent = `${selected} UNIT${selected === 1 ? "" : "S"}`;
    get("#pause-button").textContent = state.paused && state.missionStatus === "active" ? "▶ RESUME" : "Ⅱ PAUSE";
    get("#composure").textContent = `${Math.round(100 - state.units.reduce((sum, unit) => sum + unit.stress, 0) / state.units.length)}%`;
    get("#ammo-total").textContent = state.units.reduce((sum, unit) => sum + unit.ammo + unit.reserveAmmo, 0).toString();
    get("#neutralised").textContent = state.contactsNeutralised.toString();
    const extractReady = simulation.canExtract();
    get("#extraction-heading").textContent = extractReady ? "SQUAD IN EXTRACTION" : state.cacheSecured ? "RETURN TO EXTRACTION" : "EXTRACTION MARKED";
    get("#extraction-copy").textContent = state.cacheSecured ? (extractReady ? "Standing survivors ready for pickup" : "Move every standing survivor into the marked zone") : "Secure the objective before withdrawing";
    get<HTMLButtonElement>("#extract-button").classList.toggle("ready", extractReady);
    if (gpuLidar.available) {
      get("#perf-fps").textContent = Math.round(gpuLidar.stats.fps).toString();
      get("#perf-static").textContent = `${Math.round(gpuLidar.stats.staticPoints / 1000)}K`;
      get("#perf-dynamic").textContent = `${Math.round(gpuLidar.stats.dynamicPoints / 100) / 10}K`;
      get("#perf-contacts").textContent = gpuLidar.stats.contacts.toString();
      get("#perf-draws").textContent = gpuLidar.stats.drawCalls.toString();
    } else get("#performance-hud").classList.add("fallback");
    get<HTMLDivElement>("#event-log").innerHTML = state.events.slice(0, 5).map((event) => `<div class="event ${event.tone}"><time>${formatTime(event.time)}</time><span><b>${escapeHtml(event.who)}</b>${escapeHtml(event.message)}</span></div>`).join("");
    renderUnitCards();
  };

  const showResult = (outcome: TacticalOutcome): void => {
    if (resolved) return;
    resolved = true;
    handlers.onResolve(outcome);
    const result = document.createElement("section");
    result.className = `mission-result ${outcome.success ? "success" : "failure"}`;
    result.innerHTML = `
      <div><small>GHOSTLINK SESSION CLOSED</small><h1>${outcome.success ? "OPERATION RESOLVED" : "OPERATION FAILED"}</h1><p>${outcome.objectiveCompleted ? "The objective was secured." : "The objective was not secured."} ${outcome.downPersonIds.length ? `${outcome.downPersonIds.length} survivor${outcome.downPersonIds.length === 1 ? " was" : "s were"} down when the link closed.` : "All linked survivors remained standing."}</p><section><span><small>RETURNED</small><b>${outcome.extractedPersonIds.length}</b></span><span><small>DOWN</small><b>${outcome.downPersonIds.length}</b></span><span><small>CONTACTS</small><b>${outcome.contactsNeutralised}</b></span><span><small>AMMO LEFT</small><b>${outcome.ammunitionRemaining}</b></span></section><button class="pause-button" id="return-to-base" type="button">RETURN TO OUTPOST COMMAND</button></div>
    `;
    root.append(result);
    result.querySelector<HTMLButtonElement>("#return-to-base")?.addEventListener("click", handlers.onReturn);
  };

  const frame = (now: number): void => {
    const frameInterval = simulation.state.paused ? 180 : 15;
    if (now - lastRender < frameInterval) { animationFrame = requestAnimationFrame(frame); return; }
    const dt = Math.max(0, Math.min((now - lastFrame) / 1000, .06));
    lastFrame = now;
    lastRender = now;
    resizeCanvas();
    if (benchmarkMode && gpuLidar.available) simulation.updateBenchmark(dt);
    else simulation.update(dt);
    if (gpuLidar.available) {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      gpuLidar.render(cssWidth, cssHeight, ratio, simulation.state, camera);
      gpuLidar.renderOverlay(context, cssWidth, cssHeight, simulation.state);
    } else lidar.render(context, cssWidth, cssHeight, simulation.state, camera);
    if (now - lastUiUpdate > 250) { updateUI(); lastUiUpdate = now; }
    if (!resolved && simulation.state.missionStatus === "failure") showResult(simulation.outcome());
    animationFrame = requestAnimationFrame(frame);
  };

  const showHint = (message: string, attention = true): void => {
    const hint = get("#retask-hint");
    hint.textContent = message;
    hint.classList.toggle("attention", attention);
  };

  const canvasPoint = (event: PointerEvent | MouseEvent | WheelEvent): Vec2 => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const currentTransform = () => gpuLidar.available
    ? gpuLidar.transform
    : lidar.transform;

  const toSimulationWorld = (screenPoint: Vec2): Vec2 | null => {
    const transform = currentTransform();
    if (!transform) return null;
    const displayPoint = transform.toWorld(screenPoint);
    return gpuLidar.available ? gpuLidar.toSimulationWorld(displayPoint) : displayPoint;
  };

  const unitScreenPoint = (unit: Unit): Vec2 | null => {
    const transform = currentTransform();
    if (!transform) return null;
    return transform.toScreen(gpuLidar.available ? gpuLidar.toDisplayPoint(unit.pos) : unit.pos, 0.5);
  };

  const zoomAt = (screenPoint: Vec2, requestedZoom: number): void => {
    const transform = currentTransform();
    if (!transform) return;
    const displayPoint = transform.toWorld(screenPoint);
    camera.zoom = Math.max(0.62, Math.min(3.4, requestedZoom));
    const nextTransform = gpuLidar.available
      ? gpuLidar.previewTransform(cssWidth, cssHeight, camera)
      : makeIsoTransform(cssWidth, cssHeight, simulation.state.map, camera);
    const movedPoint = nextTransform.toScreen(displayPoint);
    camera.panX += screenPoint.x - movedPoint.x;
    camera.panY += screenPoint.y - movedPoint.y;
  };

  const updateSelectionBox = (): void => {
    const box = get<HTMLDivElement>("#selection-box");
    if (!selectionDrag) { box.classList.remove("active"); return; }
    const left = Math.min(selectionDrag.start.x, selectionDrag.current.x);
    const top = Math.min(selectionDrag.start.y, selectionDrag.current.y);
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.width = `${Math.abs(selectionDrag.current.x - selectionDrag.start.x)}px`;
    box.style.height = `${Math.abs(selectionDrag.current.y - selectionDrag.start.y)}px`;
    box.classList.add("active");
  };

  const pointerDownHandler = (event: PointerEvent): void => {
    if (event.button === 0) {
      selectionDrag = { start: canvasPoint(event), current: canvasPoint(event), additive: event.shiftKey };
      canvas.setPointerCapture(event.pointerId);
      updateSelectionBox();
    } else if (event.button === 1) {
      event.preventDefault();
      panDrag = { start: canvasPoint(event), panX: camera.panX, panY: camera.panY };
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add("panning");
    }
  };

  const pointerMoveHandler = (event: PointerEvent): void => {
    const point = canvasPoint(event);
    if (selectionDrag) {
      selectionDrag.current = point;
      updateSelectionBox();
    }
    if (panDrag) {
      camera.panX = panDrag.panX + point.x - panDrag.start.x;
      camera.panY = panDrag.panY + point.y - panDrag.start.y;
    }
  };

  const pointerUpHandler = (event: PointerEvent): void => {
    if (event.button === 0 && selectionDrag) {
      const drag = selectionDrag;
      const width = Math.abs(drag.current.x - drag.start.x);
      const height = Math.abs(drag.current.y - drag.start.y);
      const left = Math.min(drag.start.x, drag.current.x);
      const right = Math.max(drag.start.x, drag.current.x);
      const top = Math.min(drag.start.y, drag.current.y);
      const bottom = Math.max(drag.start.y, drag.current.y);
      const selectedIds = simulation.state.units.filter((unit) => {
        const point = unitScreenPoint(unit);
        if (!point) return false;
        if (width < 5 && height < 5) return distance(point, drag.current) < 18;
        return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
      }).map((unit) => unit.id);
      simulation.selectUnits(selectedIds, drag.additive);
      showHint(selectedIds.length ? `${selectedIds.length} UNIT${selectedIds.length === 1 ? "" : "S"} SELECTED` : "SELECTION CLEARED", false);
      selectionDrag = null;
      updateSelectionBox();
    }
    if (event.button === 1 && panDrag) {
      panDrag = null;
      canvas.classList.remove("panning");
    }
  };

  const contextMenuHandler = (event: MouseEvent): void => {
    event.preventDefault();
    const worldPoint = toSimulationWorld(canvasPoint(event));
    if (!worldPoint) return;
    if (distance(worldPoint, simulation.state.map.cache) < 2.8 && !simulation.state.cacheSecured) {
      const operator = simulation.issueScavenge();
      showHint(operator ? `${operator.name} SCAVENGING · SQUAD COVERING` : "SELECT A STANDING UNIT", !operator);
    } else {
      simulation.issueMove(worldPoint);
      showHint("FORMATION MOVE ORDER TRANSMITTED", false);
    }
  };

  const pointerCancelHandler = (event: PointerEvent): void => {
    selectionDrag = null;
    panDrag = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    canvas.classList.remove("panning");
    updateSelectionBox();
  };

  const wheelHandler = (event: WheelEvent): void => {
    event.preventDefault();
    zoomAt(canvasPoint(event), camera.zoom * (event.deltaY > 0 ? .86 : 1.16));
  };

  const keyHandler = (event: KeyboardEvent): void => {
    if (event.key === " ") { event.preventDefault(); simulation.togglePause(); }
    else if (event.key.toLowerCase() === "a") simulation.selectAll();
    else if (event.key.toLowerCase() === "h") simulation.issueHold();
    else if (event.key.toLowerCase() === "r") simulation.issueReload();
    else if (/^[1-9]$/.test(event.key)) simulation.selectUnit(Number(event.key));
    else if (event.key === "ArrowLeft") camera.panX += 42;
    else if (event.key === "ArrowRight") camera.panX -= 42;
    else if (event.key === "ArrowUp") camera.panY += 42;
    else if (event.key === "ArrowDown") camera.panY -= 42;
    else if (event.key === "+" || event.key === "=") zoomAt({ x: cssWidth / 2, y: cssHeight / 2 }, camera.zoom * 1.18);
    else if (event.key === "-") zoomAt({ x: cssWidth / 2, y: cssHeight / 2 }, camera.zoom / 1.18);
  };

  get<HTMLButtonElement>("#pause-button").addEventListener("click", () => simulation.togglePause());
  get<HTMLButtonElement>("#hold-order").addEventListener("click", () => simulation.issueHold());
  get<HTMLButtonElement>("#reload-order").addEventListener("click", () => simulation.issueReload());
  get<HTMLButtonElement>("#select-all").addEventListener("click", () => simulation.selectAll());
  get<HTMLButtonElement>("#move-order").addEventListener("click", () => showHint("RIGHT-CLICK GROUND TO MOVE · RIGHT-CLICK CACHE TO SCAVENGE"));
  get<HTMLButtonElement>("#extract-button").addEventListener("click", () => {
    try { showResult(simulation.extract()); }
    catch (error) { showHint(error instanceof Error ? error.message.toUpperCase() : "EXTRACTION NOT READY"); }
  });
  get<HTMLButtonElement>("#zoom-in").addEventListener("click", () => zoomAt({ x: cssWidth / 2, y: cssHeight / 2 }, camera.zoom * 1.22));
  get<HTMLButtonElement>("#zoom-out").addEventListener("click", () => zoomAt({ x: cssWidth / 2, y: cssHeight / 2 }, camera.zoom / 1.22));
  canvas.addEventListener("pointerdown", pointerDownHandler);
  canvas.addEventListener("pointermove", pointerMoveHandler);
  canvas.addEventListener("pointerup", pointerUpHandler);
  canvas.addEventListener("pointercancel", pointerCancelHandler);
  canvas.addEventListener("contextmenu", contextMenuHandler);
  canvas.addEventListener("wheel", wheelHandler, { passive: false });
  window.addEventListener("keydown", keyHandler);
  const resizeObserver = new ResizeObserver(resizeCanvas);
  resizeObserver.observe(canvas);
  get("#feed-label").textContent = benchmarkMode ? "GPU BENCHMARK // SYNTHETIC CONTACTS" : gpuLidar.available ? "GPU POINT BUFFER // LIVE SIMULATION" : "CANVAS GHOSTLINK FALLBACK";
  get("#feed-quality").textContent = benchmarkMode ? "100 SYNTHETIC CONTACTS" : "TACTICAL STATE LINKED";
  get("#pipeline-backend").textContent = gpuLidar.available ? "WEBGL2 POINT BUFFER" : "CANVAS GHOSTLINK FALLBACK";
  resizeCanvas();
  updateUI();
  animationFrame = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(animationFrame);
    resizeObserver.disconnect();
    window.removeEventListener("keydown", keyHandler);
    canvas.removeEventListener("pointerdown", pointerDownHandler);
    canvas.removeEventListener("pointermove", pointerMoveHandler);
    canvas.removeEventListener("pointerup", pointerUpHandler);
    canvas.removeEventListener("pointercancel", pointerCancelHandler);
    canvas.removeEventListener("contextmenu", contextMenuHandler);
    canvas.removeEventListener("wheel", wheelHandler);
  };
};
