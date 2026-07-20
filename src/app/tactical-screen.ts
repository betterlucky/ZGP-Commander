import { distance, formatTime } from "../math";
import { tacticalAudio } from "../audio";
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

interface TacticalScreenOptions {
  demoMode?: boolean;
}

type DemoSensorStage = "zoom-in" | "zoom-out" | "settling" | "complete";

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
  options: TacticalScreenOptions = {},
): (() => void) => {
  const searchParams = new URLSearchParams(window.location.search);
  const benchmarkMode = searchParams.get("benchmark") === "1";
  const forceCanvas = searchParams.get("canvas") === "1";
  const demoMode = options.demoMode ?? false;
  const simulation = new Simulation({
    missionTitle: deployment.offer.title,
    objectiveLabel: deployment.offer.objective,
    riskLabel: deployment.offer.risk,
    threat: demoMode ? Math.min(deployment.offer.threat, 0.42) : deployment.offer.threat,
    cacheCount: deployment.offer.kind === "rescue" ? 1 : demoMode ? 3 : 6,
    guidedDemo: demoMode,
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
  if (demoMode) simulation.selectAll();
  const lastAmmo = new Map(simulation.state.units.map((unit) => [unit.id, unit.ammo]));
  let lastKillSequence = 0;
  let lastHitSequence = 0;
  let lastBreachSequence = 0;
  let lastCacheSequence = 0;
  let lastRunnerRushSequence = 0;

  root.innerHTML = `
    <main class="shell tactical-shell">
      <header class="topbar">
        <div class="brand-block"><span class="brand">HOLDFAST</span><span class="divider">//</span><span class="system-name">${demoMode ? "BUILD WEEK DEMO" : "GHOSTLINK"}</span></div>
        <div class="mission-block"><span class="eyebrow">ACTIVE ENGAGEMENT · ${deployment.offer.risk}</span><strong>${escapeHtml(deployment.offer.title.toUpperCase())}</strong></div>
        <div class="threat-block"><span>CONTACT PRESSURE</span><div class="threat-track"><i id="threat-fill"></i></div><b id="contact-count">--</b></div>
        <div class="status-block"><span class="signal-dot"></span><span>LINK <b id="signal-value">92%</b></span><button class="pause-button" id="pause-button" type="button">Ⅱ PAUSE</button></div>
      </header>

      <section class="workarea">
        <aside class="left-panel panel">
          <section class="panel-section objective-section">
            <div class="section-title"><span>OBJECTIVE</span><small>${deployment.offer.risk}</small></div>
            <div class="objective active"><span class="objective-icon">⬡</span><div><strong id="breach-heading">ENTRY BREACH CLOSED</strong><small id="breach-copy">Press F to open the marked entry</small></div></div>
            <div class="objective active"><span class="objective-icon">◇</span><div><strong>SALVAGE <b id="cache-fraction">0 / 0</b></strong><small id="cache-copy">Breach, then right-click a cache to recover it</small></div></div>
            <div class="progress"><i id="cache-progress"></i></div>
            <div class="objective ready"><span class="objective-icon">⌂</span><div><strong id="extraction-heading">EXTRACTION MARKED</strong><small id="extraction-copy">Return every standing survivor to the marked zone</small></div></div>
            <button class="extract-button" id="extract-button" type="button">CALL EXTRACTION</button>
          </section>

          <section class="panel-section order-section">
            <div class="section-title"><span>HIGH LEVEL ORDERS</span><small id="selected-count">1 UNIT</small></div>
            <button class="order-button primary" id="move-order" type="button"><kbd>RMB</kbd><span><b>MOVE / INTERACT</b><small>Right-click ground or cache</small></span></button>
            <button class="order-button" id="breach-order" type="button"><kbd>F</kbd><span><b>BREACH ENTRY</b><small>Open the landing-zone access</small></span></button>
            <button class="order-button" id="hold-order" type="button"><kbd>H</kbd><span><b>HOLD POSITION</b><small>Stop and engage</small></span></button>
            <button class="order-button" id="reload-order" type="button"><kbd>R</kbd><span><b>RELOAD</b><small>Stationary until complete</small></span></button>
            <button class="order-button" id="select-all" type="button"><kbd>^A</kbd><span><b>SELECT SQUAD</b><small>Retask as formation</small></span></button>
          </section>

          <section class="panel-section layer-section">
            <div class="section-title"><span>RENDER PIPELINE</span><small>LIVE</small></div>
            <div class="pipeline-card"><span class="pipeline-mark">G</span><div><b>GHOSTLINK</b><small id="pipeline-backend">WEBGL2 POINT BUFFER</small></div><span class="pipeline-state">ONLINE</span></div>
            <div class="sensor-readout"><span class="solid-cover"><i></i> SOLID / LOS BLOCK</span><span class="low-cover"><i></i> LOW / MOVE BLOCK</span><span><i></i> AUDIO</span><span><i></i> CONTACTS</span></div>
          </section>
        </aside>

        <section class="viewport-wrap">
          <canvas id="gl-canvas"></canvas><canvas id="game-canvas"></canvas>
          <div class="selection-box" id="selection-box"></div>
          <div class="viewport-corners" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
          <div class="feed-label top-left"><span class="live-dot"></span><b id="feed-label">TACTICAL RECONSTRUCTION</b><small>${escapeHtml(deployment.offer.location.toUpperCase())}</small></div>
          <div class="feed-label top-right"><b id="timecode">00:00</b><small id="feed-quality">LIVE CONTACT MODEL</small></div>
          ${demoMode ? `<div class="demo-guide" id="demo-guide" role="status" aria-live="polite"><small>GHOSTLINK SENSOR CHECK · 1/2</small><span><b>This is an unstable point-sensor reconstruction, not a camera feed.</b><em>Zoom all the way in to inspect the individual returns.</em></span></div>` : ""}
          <div class="runner-alert ${demoMode ? "with-guide" : ""}" id="runner-alert" role="alert"><small>FAST CONTACTS</small><b>RUNNER RUSH INCOMING</b><span>BRACE</span></div>
          <button class="viewport-extract-button" id="viewport-extract-button" type="button">CALL EXTRACTION · ALL STANDING SURVIVORS READY</button>
          <div class="zoom-readout"><button id="zoom-out" type="button">−</button><span id="zoom-value">110%</span><button id="zoom-in" type="button">+</button></div>
          <div class="retask-hint" id="retask-hint" role="status" aria-live="polite">DRAG SELECT · RMB MOVE / SCAVENGE · WASD PAN · DOUBLE-CLICK CARD / 1–9 FOCUS</div>
          <div class="performance-hud" id="performance-hud">
            <span><small>FPS</small><b id="perf-fps">--</b></span><span><small>STATIC PTS</small><b id="perf-static">--</b></span><span><small>DYNAMIC PTS</small><b id="perf-dynamic">--</b></span><span><small>CONTACTS</small><b id="perf-contacts">--</b></span><span><small>DRAW CALLS</small><b id="perf-draws">2</b></span>
          </div>
        </section>

        <aside class="right-panel panel">
          <div class="section-title squad-title"><span>SQUAD TELEMETRY</span><small id="linked-count">${deployment.people.length} LINKED</small></div>
          <div id="unit-cards" class="unit-cards tactical-unit-cards"></div>
          <section class="squad-summary"><div><span>COMPOSURE</span><b id="composure">--</b></div><div><span>AMMO LOADED</span><b id="loaded-total">--</b></div><div><span>NEUTRALISED</span><b id="neutralised">0</b></div></section>
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
  let gpuLidar: GpuLidarRenderer;
  try {
    gpuLidar = new GpuLidarRenderer(glCanvas, simulation.state.map, {
      benchmarkContacts: benchmarkMode,
      forceFallback: forceCanvas,
    });
  } catch (error) {
    console.warn("WebGL2 Ghostlink setup failed; using the Canvas fallback.", error);
    gpuLidar = new GpuLidarRenderer(glCanvas, simulation.state.map, { forceFallback: true });
  }
  const camera: Camera = { zoom: 0.94, panX: 0, panY: 0 };
  let cameraTransition: { startX: number; startY: number; targetX: number; targetY: number; startedAt: number; duration: number } | null = null;
  let cssWidth = 1;
  let cssHeight = 1;
  let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  let lastFrame = performance.now();
  let lastRender = 0;
  let lastUiUpdate = 0;
  let animationFrame = 0;
  let resolved = false;
  const resumeAudio = (): void => tacticalAudio.resume();
  let selectionDrag: { start: Vec2; current: Vec2; additive: boolean } | null = null;
  let panDrag: { start: Vec2; panX: number; panY: number } | null = null;
  let lastUnitCardsMarkup = "";
  let lastEventLogMarkup = "";
  let lastDemoGuideMarkup = "";
  let demoSensorStage: DemoSensorStage = demoMode ? "zoom-in" : "complete";
  let sensorCentered = !demoMode;
  let sensorReturnTimer: number | null = null;
  const pressedPanKeys = new Set<string>();
  let panVelocityX = 0;
  let panVelocityY = 0;

  const get = <T extends HTMLElement>(selector: string): T => {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing tactical element ${selector}`);
    return element;
  };

  const resizeCanvas = (): void => {
    const rect = canvas.getBoundingClientRect();
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    cssWidth = Math.max(1, rect.width);
    cssHeight = Math.max(1, rect.height);
    const pixelWidth = Math.round(cssWidth * pixelRatio);
    const pixelHeight = Math.round(cssHeight * pixelRatio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width = pixelWidth; canvas.height = pixelHeight; }
    if (glCanvas.width !== pixelWidth || glCanvas.height !== pixelHeight) { glCanvas.width = pixelWidth; glCanvas.height = pixelHeight; }
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  };

  const unitCards = get<HTMLDivElement>("#unit-cards");
  const renderUnitCards = (): void => {
    const markup = simulation.state.units.map((unit) => {
      const order = unit.state === "collecting" ? "SCAVENGING — DEFENCE REDUCED" : unit.state === "moving" ? "MOVING IN FORMATION — WEAPONS LIMITED" : unit.state === "reloading" ? `RELOADING · ${Math.max(0, unit.reloadTimer).toFixed(1)}S` : unit.state === "down" ? "INCAPACITATED · LINK ACTIVE" : "HOLDING · ENGAGING";
      return `
        <button class="unit-card ${unit.selected ? "selected" : ""} ${unit.state === "reloading" ? "reloading" : ""} ${unit.state === "down" ? "down" : ""}" data-unit="${unit.id}" type="button">
          <span class="unit-index">${unit.id}</span><span class="unit-silhouette role-${unit.role.toLowerCase()}"><i>${roleIcon[unit.role]}</i></span>
          <span class="unit-info"><span class="unit-heading"><b>${escapeHtml(unit.name)}</b><small>${unit.role} · ${unit.weapon.toUpperCase()}</small></span><span class="stat-line health"><i style="width:${unit.health}%"></i></span><span class="unit-meta"><span>♥ ${Math.round(unit.health)}</span><span>AMMO ${unit.ammo}/${unit.maxAmmo}</span><span class="reload-key">R RELOAD</span></span><span class="unit-order">${order}</span></span>
          ${unit.state === "reloading" ? `<span class="reload-flag">RELOAD ${Math.max(0, unit.reloadTimer).toFixed(1)}S</span>` : ""}
        </button>
      `;
    }).join("");
    if (markup === lastUnitCardsMarkup) return;
    lastUnitCardsMarkup = markup;
    unitCards.innerHTML = markup;
  };

  const unitCardClickHandler = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>("[data-unit]");
    if (!button || !unitCards.contains(button)) return;
    const unit = simulation.state.units.find((candidate) => candidate.id === Number(button.dataset.unit));
    if (!unit) return;
    simulation.selectUnit(unit.id, event.shiftKey);
    if (event.detail > 1 && !event.shiftKey) centerOnUnit(unit);
  };
  unitCards.addEventListener("click", unitCardClickHandler);

  const updateUI = (): void => {
    const state = simulation.state;
    const livingContacts = gpuLidar.available ? gpuLidar.stats.contacts : state.contacts.filter((contact) => contact.alive).length;
    get("#threat-fill").style.width = `${state.threat * 100}%`;
    get("#contact-count").textContent = livingContacts.toString().padStart(2, "0");
    get("#signal-value").textContent = `${Math.round(89 + Math.sin(state.signalPulse * .8) * 4)}%`;
    const recovered = state.caches.filter((cache) => cache.secured).length;
    const activeCache = state.caches.find((cache) => !cache.secured && cache.progress > 0);
    const retaskHint = get("#retask-hint");
    if (!activeCache && retaskHint.textContent?.includes("SCAVENGING")) {
      retaskHint.textContent = recovered ? "CACHE SECURED · EXTRACT OR PUSH DEEPER" : "SCAVENGE INTERRUPTED · ISSUE A NEW ORDER";
      retaskHint.classList.remove("attention");
    }
    get("#breach-heading").textContent = state.breachOpen ? "ENTRY BREACH OPEN" : "ENTRY BREACH CLOSED";
    get("#breach-copy").textContent = state.breachOpen ? "Interior access available" : "Press F to open the marked entry";
    get("#cache-fraction").textContent = `${recovered} / ${state.caches.length}`;
    get("#cache-copy").textContent = recovered === state.caches.length ? "All known caches recovered" : activeCache ? "Assigned scavenger transferring supplies; squad covering" : recovered ? "Extract now with partial salvage or continue" : state.breachOpen ? "Right-click a cache to assign the best scavenger" : "Breach, then recover any cache";
    get("#cache-progress").style.width = `${(activeCache?.progress ?? (recovered === state.caches.length ? 1 : 0)) * 100}%`;
    const demoGuide = root.querySelector<HTMLElement>("#demo-guide");
    if (!sensorCentered && currentTransform()) {
      sensorCentered = true;
      centerOnUnit(simulation.state.units[0]);
    }
    if (demoGuide) {
      const markup = demoSensorStage === "zoom-in"
        ? `<small>GHOSTLINK SENSOR CHECK · 1/2</small><span><b>This is an unstable point-sensor reconstruction, not a camera feed.</b><em>Zoom all the way in to inspect the individual returns.</em></span>`
        : demoSensorStage === "zoom-out"
          ? `<small>GHOSTLINK SENSOR CHECK · 2/2</small><span><b>Every figure is assembled from drifting sensor returns.</b><em>Zoom all the way back out to see the tactical picture.</em></span>`
          : demoSensorStage === "settling"
            ? `<small>SENSOR CHECK COMPLETE</small><span><b>The reconstruction is imperfect, but it is enough to command through.</b><em>Returning to command scale…</em></span>`
            : !state.breachOpen
              ? `<small>STEP 1 OF 3</small><span><b>Your whole squad is selected. Keep them together for now, or click a unit card to command someone independently.</b><em>Press F to breach the marked entry.</em></span>`
              : activeCache
                ? `<small>STEP 2 OF 3 · ${Math.round(activeCache.progress * 100)}%</small><span><b>Cache transfer in progress.</b><em>The scavenger is exposed; the rest of the selected squad covers automatically.</em></span>`
                : recovered === 0
                  ? `<small>STEP 2 OF 3</small><span><b>Right-click to move. Right-click a cache to start scavenging.</b><em>The best selected scavenger works while the rest of the squad covers.</em></span>`
                  : simulation.canExtract()
                    ? `<small>STEP 3 OF 3 · SQUAD READY</small><span><b>Click CALL EXTRACTION to bank the recovery.</b><em>Anything still in transit will arrive at the outpost after the mission.</em></span>`
                    : `<small>STEP 3 OF 3 · ${recovered}/${state.caches.length} SECURED</small><span><b>Right-click the marked landing zone to withdraw—or push deeper for more salvage.</b><em>Make sure every standing survivor comes home.</em></span>`;
      if (lastDemoGuideMarkup !== markup) {
        lastDemoGuideMarkup = markup;
        demoGuide.innerHTML = markup;
      }
    }
    get("#timecode").textContent = formatTime(state.elapsed);
    get("#zoom-value").textContent = `${Math.round(camera.zoom * 100)}%`;
    const zoomReadout = get(".zoom-readout");
    zoomReadout.classList.toggle("sensor-zoom-in", demoSensorStage === "zoom-in");
    zoomReadout.classList.toggle("sensor-zoom-out", demoSensorStage === "zoom-out");
    const selected = state.units.filter((unit) => unit.selected).length;
    get("#selected-count").textContent = `${selected} UNIT${selected === 1 ? "" : "S"}`;
    get("#pause-button").textContent = state.paused && state.missionStatus === "active" ? "▶ RESUME" : "Ⅱ PAUSE";
    get("#composure").textContent = `${Math.round(100 - state.units.reduce((sum, unit) => sum + unit.stress, 0) / state.units.length)}%`;
    const loadedRounds = state.units.reduce((sum, unit) => sum + unit.ammo, 0);
    const magazineCapacity = state.units.reduce((sum, unit) => sum + unit.maxAmmo, 0);
    get("#loaded-total").textContent = `${loadedRounds} / ${magazineCapacity}`;
    get("#neutralised").textContent = state.contactsNeutralised.toString();
    const runnerAlert = get("#runner-alert");
    runnerAlert.classList.toggle("active", state.runnerRushStatus !== "idle");
    runnerAlert.classList.toggle("warning", state.runnerRushStatus === "warning");
    runnerAlert.innerHTML = state.runnerRushStatus === "warning"
      ? `<small>FAST CONTACTS</small><b>RUNNER RUSH INCOMING</b><span>BRACE · ${Math.max(1, Math.ceil(state.runnerRushWarning))}</span>`
      : `<small>FAST CONTACTS</small><b>RUNNER RUSH</b><span>${state.runnerRushRemaining > 0 ? `HOLD · ${Math.ceil(state.runnerRushRemaining)}S` : "CLEAR REMAINING"}</span>`;
    const extractReady = simulation.canExtract();
    get("#extraction-heading").textContent = extractReady ? "SQUAD IN EXTRACTION" : recovered ? "WITHDRAWAL AVAILABLE" : "EXTRACTION MARKED";
    get("#extraction-copy").textContent = recovered ? (extractReady ? "Standing survivors ready for pickup" : `Return to landing with ${recovered} recovered cache${recovered === 1 ? "" : "s"}`) : "Recover at least one cache before withdrawing";
    const extractButton = get<HTMLButtonElement>("#extract-button");
    extractButton.textContent = extractReady ? "CALL EXTRACTION" : recovered ? "RETURN SQUAD TO LANDING" : "RECOVER A CACHE TO EXTRACT";
    extractButton.disabled = !extractReady;
    extractButton.classList.toggle("ready", extractReady);
    const viewportExtractButton = get<HTMLButtonElement>("#viewport-extract-button");
    viewportExtractButton.disabled = !extractReady;
    viewportExtractButton.classList.toggle("ready", extractReady);
    if (gpuLidar.available) {
      get("#perf-fps").textContent = Math.round(gpuLidar.stats.fps).toString();
      get("#perf-static").textContent = `${Math.round(gpuLidar.stats.staticPoints / 1000)}K`;
      get("#perf-dynamic").textContent = `${Math.round(gpuLidar.stats.dynamicPoints / 100) / 10}K`;
      get("#perf-contacts").textContent = gpuLidar.stats.contacts.toString();
      get("#perf-draws").textContent = gpuLidar.stats.drawCalls.toString();
    } else get("#performance-hud").classList.add("fallback");
    const eventLogMarkup = state.events.slice(0, 5).map((event) => `<div class="event ${event.tone}"><time>${formatTime(event.time)}</time><span><b>${escapeHtml(event.who)}</b>${escapeHtml(event.message)}</span></div>`).join("");
    if (eventLogMarkup !== lastEventLogMarkup) {
      lastEventLogMarkup = eventLogMarkup;
      get<HTMLDivElement>("#event-log").innerHTML = eventLogMarkup;
    }
    renderUnitCards();
  };

  const showResult = (outcome: TacticalOutcome): void => {
    if (resolved) return;
    resolved = true;
    handlers.onResolve(outcome);
    const showcaseComplete = demoMode;
    const resultEyebrow = showcaseComplete ? "BUILD WEEK SHOWCASE COMPLETE" : "GHOSTLINK SESSION CLOSED";
    const resultHeading = showcaseComplete
      ? outcome.success ? "LINK CLOSED. THE CAMPAIGN CONTINUES." : "LINK LOST. COMMAND CONTINUES."
      : outcome.success ? "OPERATION RESOLVED" : "OPERATION FAILED";
    const operationSummary = `${outcome.cachesRecovered} of ${outcome.cacheCount} caches recovered${outcome.objectiveCompleted ? "; the site was cleared." : "; the squad withdrew with partial salvage."} ${outcome.downPersonIds.length ? `${outcome.downPersonIds.length} survivor${outcome.downPersonIds.length === 1 ? " was" : "s were"} down when the link closed.` : "All linked survivors remained standing."}`;
    const resultCopy = showcaseComplete
      ? outcome.success
        ? `${operationSummary} This concludes the guided mission. In the full campaign, survivors retain their injuries, ammunition, equipment and individual histories; salvage returns to the outpost, where you assign personnel and choose the next opportunity.`
        : `${operationSummary} The link was lost, but the campaign is larger than one operation. In the full game, the outpost records the casualties and command continues with the survivors left behind. This still concludes the guided mission—you can reset the showcase and try a different withdrawal decision.`
      : operationSummary;
    const result = document.createElement("section");
    result.className = `mission-result ${outcome.success ? "success" : "failure"}`;
    result.innerHTML = `
      <div><small>${resultEyebrow}</small><h1>${resultHeading}</h1><p>${resultCopy}</p><section><span><small>RETURNED</small><b>${outcome.extractedPersonIds.length}</b></span><span><small>CACHES</small><b>${outcome.cachesRecovered}/${outcome.cacheCount}</b></span><span><small>NEUTRALISED</small><b>${outcome.contactsNeutralised}</b></span><span><small>AMMO LOADED</small><b>${outcome.loadedRounds}</b></span></section><div class="mission-result-actions"><button class="pause-button" id="return-to-base" type="button">${showcaseComplete ? "REVIEW OUTPOST CONSEQUENCES" : "RETURN TO OUTPOST COMMAND"}</button>${showcaseComplete ? `<a href="./">OPEN FULL CAMPAIGN</a>` : ""}</div></div>
    `;
    root.append(result);
    result.querySelector<HTMLButtonElement>("#return-to-base")?.addEventListener("click", handlers.onReturn);
  };

  const syncAudio = (): void => {
    const state = simulation.state;
    for (const unit of state.units) {
      const previousAmmo = lastAmmo.get(unit.id) ?? unit.ammo;
      if (unit.ammo < previousAmmo) tacticalAudio.fire(unit.weapon, unit.pos.x / state.map.width * 2 - 1);
      lastAmmo.set(unit.id, unit.ammo);
    }
    if (state.killSequence > lastKillSequence) tacticalAudio.contactDown();
    if (state.hitSequence > lastHitSequence) tacticalAudio.survivorHit();
    if (state.breachSequence > lastBreachSequence) tacticalAudio.breach();
    if (state.cacheSequence > lastCacheSequence) tacticalAudio.cacheSecured();
    if (state.runnerRushSequence > lastRunnerRushSequence) tacticalAudio.runnerRush();
    lastKillSequence = state.killSequence;
    lastHitSequence = state.hitSequence;
    lastBreachSequence = state.breachSequence;
    lastCacheSequence = state.cacheSequence;
    lastRunnerRushSequence = state.runnerRushSequence;
  };

  const updateCameraInput = (dt: number): void => {
    const horizontal = Number(pressedPanKeys.has("a") || pressedPanKeys.has("arrowleft")) - Number(pressedPanKeys.has("d") || pressedPanKeys.has("arrowright"));
    const vertical = Number(pressedPanKeys.has("w") || pressedPanKeys.has("arrowup")) - Number(pressedPanKeys.has("s") || pressedPanKeys.has("arrowdown"));
    const targetX = horizontal * 470;
    const targetY = vertical * 470;
    const response = 1 - Math.exp(-dt * (horizontal || vertical ? 13 : 18));
    panVelocityX += (targetX - panVelocityX) * response;
    panVelocityY += (targetY - panVelocityY) * response;
    if (!horizontal && Math.abs(panVelocityX) < 0.5) panVelocityX = 0;
    if (!vertical && Math.abs(panVelocityY) < 0.5) panVelocityY = 0;
    camera.panX += panVelocityX * dt;
    camera.panY += panVelocityY * dt;
  };

  const updateCameraTransition = (now: number): void => {
    if (!cameraTransition) return;
    const progress = Math.min(1, (now - cameraTransition.startedAt) / cameraTransition.duration);
    const eased = 1 - (1 - progress) ** 3;
    camera.panX = cameraTransition.startX + (cameraTransition.targetX - cameraTransition.startX) * eased;
    camera.panY = cameraTransition.startY + (cameraTransition.targetY - cameraTransition.startY) * eased;
    if (progress >= 1) cameraTransition = null;
  };

  const frame = (now: number): void => {
    const frameInterval = simulation.state.paused && !cameraTransition ? 180 : 15;
    if (now - lastRender < frameInterval) { animationFrame = requestAnimationFrame(frame); return; }
    const dt = Math.max(0, Math.min((now - lastFrame) / 1000, .06));
    lastFrame = now;
    lastRender = now;
    updateCameraInput(dt);
    updateCameraTransition(now);
    if (pixelRatio !== Math.min(window.devicePixelRatio || 1, 2)) resizeCanvas();
    if (benchmarkMode && gpuLidar.available) simulation.updateBenchmark(dt);
    else simulation.update(dt);
    syncAudio();
    if (gpuLidar.available) {
      gpuLidar.render(cssWidth, cssHeight, pixelRatio, simulation.state, camera);
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
    cameraTransition = null;
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
    if (demoSensorStage === "zoom-in" && camera.zoom >= 3.39) {
      demoSensorStage = "zoom-out";
      lastDemoGuideMarkup = "";
    } else if (demoSensorStage === "zoom-out" && camera.zoom <= 0.63) {
      demoSensorStage = "settling";
      lastDemoGuideMarkup = "";
      if (sensorReturnTimer !== null) window.clearTimeout(sensorReturnTimer);
      sensorReturnTimer = window.setTimeout(() => {
        if (demoSensorStage !== "settling") return;
        demoSensorStage = "complete";
        sensorReturnTimer = null;
        zoomAt({ x: cssWidth / 2, y: cssHeight / 2 }, 0.94);
        lastDemoGuideMarkup = "";
        updateUI();
      }, 900);
    }
  };

  const centerOnUnit = (unit: Unit): void => {
    const point = unitScreenPoint(unit);
    if (!point) return;
    panVelocityX = 0;
    panVelocityY = 0;
    cameraTransition = {
      startX: camera.panX,
      startY: camera.panY,
      targetX: camera.panX + cssWidth * 0.5 - point.x,
      targetY: camera.panY + cssHeight * 0.5 - point.y,
      startedAt: performance.now(),
      duration: 460,
    };
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
      cameraTransition = null;
      panVelocityX = 0;
      panVelocityY = 0;
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
    if (!simulation.state.breachOpen && worldPoint.y < simulation.state.map.breach.pos.y) {
      showHint("BREACH ENTRY BEFORE ISSUING INTERIOR ORDERS");
      return;
    }
    const cache = simulation.state.caches
      .filter((candidate) => !candidate.secured)
      .sort((a, b) => distance(worldPoint, a.pos) - distance(worldPoint, b.pos))[0];
    if (cache && distance(worldPoint, cache.pos) < 2.8) {
      const operator = simulation.issueScavenge(cache.id);
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
    tacticalAudio.resume();
    if (event.code === "Space") {
      event.preventDefault();
      // Space advances the guided deployment before this screen mounts. Keep
      // it reserved throughout the demo so that the same press—or a held-key
      // repeat—cannot freeze the sensor lesson as the tactical view appears.
      if (!demoMode) simulation.togglePause();
    }
    else if (event.key.toLowerCase() === "a" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); simulation.selectAll(); }
    else if (["a", "d", "w", "s", "arrowleft", "arrowright", "arrowup", "arrowdown"].includes(event.key.toLowerCase())) {
      event.preventDefault();
      cameraTransition = null;
      pressedPanKeys.add(event.key.toLowerCase());
    }
    else if (event.key.toLowerCase() === "h") simulation.issueHold();
    else if (event.key.toLowerCase() === "r") simulation.issueReload();
    else if (event.key.toLowerCase() === "f") showHint(simulation.issueBreach() ? "ENTRY BREACH OPEN" : simulation.state.breachOpen ? "ENTRY ALREADY OPEN" : "SELECT A SURVIVOR AT THE BREACH", !simulation.state.breachOpen);
    else if (/^[1-9]$/.test(event.key)) {
      const unit = simulation.state.units.find((candidate) => candidate.id === Number(event.key));
      if (unit) { simulation.selectUnit(unit.id); centerOnUnit(unit); }
    }
    else if (event.key === "+" || event.key === "=") zoomAt({ x: cssWidth / 2, y: cssHeight / 2 }, camera.zoom * 1.18);
    else if (event.key === "-") zoomAt({ x: cssWidth / 2, y: cssHeight / 2 }, camera.zoom / 1.18);
  };

  const keyUpHandler = (event: KeyboardEvent): void => {
    pressedPanKeys.delete(event.key.toLowerCase());
  };

  const blurHandler = (): void => {
    pressedPanKeys.clear();
  };

  get<HTMLButtonElement>("#pause-button").addEventListener("click", () => simulation.togglePause());
  get<HTMLButtonElement>("#hold-order").addEventListener("click", () => simulation.issueHold());
  get<HTMLButtonElement>("#reload-order").addEventListener("click", () => simulation.issueReload());
  get<HTMLButtonElement>("#select-all").addEventListener("click", () => simulation.selectAll());
  get<HTMLButtonElement>("#breach-order").addEventListener("click", () => showHint(simulation.issueBreach() ? "ENTRY BREACH OPEN" : simulation.state.breachOpen ? "ENTRY ALREADY OPEN" : "SELECT A SURVIVOR AT THE BREACH", !simulation.state.breachOpen));
  get<HTMLButtonElement>("#move-order").addEventListener("click", () => showHint("RIGHT-CLICK GROUND TO MOVE · RIGHT-CLICK CACHE TO SCAVENGE"));
  const callExtraction = (): void => {
    try { showResult(simulation.extract()); }
    catch (error) { showHint(error instanceof Error ? error.message.toUpperCase() : "EXTRACTION NOT READY"); }
  };
  get<HTMLButtonElement>("#extract-button").addEventListener("click", callExtraction);
  get<HTMLButtonElement>("#viewport-extract-button").addEventListener("click", callExtraction);
  get<HTMLButtonElement>("#zoom-in").addEventListener("click", () => zoomAt({ x: cssWidth / 2, y: cssHeight / 2 }, camera.zoom * 1.22));
  get<HTMLButtonElement>("#zoom-out").addEventListener("click", () => zoomAt({ x: cssWidth / 2, y: cssHeight / 2 }, camera.zoom / 1.22));
  canvas.addEventListener("pointerdown", pointerDownHandler);
  canvas.addEventListener("pointermove", pointerMoveHandler);
  canvas.addEventListener("pointerup", pointerUpHandler);
  canvas.addEventListener("pointercancel", pointerCancelHandler);
  canvas.addEventListener("contextmenu", contextMenuHandler);
  canvas.addEventListener("wheel", wheelHandler, { passive: false });
  window.addEventListener("keydown", keyHandler);
  window.addEventListener("keyup", keyUpHandler);
  window.addEventListener("blur", blurHandler);
  root.addEventListener("pointerdown", resumeAudio);
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
    if (sensorReturnTimer !== null) window.clearTimeout(sensorReturnTimer);
    gpuLidar.dispose();
    resizeObserver.disconnect();
    window.removeEventListener("keydown", keyHandler);
    window.removeEventListener("keyup", keyUpHandler);
    window.removeEventListener("blur", blurHandler);
    root.removeEventListener("pointerdown", resumeAudio);
    canvas.removeEventListener("pointerdown", pointerDownHandler);
    canvas.removeEventListener("pointermove", pointerMoveHandler);
    canvas.removeEventListener("pointerup", pointerUpHandler);
    canvas.removeEventListener("pointercancel", pointerCancelHandler);
    canvas.removeEventListener("contextmenu", contextMenuHandler);
    canvas.removeEventListener("wheel", wheelHandler);
    unitCards.removeEventListener("click", unitCardClickHandler);
  };
};
